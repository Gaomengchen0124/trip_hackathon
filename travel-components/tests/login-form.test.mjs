import test from 'node:test'
import assert from 'node:assert/strict'
import { createLoginForm, DEMO_CODE } from '../src/auth/login-form.mjs'
test('validates phone and email before issuing a challenge', () => {
  const form = createLoginForm()
  for (const account of ['', '123', '12800000000', '+8613800000000']) assert.ok(form.send('phone', account))
  for (const account of ['', 'reader', 'reader@', 'a b@example.com']) assert.ok(form.send('email', account))
  assert.equal(form.send('email', ' reader@example.com '), '')
})
test('requires requesting code, rejects wrong code, consumes successful challenge', () => {
  const form = createLoginForm()
  assert.match(form.verify('phone', '13800000000', DEMO_CODE), /先获取/)
  assert.equal(form.send('phone', '13800000000'), '')
  assert.match(form.verify('phone', '13800000000', '123'), /6 位/)
  assert.match(form.verify('phone', '13800000000', '000000'), /不正确/)
  assert.equal(form.verify('phone', '13800000000', DEMO_CODE), '')
  assert.match(form.verify('phone', '13800000000', DEMO_CODE), /先获取/)
})
test('switching method or account cannot reuse a challenge or bypass cooldown', () => {
  const form = createLoginForm()
  form.send('phone', '13800000000')
  assert.match(form.verify('phone', '13900000000', DEMO_CODE), /账号已变更/)
  assert.match(form.verify('email', 'reader@example.com', DEMO_CODE), /账号已变更/)
  assert.match(form.send('email', 'reader@example.com'), /倒计时/)
})
test('countdown uses elapsed time, expires at five minutes, allows resending', () => {
  let time = 1000
  const form = createLoginForm({ now: () => time })
  form.send('email', 'reader@example.com')
  assert.equal(form.remaining(), 60)
  time += 59500
  assert.equal(form.remaining(), 1)
  time += 500
  assert.equal(form.remaining(), 0)
  time += 240000
  assert.match(form.verify('email', 'reader@example.com', DEMO_CODE), /过期/)
  assert.equal(form.send('email', 'reader@example.com'), '')
  assert.equal(form.verify('email', 'reader@example.com', DEMO_CODE), '')
})
