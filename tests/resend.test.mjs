import test from 'node:test'
import assert from 'node:assert/strict'
import { configuredEmailSender, createEmailLogin } from '../server/email-login.mjs'
import { createAuthStore } from '../server/auth-store.mjs'
const env = { RESEND_API_KEY: ' test-only-key ', AUTH_EMAIL_FROM: '我的圣地巡礼 <login@mail.storyypilgrim.com>' }
test('Resend adapter sends configured sender, recipient and code with server authorization', async () => {
  let calls = 0
  const sender = configuredEmailSender(env, async (url, options) => {
    calls++
    assert.equal(url,'https://api.resend.com/emails')
    assert.equal(options.headers.Authorization,'Bearer test-only-key')
    assert.equal(options.method,'POST')
    const body=JSON.parse(options.body)
    assert.equal(body.from,env.AUTH_EMAIL_FROM)
    assert.deepEqual(body.to,['reader@example.com'])
    assert.match(body.text,/123456/)
    assert.ok(options.signal)
    return { ok:true, json:async()=>({id:'test-mail-id'}) }
  })
  await sender('reader@example.com','123456')
  assert.equal(calls,1)
  assert.equal(configuredEmailSender({RESEND_API_KEY:' ',AUTH_EMAIL_FROM:'x'}),undefined)
  assert.equal(configuredEmailSender({RESEND_API_KEY:'x'}),undefined)
})
test('provider failures do not expose its response, secret or code to login callers', async () => {
  const store=createAuthStore({file:':memory:'})
  try {
    for (const response of [{ok:false,status:403,json:async()=>({message:'sensitive-provider-body'})}, {ok:true,json:async()=>({})}]) {
      const sender=configuredEmailSender(env,async()=>response)
      const login=createEmailLogin({store,sendEmail:sender})
      await assert.rejects(login.send('reader@example.com','test-ip'), error => {
        assert.equal(error.status,502)
        assert.equal(error.message,'邮件发送失败，请稍后重试。')
        return true
      })
    }
  } finally {store.close()}
})
