import test from 'node:test'
import assert from 'node:assert/strict'
import { createLoginGate } from '../src/auth/login-gate.mjs'
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
test('runs immediately for signed-in user without requesting login', async () => {
  const user = { id: 'demo-reader' }
  let calls = 0
  const gate = createLoginGate({ getUser: () => user, requestLogin: () => { throw new Error('unexpected') } })
  assert.equal(await gate.run(value => { assert.equal(value, user); calls++ }), true)
  assert.equal(calls, 1)
})
test('resumes once after login and coalesces repeated clicks', async () => {
  let user = null, calls = 0
  const login = deferred()
  const gate = createLoginGate({ getUser: () => user, requestLogin: () => login.promise })
  const first = gate.run(() => { calls++ })
  assert.equal(gate.run(() => { calls += 100 }), first)
  await Promise.resolve()
  user = { id: 'demo-reader' }; login.resolve(true)
  assert.equal(await first, true)
  assert.equal(calls, 1)
})
test('cancelled login does not run the action and permits retry', async () => {
  let calls = 0
  const gate = createLoginGate({ getUser: () => null, requestLogin: async () => false })
  assert.equal(await gate.run(() => calls++), false)
  assert.equal(await gate.run(() => calls++), false)
  assert.equal(calls, 0)
})
test('navigation or unmount cancels pending action even if login later succeeds', async () => {
  let user = null, calls = 0
  const login = deferred()
  const gate = createLoginGate({ getUser: () => user, requestLogin: () => login.promise })
  const pending = gate.run(() => calls++)
  await Promise.resolve(); gate.cancel()
  user = { id: 'demo-reader' }; login.resolve(true)
  assert.equal(await pending, false)
  assert.equal(calls, 0)
  assert.equal(await gate.run(() => calls++), true)
})
test('does not trust a success result without an authenticated user; failures permit retry', async () => {
  const noUser = createLoginGate({ getUser: () => null, requestLogin: async () => true })
  assert.equal(await noUser.run(() => assert.fail()), false)
  const gate = createLoginGate({ getUser: () => ({ id: 'demo-reader' }), requestLogin: async () => true })
  await assert.rejects(gate.run(() => { throw new Error('action failed') }))
  assert.equal(await gate.run(() => {}), true)
})
