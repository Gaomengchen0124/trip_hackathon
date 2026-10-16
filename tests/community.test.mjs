import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createAuthStore } from '../server/auth-store.mjs'
import { createAuthServer } from '../server/auth.mjs'
test('reporting is authenticated, unique, reviewable and cannot be reversed by its author', async()=>{
  let time=1000
  const store=createAuthStore({file:':memory:',now:()=>time})
  const a=store.verifiedIdentity('email','a@example.com'),b=store.verifiedIdentity('email','b@example.com')
  const id=store.addComment(a.id,'line:fanhua-shanghai','体验分享','request-community-0001')
  assert.throws(()=>store.addComment(a.id,'line:fanhua-shanghai','体验分享','request-community-0002'),/Duplicate/)
  time+=60001
  store.addComment(a.id,'line:fanhua-shanghai','体验分享','request-community-0003')
  const origin='http://localhost:5173',server=createAuthServer({store,origin,secure:false})
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const base=`http://127.0.0.1:${server.address().port}`
  const ca=`travel_session=${store.issueSession(a.id).token}`,cb=`travel_session=${store.issueSession(b.id).token}`
  const report=(cookie,reason='垃圾广告')=>fetch(base+'/api/comment-reports',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({commentId:id,reason})})
  try {
    assert.equal((await report('')).status,401)
    assert.equal((await report(ca)).status,400)
    assert.equal((await report(cb,'不允许的原因')).status,400)
    const first=await(await report(cb)).json(),second=await(await report(cb)).json()
    assert.equal(first.id,second.id)
    assert.equal(store.pendingReports().length,1)
    assert.equal(store.resolveReport(first.id,'hide'),true)
    assert.equal(store.listComments('line:fanhua-shanghai').some(row=>row.id===id),false)
    assert.equal(store.setCommentDeleted(a.id,id,'line:fanhua-shanghai',false),false)
    assert.equal(store.myComments(a.id).find(row=>row.id===id).moderatedAt,time)
    assert.equal(store.resolveReport(first.id,'hide'),false)
  } finally {await new Promise(r=>server.close(r));store.close()}
})
test('personal comment lists are private, paginated and include recoverable comments',async()=>{
  const store=createAuthStore({file:':memory:'}),origin='http://localhost:5173'
  const a=store.verifiedIdentity('email','a@example.com'),b=store.verifiedIdentity('email','b@example.com')
  for(let i=0;i<23;i++)store.addComment(a.id,'line:fanhua-shanghai',`分享${i}`,`request-personal-${i+1000}`)
  store.setCommentDeleted(a.id,1,'line:fanhua-shanghai',true)
  const server=createAuthServer({store,origin,secure:false});server.listen(0,'127.0.0.1');await once(server,'listening')
  const base=`http://127.0.0.1:${server.address().port}`
  const cookie=id=>`travel_session=${store.issueSession(id).token}`
  const ca=cookie(a.id),cb=cookie(b.id)
  try {
    assert.equal((await fetch(base+'/api/me/comments')).status,401)
    const page=await(await fetch(base+'/api/me/comments',{headers:{Cookie:ca}})).json()
    assert.equal(page.comments.length,20);assert.ok(page.nextCursor)
    const next=await(await fetch(base+`/api/me/comments?before=${page.nextCursor}`,{headers:{Cookie:ca}})).json()
    assert.equal(next.comments.length,3);assert.equal(next.comments.find(row=>row.id===1).deletedAt!==null,true)
    const other=await(await fetch(base+`/api/me/comments?user_id=${a.id}`,{headers:{Cookie:cb}})).json()
    assert.deepEqual(other.comments,[])
    assert.equal((await fetch(base+'/api/me/comments?before=bad',{headers:{Cookie:ca}})).status,400)
  } finally {await new Promise(r=>server.close(r));store.close()}
})
