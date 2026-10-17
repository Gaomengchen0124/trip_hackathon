import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import { createAuthStore } from '../server/auth-store.mjs'
import { createAuthServer } from '../server/auth.mjs'
import { authConfig, AUTH_PROJECT_ROOT } from '../server/auth-config.mjs'
import { createLocalAdmin } from '../scripts/create-local-admin.mjs'

test('version 8 retains recommendation data, passwords, favorites and sessions when reopened', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-auth-v8-'))
  let store, db
  try {
    const file = join(dir, 'auth.sqlite')
    store = createAuthStore({ file, adminEmails: [] })
    const user = store.verifiedIdentity('email', 'reader@example.com')
    store.setPassword(user.id, 'reader-secret-1')
    store.setFavorite(user.id, 'line:fanhua-shanghai', true)
    const { token } = store.issueSession(user.id)
    store.close(); store = null
    db = new DatabaseSync(file)
    db.exec('CREATE TABLE IF NOT EXISTS recommendation_profiles (user_id TEXT PRIMARY KEY REFERENCES users(id), interests TEXT NOT NULL, status TEXT NOT NULL, updated_at INTEGER NOT NULL); PRAGMA user_version=8')
    db.prepare('INSERT INTO recommendation_profiles VALUES(?,?,?,?)').run(user.id, '["literature"]', 'ready', 1234)
    db.close(); db = null
    store = createAuthStore({ file, adminEmails: [] })
    assert.equal(store.verifyPassword('reader@example.com', 'reader-secret-1').id, user.id)
    assert.equal(store.sessionUser(token).id, user.id)
    assert.deepEqual(store.listFavorites(user.id), ['line:fanhua-shanghai'])
    store.close(); store = null
    db = new DatabaseSync(file, { readOnly: true })
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8)
    assert.equal(db.prepare('SELECT interests FROM recommendation_profiles').get().interests, '["literature"]')
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { db?.close(); store?.close(); await rm(dir, { recursive: true, force: true }) }
})

test('unknown future schema is rejected without downgrading or changing user data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-auth-future-'))
  const file = join(dir, 'auth.sqlite')
  try {
    const db = new DatabaseSync(file)
    db.exec("CREATE TABLE future_data (value TEXT); INSERT INTO future_data VALUES('keep'); PRAGMA user_version=9")
    db.close()
    assert.throws(() => createAuthStore({ file }), /Unsupported database version/)
    const inspect = new DatabaseSync(file, { readOnly: true })
    try {
      assert.equal(inspect.prepare('PRAGMA user_version').get().user_version, 9)
      assert.equal(inspect.prepare('SELECT value FROM future_data').get().value, 'keep')
    } finally { inspect.close() }
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('configured administrator gets the role on the first verified email login', () => {
  const store = createAuthStore({ file: ':memory:', adminEmails: [' Boss@Example.com '] })
  try {
    assert.equal(store.verifiedIdentity('email', 'BOSS@example.com').role, 'admin')
    assert.equal(store.verifiedIdentity('email', 'reader@example.com').role, 'user')
    assert.equal(store.verifiedIdentity('phone', 'boss@example.com').role, 'user')
  } finally { store.close() }
})

test('local administrator provisioning persists a working password and refuses existing identities', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-auth-bootstrap-'))
  const file = join(dir, 'auth.sqlite')
  let store
  try {
    store = createAuthStore({ file, adminEmails: [] })
    const reader = store.verifiedIdentity('email', 'reader@example.com')
    store.setPassword(reader.id, 'reader-secret-1')
    store.close(); store = null
    const admin = createLocalAdmin({ file, email: ' Admin@Pilgrimage.test ' })
    assert.equal(admin.email, 'admin@pilgrimage.test')
    assert.equal(admin.user.role, 'admin')
    assert.throws(() => createLocalAdmin({ file, email: admin.email }), /账号已存在/)
    assert.throws(() => createLocalAdmin({ file, email: 'reader@example.com' }), /账号已存在/)
    store = createAuthStore({ file, adminEmails: [] })
    assert.equal(store.verifyPassword(admin.email, admin.password).role, 'admin')
    assert.equal(store.verifyPassword('reader@example.com', 'reader-secret-1').role, 'user')
    assert.equal(store.listUsers().users.length, 2)
    assert.throws(() => store.createLocalAdmin('short@example.com', 'short'), /8-128/)
    assert.equal(store.listUsers().users.length, 2)
    assert.equal(store.listAdminAudit().items[0].action, 'user.bootstrap-admin')
    store.close(); store = null
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const digest = db.prepare('SELECT digest FROM passwords WHERE user_id=?').get(admin.user.id).digest
      assert.match(digest, /^scrypt\$/)
      assert.ok(!digest.includes(admin.password))
    } finally { db.close() }
  } finally { store?.close(); await rm(dir, { recursive: true, force: true }) }
})

test('database paths are project-relative, with explicit absolute paths respected', () => {
  const original = process.cwd()
  try {
    process.chdir(tmpdir())
    assert.equal(authConfig({}).file, resolve(AUTH_PROJECT_ROOT, 'var/auth.sqlite'))
    assert.equal(authConfig({ AUTH_DATA_FILE: 'var/other.sqlite' }).file, resolve(AUTH_PROJECT_ROOT, 'var/other.sqlite'))
    const custom = join(tmpdir(), 'custom-auth.sqlite')
    assert.equal(authConfig({ AUTH_DATA_FILE: custom }).file, custom)
    assert.deepEqual(authConfig({ AUTH_ADDITIONAL_ORIGINS: ' http://localhost:5178, http://127.0.0.1:5178, ' }).additionalOrigins, ['http://localhost:5178', 'http://127.0.0.1:5178'])
    assert.throws(() => authConfig({ AUTH_PORT: 'NaN' }), /AUTH_PORT/)
  } finally { process.chdir(original) }
})

test('password login accepts only configured origins and replaces the previous session', async () => {
  const store = createAuthStore({ file: ':memory:', adminEmails: [] })
  const server = createAuthServer({ store, origin: 'http://localhost:5178', additionalOrigins: ['http://127.0.0.1:5178'], secure: false })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try {
    const base = 'http://127.0.0.1:' + server.address().port
    const reader = store.verifiedIdentity('email', 'reader@example.com')
    store.setPassword(reader.id, 'reader-secret-1')
    let previous = store.issueSession(reader.id).token
    for (const origin of ['http://localhost:5178', 'http://127.0.0.1:5178']) {
      const res = await fetch(base + '/api/auth/password/login', {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: 'travel_session=' + previous },
        body: JSON.stringify({ email: 'reader@example.com', password: 'reader-secret-1' }),
      })
      assert.equal(res.status, 200)
      assert.equal(store.sessionUser(previous), null)
      previous = res.headers.get('set-cookie').split(';')[0].split('=')[1]
      assert.equal(store.sessionUser(previous).id, reader.id)
    }
    for (const origin of ['https://evil.example', 'http://localhost:9999', 'null', undefined]) {
      const res = await fetch(base + '/api/auth/logout', { method: 'POST', headers: origin ? { Origin: origin } : {} })
      assert.equal(res.status, 403)
    }
  } finally { await new Promise(resolve => server.close(resolve)); store.close() }
})
