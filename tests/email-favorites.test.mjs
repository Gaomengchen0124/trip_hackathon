import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createAuthStore } from '../server/auth-store.mjs'
import { createAuthServer } from '../server/auth.mjs'
import { createEmailLogin } from '../server/email-login.mjs'
test('email verification: cooldown, expiration, retry limit, one use and delivery failure', async () => {
  let time = 1000, code
  const store = createAuthStore({ file: ':memory:', now: () => time })
  const login = createEmailLogin({ store, secret: 'test', sendEmail: async (_email, value) => { code = value } })
  try {
    await login.send('a@example.com', 'ip')
    await assert.rejects(login.send('a@example.com', 'ip'), /60 秒/)
    assert.throws(() => login.verify('b@example.com', code, 'ip'), /验证码/)
    const { user, token } = login.verify('a@example.com', code, 'ip')
    assert.equal(store.sessionUser(token).id, user.id)
    assert.throws(() => login.verify('a@example.com', code, 'ip'), /验证码/)
    time += 60001; await login.send('a@example.com', 'ip')
    for (let i = 0; i < 5; i++) assert.throws(() => login.verify('a@example.com', code === '000000' ? '111111' : '000000', 'ip'))
    assert.throws(() => login.verify('a@example.com', code, 'ip'))
    time += 60001; await login.send('a@example.com', 'ip'); time += 300000
    assert.throws(() => login.verify('a@example.com', code, 'ip'))
    const missing = createEmailLogin({ store })
    await assert.rejects(missing.send('x@example.com','ip'), /尚未配置/)
    const broken = createEmailLogin({ store, sendEmail: async () => { throw Error('secret failure') } })
    await assert.rejects(broken.send('x@example.com','ip'), /邮件发送失败/)
  } finally { store.close() }
})
test('HTTP email login sets cookie; favorites persist, stay isolated, can be removed, reject anonymous', async () => {
  const store = createAuthStore({ file: ':memory:' }), codes = new Map()
  const origin = 'http://localhost:5173'
  const server = createAuthServer({ store, origin, secure: false, sendEmail: async (email, code) => codes.set(email, code) })
  server.listen(0,'127.0.0.1'); await once(server,'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  const req = async (path, method='GET', body, cookie='') => fetch(base+path,{method, headers: { Origin: origin, Cookie: cookie, 'Content-Type':'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  async function login(email) {
    assert.equal((await req('/api/auth/email/send','POST',{email})).status,200)
    const response = await req('/api/auth/email/verify','POST',{email,code:codes.get(email)})
    assert.equal(response.status,200)
    assert.match(response.headers.get('set-cookie'),/HttpOnly/)
    return response.headers.get('set-cookie').split(';')[0]
  }
  try {
    const a = await login('a@example.com'), b = await login('b@example.com')
    assert.equal((await req('/api/favorites')).status,401)
    for (let i=0;i<2;i++) assert.deepEqual((await (await req('/api/favorites','PUT',{entityKey:'line:fanhua-shanghai',saved:true},a)).json()).favorites,['line:fanhua-shanghai'])
    assert.deepEqual((await (await req('/api/favorites','GET',undefined,b)).json()).favorites,[])
    assert.deepEqual((await (await req('/api/favorites','GET',undefined,a)).json()).favorites,['line:fanhua-shanghai'])
    assert.equal((await req('/api/favorites','PUT',{entityKey:'../bad',saved:true},a)).status,400)
    assert.deepEqual((await (await req('/api/favorites','PUT',{entityKey:'line:fanhua-shanghai',saved:false},a)).json()).favorites,[])
    await req('/api/auth/logout','POST',undefined,a)
    assert.equal((await req('/api/favorites','GET',undefined,a)).status,401)
  } finally { await new Promise(r=>server.close(r)); store.close() }
})
