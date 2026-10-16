import test from 'node:test'
import assert from 'node:assert/strict'
import { createServerSession,authRequest } from '../src/auth/server-session.mjs'
test('expired service response clears login and failed logout does not pretend success',async()=>{
  const oldFetch=globalThis.fetch,oldWindow=globalThis.window
  globalThis.window=new EventTarget()
  const session=createServerSession()
  let mode='ok'
  globalThis.fetch=async()=>{
    if(mode==='offline')throw new Error('private network detail')
    return {ok:mode!=='expired',status:mode==='expired'?401:200,json:async()=>mode==='expired'?{error:'请先登录'}:{user:{id:'test-user',nickname:'测试读者'}}}
  }
  try {
    await session.refresh();assert.equal(session.getSnapshot().isLoggedIn,true)
    mode='offline';await session.logout()
    assert.equal(session.getSnapshot().isLoggedIn,true)
    assert.match(session.getSnapshot().notice,/无法连接/)
    mode='expired';await assert.rejects(authRequest('/api/favorites'))
    assert.equal(session.getSnapshot().isLoggedIn,false)
    assert.match(session.getSnapshot().notice,/失效/)
    mode='offline';await session.refresh()
    assert.equal(session.getSnapshot().loading,false)
    assert.match(session.getSnapshot().notice,/无法连接/)
  } finally {session.destroy();globalThis.fetch=oldFetch;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow}
})
