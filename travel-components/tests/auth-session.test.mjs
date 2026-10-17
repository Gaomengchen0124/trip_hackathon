import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthSession, SESSION_KEY } from '../src/auth/session.mjs'
function memory() {
  const data = new Map()
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }
}
test('login restores same demo user, logout survives refresh, subscribers unsubscribe', () => {
  const storage = memory()
  const auth = createAuthSession({ storage })
  assert.equal(auth.getSnapshot().isLoggedIn, false)
  const seen = []
  const off = auth.subscribe(s => seen.push(s.isLoggedIn))
  auth.loginDemo()
  assert.equal(createAuthSession({ storage }).getSnapshot().user.id, auth.getSnapshot().user.id)
  auth.logout()
  assert.equal(createAuthSession({ storage }).getSnapshot().user, null)
  off()
  auth.loginDemo()
  assert.deepEqual(seen, [false, true, false])
})
test('malformed, unknown, future and expired records cannot restore an account', () => {
  const storage = memory()
  for (const value of ['{', 'null', JSON.stringify({ version: 1, userId: 'admin', createdAt: 100 }),
    JSON.stringify({ version: 1, userId: 'demo-reader', createdAt: 1001 }),
    JSON.stringify({ version: 1, userId: 'demo-reader', createdAt: -7 * 86400000 })]) {
    storage.setItem(SESSION_KEY, value)
    assert.equal(createAuthSession({ storage, now: () => 1000 }).getSnapshot().user, null)
  }
})
test('blocked storage keeps current page usable and reports persistence limits', () => {
  const fail = () => { throw new Error('blocked') }
  const auth = createAuthSession({ storage: { getItem: fail, setItem: fail, removeItem: fail } })
  auth.loginDemo()
  assert.equal(auth.getSnapshot().isLoggedIn, true)
  assert.match(auth.getSnapshot().notice, /当前页面/)
  auth.logout()
  assert.equal(auth.getSnapshot().user, null)
  assert.match(auth.getSnapshot().notice, /无法清除/)
})
test('other tabs synchronize login, logout and clear; destroy removes handler', () => {
  const storage = memory()
  const events = new EventTarget()
  const auth = createAuthSession({ storage, events })
  const other = createAuthSession({ storage })
  const send = key => { const event = new Event('storage'); event.key = key; events.dispatchEvent(event) }
  other.loginDemo(); send(SESSION_KEY)
  assert.equal(auth.getSnapshot().isLoggedIn, true)
  other.logout(); send(null)
  assert.equal(auth.getSnapshot().isLoggedIn, false)
  auth.destroy(); other.loginDemo(); send(SESSION_KEY)
  assert.equal(auth.getSnapshot().isLoggedIn, false)
})
