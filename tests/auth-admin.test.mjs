import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { createAuthStore } from '../server/auth-store.mjs'
import { createAuthServer } from '../server/auth.mjs'

async function mkServer(store) {
  const server = createAuthServer({ store, origin: 'http://localhost:5173', secure: false })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  return { server, base: `http://127.0.0.1:${server.address().port}` }
}
const cookieOf = store => userId => `travel_session=${store.issueSession(userId).token}`

test('ADMIN_EMAILS bootstrap grants admin role on open and survives reopening', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-auth-admin-'))
  let store
  try {
    const file = join(dir, 'auth.sqlite')
    store = createAuthStore({ file })
    const boss = store.verifiedIdentity('email', 'Boss@Example.com')
    const peon = store.verifiedIdentity('email', 'peon@example.com')
    store.close()
    store = createAuthStore({ file, adminEmails: ['boss@example.com'] })
    assert.equal(store.sessionUser(store.issueSession(boss.id).token).role, 'admin')
    assert.equal(store.sessionUser(store.issueSession(peon.id).token).role, 'user')
    // 追加新 admin 邮箱后重启即生效（幂等引导）
    store.verifiedIdentity('email', 'second@example.com')
    store.close()
    store = createAuthStore({ file, adminEmails: ['boss@example.com', 'SECOND@example.com'] })
    assert.equal(store.getUser ? undefined : undefined, undefined)
    assert.equal(store.sessionUser(store.issueSession(store.verifiedIdentity('email', 'second@example.com').id).token).role, 'admin')
  } finally { store?.close(); await rm(dir, { recursive: true, force: true }) }
})

test('admin endpoints: anonymous 401, non-admin 403, admin 200; last-admin protection', async () => {
  const store = createAuthStore({ file: ':memory:' })
  const { server, base } = await mkServer(store)
  try {
    const boss = store.verifiedIdentity('email', 'boss@example.com')
    const peon = store.verifiedIdentity('email', 'peon@example.com')
    store.setUserRole('bootstrap', boss.id, 'admin')
    const bossCookie = cookieOf(store)(boss.id), peonCookie = cookieOf(store)(peon.id)
    const opts = (cookie, method = 'GET', body) => ({ method, headers: { Origin: 'http://localhost:5173', Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })

    assert.equal((await fetch(base + '/api/manage/users')).status, 401)
    assert.equal((await fetch(base + '/api/manage/users', opts(peonCookie))).status, 403)
    const list = await (await fetch(base + '/api/manage/users', opts(bossCookie))).json()
    assert.equal(list.users.length, 2)
    assert.equal(list.users.find(u => u.id === boss.id).role, 'admin')
    assert.equal(list.users.find(u => u.id === peon.id).email, 'peon@example.com')
    assert.equal(list.preferencesAvailable, false)

    // 非 admin 改角色 → 403；admin 改自己不合法；提升 peon 为 admin
    assert.equal((await fetch(base + '/api/manage/users', { ...opts(peonCookie, 'PATCH', { id: boss.id, role: 'user' }) })).status, 403)
    assert.equal((await fetch(base + '/api/manage/users', opts(bossCookie, 'PATCH', { id: boss.id, role: 'user' }))).status, 400)
    assert.equal((await fetch(base + '/api/manage/users', opts(bossCookie, 'PATCH', { id: peon.id, role: 'admin' }))).status, 200)
    // 现在有两个 admin；peon 可以把 boss 降级
    assert.equal((await fetch(base + '/api/manage/users', opts(peonCookie, 'PATCH', { id: boss.id, role: 'user' }))).status, 200)
    assert.equal((await fetch(base + '/api/manage/users', opts(peonCookie))).status, 200)
    assert.equal((await fetch(base + '/api/manage/users', opts(bossCookie))).status, 403)

    // 举报处理：peon 发评论，boss2 举报（用新 admin = peon 自己不能举报自己，另建用户）
    const author = store.verifiedIdentity('email', 'author@example.com')
    const commentId = store.addComment(author.id, 'poi:sh-ip-01', '测试评论内容', 'req-1234567890abcd')
    const reporter = store.verifiedIdentity('email', 'reporter@example.com')
    store.reportComment(reporter.id, commentId, '垃圾广告')
    const pending = await (await fetch(base + '/api/manage/reports?status=pending', opts(peonCookie))).json()
    assert.equal(pending.reports.length, 1)
    assert.equal(pending.reports[0].content, '测试评论内容')
    assert.equal((await fetch(base + '/api/manage/reports', opts(peonCookie, 'PATCH', { id: pending.reports[0].id, action: 'hide' }))).status, 200)
    const after = await (await fetch(base + '/api/manage/reports?status=pending', opts(peonCookie))).json()
    assert.equal(after.reports.length, 0)

    // admin 删除/恢复任意评论
    assert.equal((await fetch(base + '/api/manage/comments', opts(peonCookie, 'DELETE') )).status, 400)
    assert.equal((await fetch(`${base}/api/manage/comments?id=${commentId}`, opts(peonCookie, 'DELETE'))).status, 200)
    assert.equal((await fetch(base + '/api/manage/comments', opts(peonCookie, 'PATCH', { id: commentId, action: 'restore' }))).status, 200)

    // 审计日志记录了上述操作
    const audit = await (await fetch(base + '/api/manage/audit', opts(peonCookie))).json()
    const actions = audit.items.map(i => i.action)
    assert.ok(actions.includes('user.set-role'))
    assert.ok(actions.includes('report.hide'))
    assert.ok(actions.includes('comment.hide'))
  } finally { await new Promise(resolve => server.close(resolve)); store.close() }
})

test('last admin cannot be demoted', async () => {
  const store = createAuthStore({ file: ':memory:' })
  try {
    const solo = store.verifiedIdentity('email', 'solo@example.com')
    store.setUserRole('bootstrap', solo.id, 'admin')
    assert.throws(() => store.setUserRole('bootstrap', solo.id, 'user'), /至少保留一名管理员/)
  } finally { store.close() }
})
