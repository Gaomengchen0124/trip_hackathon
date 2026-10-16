import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { createAuthStore } from '../server/auth-store.mjs'
import { createAuthServer, sessionCookie } from '../server/auth.mjs'
test('identities, profiles and hashed sessions survive reopening; expiry and revocation apply', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-auth-'))
  let store, time = 1000
  try {
    const file = join(dir, 'auth.sqlite')
    store = createAuthStore({ file, now: () => time })
    const user = store.verifiedIdentity('email', ' Reader@example.com ')
    assert.equal(store.verifiedIdentity('email', 'reader@example.com').id, user.id)
    assert.notEqual(store.verifiedIdentity('email', 'other@example.com').id, user.id)
    const session = store.issueSession(user.id)
    store.updateProfile(user.id, { nickname: '卡其读者', avatar: '叶' })
    store.setFavorite(user.id, 'line:fanhua-shanghai', true)
    assert.equal(store.sessionUser('demo-reader'), null)
    store.close(); store = createAuthStore({ file, now: () => time })
    assert.equal(store.sessionUser(session.token).nickname, '卡其读者')
    assert.deepEqual(store.listFavorites(user.id), ['line:fanhua-shanghai'])
    const { DatabaseSync } = await import('node:sqlite')
    const inspect = new DatabaseSync(file)
    assert.notEqual(inspect.prepare('SELECT token_hash FROM sessions').get().token_hash, session.token)
    inspect.close()
    store.revoke(session.token); assert.equal(store.sessionUser(session.token), null)
    const second = store.issueSession(user.id)
    time += 7 * 86400000
    assert.equal(store.sessionUser(second.token), null)
  } finally { store?.close(); await rm(dir, { recursive: true, force: true }) }
})
test('HTTP rejects anonymous writes, cross-origin requests and forged cookies; logout revokes', async () => {
  const store = createAuthStore({ file: ':memory:' })
  const server = createAuthServer({ store, origin: 'http://localhost:5173', secure: false })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const profile = (cookie, origin = 'http://localhost:5173', body = { nickname: '真实会话读者', avatar: '山' }) => fetch(base + '/api/auth/profile', { method: 'PATCH', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal((await (await fetch(base + '/api/auth/session')).json()).user, null)
    assert.equal((await profile('travel_session=demo-reader')).status, 401)
    const user = store.verifiedIdentity('email', 'reader@example.com')
    const { token } = store.issueSession(user.id)
    const cookie = `travel_session=${token}`
    assert.equal((await profile(cookie, 'https://evil.example')).status, 403)
    assert.equal((await profile(cookie, 'http://localhost:5173', null)).status, 400)
    const updated = await (await profile(cookie)).json()
    assert.equal(updated.user.id, user.id)
    assert.equal(updated.user.nickname, '真实会话读者')
    const outsider = store.verifiedIdentity('email', 'other@example.com')
    const otherCookie = `travel_session=${store.issueSession(outsider.id).token}`
    const current = await (await fetch(base + '/api/auth/session', { headers: { Cookie: otherCookie } })).json()
    assert.equal(current.user.nickname, '巡礼读者')
    const logout = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, Origin: 'http://localhost:5173' } })
    assert.match(logout.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=0/)
    assert.equal(store.sessionUser(token), null)
    assert.match(sessionCookie('abc'), /Secure/)
    assert.equal((await fetch(base + '/api/auth/login', { method: 'POST', headers: { Origin: 'http://localhost:5173' } })).status, 404)
  } finally { await new Promise(resolve => server.close(resolve)); store.close() }
})
