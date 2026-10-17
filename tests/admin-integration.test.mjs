import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { createAuthStore } from '../server/auth-store.mjs'
import { createAuthServer } from '../server/auth.mjs'
import { createWishServer } from '../server/wishes.mjs'
import { createContentStore } from '../server/content-store.mjs'
import { createContentServer } from '../server/content.mjs'

test('integration: cookie session from auth server passes content and wishes admin gates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-integration-'))
  const authStore = createAuthStore({ file: ':memory:' })
  const boss = authStore.verifiedIdentity('email', 'boss@example.com')
  authStore.setUserRole('bootstrap', boss.id, 'admin')
  const peon = authStore.verifiedIdentity('email', 'peon@example.com')
  const { token: bossToken } = authStore.issueSession(boss.id)
  const { token: peonToken } = authStore.issueSession(peon.id)

  const auth = createAuthServer({ store: authStore, origin: 'http://localhost:5173', secure: false })
  auth.listen(0, '127.0.0.1'); await once(auth, 'listening')
  const authBase = `http://127.0.0.1:${auth.address().port}`

  const contentStore = createContentStore({ file: ':memory:' })
  const content = createContentServer({ store: contentStore, origin: 'http://localhost:5173', uploadsDir: join(dir, 'uploads'), submissionsDir: join(dir, 'submissions'), bundledLinesDir: join(dir, 'bundled'), authBase })
  content.listen(0, '127.0.0.1'); await once(content, 'listening')
  const contentBase = `http://127.0.0.1:${content.address().port}`

  const wishes = await createWishServer({ file: join(dir, 'wishes.jsonl'), adminToken: 't', allowedOrigins: ['http://localhost:5173'], authBaseUrl: authBase })
  wishes.listen(0, '127.0.0.1'); await once(wishes, 'listening')
  const wishesBase = `http://127.0.0.1:${wishes.address().port}`

  try {
    // auth session 响应带 role
    const session = await (await fetch(`${authBase}/api/auth/session`, { headers: { cookie: `travel_session=${bossToken}` } })).json()
    assert.equal(session.user.role, 'admin')
    const anon = await (await fetch(`${authBase}/api/auth/session`, { headers: { cookie: `travel_session=${peonToken}` } })).json()
    assert.equal(anon.user.role, 'user')

    // content：admin cookie 200 / 普通用户 cookie 403 / 无 cookie 401
    assert.equal((await fetch(`${contentBase}/api/manage/content/ips`, { headers: { cookie: `travel_session=${bossToken}` } })).status, 200)
    assert.equal((await fetch(`${contentBase}/api/manage/content/ips`, { headers: { cookie: `travel_session=${peonToken}` } })).status, 403)
    assert.equal((await fetch(`${contentBase}/api/manage/content/ips`)).status, 401)

    // wishes overview：admin cookie 通过；Bearer 兼容仍可用；非 admin cookie 401
    assert.equal((await fetch(`${wishesBase}/api/wishes/overview`, { headers: { cookie: `travel_session=${bossToken}` } })).status, 200)
    assert.equal((await fetch(`${wishesBase}/api/wishes/overview`, { headers: { cookie: `travel_session=${peonToken}` } })).status, 401)
    assert.equal((await fetch(`${wishesBase}/api/wishes/overview`, { headers: { authorization: 'Bearer t' } })).status, 200)

    // auth 管理端点带 role 拦截
    assert.equal((await fetch(`${authBase}/api/manage/stats`, { headers: { cookie: `travel_session=${peonToken}` } })).status, 403)
    const stats = await (await fetch(`${authBase}/api/manage/stats`, { headers: { cookie: `travel_session=${bossToken}` } })).json()
    assert.equal(stats.users, 2)
    assert.equal(stats.preferencesAvailable, false)
  } finally {
    for (const s of [content, wishes, auth]) await new Promise(r => s.close(r))
    authStore.close(); contentStore.close()
    await rm(dir, { recursive: true, force: true })
  }
})
