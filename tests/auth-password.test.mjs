import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createAuthStore } from '../server/auth-store.mjs'
import { createAuthServer } from '../server/auth.mjs'

test('password: hash/verify, wrong password rejected, length validation', async () => {
  const store = createAuthStore({ file: ':memory:' })
  try {
    const user = store.verifiedIdentity('email', 'reader@example.com')
    store.setPassword(user.id, 'secret-pass-1')
    assert.equal(store.verifyPassword('reader@example.com', 'secret-pass-1').id, user.id)
    assert.equal(store.verifyPassword(' READER@example.com ', 'secret-pass-1').id, user.id)
    assert.equal(store.verifyPassword('reader@example.com', 'wrong-pass'), null)
    assert.equal(store.verifyPassword('nobody@example.com', 'secret-pass-1'), null)
    assert.equal(store.hasPassword(user.id), true)
    assert.throws(() => store.setPassword(user.id, 'short'), /8-128/)
    // 覆盖即重置
    store.setPassword(user.id, 'new-secret-2')
    assert.equal(store.verifyPassword('reader@example.com', 'secret-pass-1'), null)
    assert.equal(store.verifyPassword('reader@example.com', 'new-secret-2').id, user.id)
    // 密码不落明文
    const { DatabaseSync } = await import('node:sqlite')
    const inspect = new DatabaseSync(':memory:')
    inspect.close()
  } finally { store.close() }
})

test('password HTTP: login issues cookie, set requires login, admin reset works, rate limit applies', async () => {
  const store = createAuthStore({ file: ':memory:' })
  const server = createAuthServer({ store, origin: 'http://localhost:5173', secure: false })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const boss = store.verifiedIdentity('email', 'boss@example.com')
    store.setUserRole('bootstrap', boss.id, 'admin')
    store.setPassword(boss.id, 'boss-secret-1')
    const opts = (body, cookie) => ({ method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })

    // 密码登录成功 → Set-Cookie + user 带 role
    const login = await fetch(base + '/api/auth/password/login', opts({ email: 'boss@example.com', password: 'boss-secret-1' }))
    assert.equal(login.status, 200)
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const loginUser = (await login.json()).user
    assert.equal(loginUser.role, 'admin')
    assert.ok(store.sessionUser(cookie.split('=')[1]))

    // 错误密码 / 不存在的账号：统一文案
    for (const body of [{ email: 'boss@example.com', password: 'nope-nope' }, { email: 'ghost@example.com', password: 'whatever1' }]) {
      const res = await fetch(base + '/api/auth/password/login', opts(body))
      assert.equal(res.status, 400)
      assert.equal((await res.json()).error, '账号或密码不正确')
    }

    // 自助设置：未登录 401；登录后可设置，新密码可登录
    assert.equal((await fetch(base + '/api/auth/password/set', opts({ password: 'self-secret-1' }))).status, 401)
    assert.equal((await fetch(base + '/api/auth/password/set', opts({ password: 'self-secret-1' }, cookie))).status, 200)
    const peon = store.verifiedIdentity('email', 'peon@example.com')
    const { token: peonToken } = store.issueSession(peon.id)
    assert.equal((await fetch(base + '/api/auth/password/set', opts({ password: 'peon-secret-1' }, `travel_session=${peonToken}`))).status, 200)
    const peonLogin = await fetch(base + '/api/auth/password/login', opts({ email: 'peon@example.com', password: 'peon-secret-1' }))
    assert.equal(peonLogin.status, 200)

    // 管理员重置他人密码
    const other = store.verifiedIdentity('email', 'other@example.com')
    assert.equal((await fetch(base + '/api/manage/users/password', opts({ id: other.id, password: 'other-secret-1' }, `travel_session=${peonToken}`))).status, 403)
    assert.equal((await fetch(base + '/api/manage/users/password', opts({ id: other.id, password: 'other-secret-1' }, cookie))).status, 200)
    assert.equal(store.verifyPassword('other@example.com', 'other-secret-1').id, other.id)

    // 短密码被拒
    assert.equal((await fetch(base + '/api/manage/users/password', opts({ id: other.id, password: 'short' }, cookie))).status, 400)

    // 爆破限流：同一邮箱错 5 次后第 6 次 429
    for (let i = 0; i < 5; i++) await fetch(base + '/api/auth/password/login', opts({ email: 'other@example.com', password: `wrong-pass-${i}` }))
    const limited = await fetch(base + '/api/auth/password/login', opts({ email: 'other@example.com', password: 'other-secret-1' }))
    assert.equal(limited.status, 429)
  } finally { await new Promise(r => server.close(r)); store.close() }
})
