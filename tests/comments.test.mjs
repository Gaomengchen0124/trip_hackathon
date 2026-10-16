import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAuthStore } from '../server/auth-store.mjs'
import { createAuthServer } from '../server/auth.mjs'
test('comments persist, paginate by entity and replay idempotently', async () => {
  const dir = await mkdtemp(join(tmpdir(),'travel-comments-'))
  const file = join(dir,'auth.sqlite')
  let store = createAuthStore({file})
  try {
    const user = store.verifiedIdentity('email','reader@example.com')
    const id = store.addComment(user.id,'line:fanhua-shanghai','<script>alert(1)</script>','request-comment-0001')
    assert.equal(store.addComment(user.id,'line:fanhua-shanghai','<script>alert(1)</script>','request-comment-0001'),id)
    assert.throws(()=>store.addComment(user.id,'poi:other','different','request-comment-0001'))
    for(let i=0;i<25;i++) store.addComment(user.id,'line:fanhua-shanghai',`记录${i}`,`request-comment-${i+1000}`)
    assert.equal(store.listComments('poi:other').length,0)
    const page = store.listComments('line:fanhua-shanghai')
    assert.equal(page.length,21)
    const second = store.listComments('line:fanhua-shanghai',page[19].id)
    assert.equal(second.length,6)
    store.close();store=createAuthStore({file})
    assert.equal(store.listComments('line:fanhua-shanghai').length,21)
  } finally { store.close();await rm(dir,{recursive:true,force:true}) }
})
test('HTTP public list, authenticated author, limits, replay and invalid content', async()=>{
  const store=createAuthStore({file:':memory:'})
  const origin='http://localhost:5173', server=createAuthServer({store,origin,secure:false})
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const base=`http://127.0.0.1:${server.address().port}`
  const user=store.verifiedIdentity('email','reader@example.com')
  const cookie=`travel_session=${store.issueSession(user.id).token}`
  const payload={entityKey:'poi:sh-ip-01',content:'值得再来',requestId:'request-comment-0001',user_id:'attacker'}
  const post=(body,c=cookie,o=origin)=>fetch(base+'/api/comments',{method:'POST',headers:{Origin:o,Cookie:c,'Content-Type':'application/json'},body:JSON.stringify(body)})
  try {
    assert.equal((await post(payload,'')).status,401)
    assert.equal((await post(payload,cookie,'https://evil.example')).status,403)
    assert.equal((await post({...payload,content:' '})).status,400)
    assert.equal((await post({...payload,content:'字'.repeat(1001)})).status,400)
    assert.equal((await post(payload)).status,201)
    assert.equal((await post(payload)).status,201)
    const page=await(await fetch(base+'/api/comments?entityKey=poi:sh-ip-01')).json()
    assert.equal(page.comments.length,1)
    assert.equal(page.comments[0].authorId,user.id)
    assert.equal(page.comments[0].content,'值得再来')
    assert.equal('email' in page.comments[0],false)
    assert.equal((await fetch(base+'/api/comments?entityKey=poi:sh-ip-01&before=bad')).status,400)
    for(let i=0;i<8;i++) await post({...payload,requestId:`request-comment-${i+2000}`})
    assert.equal((await post({...payload,requestId:'request-comment-overlimit'})).status,429)
  } finally {await new Promise(r=>server.close(r));store.close()}
})
test('delete and restore enforce owner, hide from public lists, persist and keep v3 data', async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const dir=await mkdtemp(join(tmpdir(),'travel-comment-delete-')), file=join(dir,'auth.sqlite')
  const old=new DatabaseSync(file)
  old.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,nickname TEXT NOT NULL,avatar TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE comments(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,entity_key TEXT NOT NULL,content TEXT NOT NULL,request_id TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(user_id,request_id));
    INSERT INTO users VALUES('existing-user','原有读者','',1);
    INSERT INTO comments(user_id,entity_key,content,request_id,created_at) VALUES('existing-user','line:fanhua-shanghai','原有评论','legacy-comment-0001',1);
    PRAGMA user_version=3;`)
  old.close()
  let store=createAuthStore({file})
  let server
  try {
    assert.equal(store.listComments('line:fanhua-shanghai')[0].content,'原有评论')
    const other=store.verifiedIdentity('email','other@example.com')
    const ownCookie=`travel_session=${store.issueSession('existing-user').token}`
    const otherCookie=`travel_session=${store.issueSession(other.id).token}`
    const origin='http://localhost:5173'
    server=createAuthServer({store,origin,secure:false}); server.listen(0,'127.0.0.1');await once(server,'listening')
    const base=`http://127.0.0.1:${server.address().port}`
    const del=(cookie,originValue=origin)=>fetch(base+'/api/comments?entityKey=line:fanhua-shanghai&id=1',{method:'DELETE',headers:{Cookie:cookie,Origin:originValue}})
    assert.equal((await del('')).status,401)
    assert.equal((await del(otherCookie)).status,404)
    assert.equal((await del(ownCookie,'https://evil.example')).status,403)
    assert.equal((await del(ownCookie)).status,200)
    assert.equal((await del(ownCookie)).status,200)
    assert.equal(store.listComments('line:fanhua-shanghai').length,0)
    const restore=(cookie)=>fetch(base+'/api/comments',{method:'PATCH',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({entityKey:'line:fanhua-shanghai',id:1,action:'restore'})})
    assert.equal((await restore(otherCookie)).status,404)
    assert.equal((await restore(ownCookie)).status,200)
    assert.equal(store.listComments('line:fanhua-shanghai').length,1)
    await del(ownCookie)
    await new Promise(r=>server.close(r));server=null
    store.close();store=createAuthStore({file})
    assert.equal(store.listComments('line:fanhua-shanghai').length,0)
    assert.equal(store.setCommentDeleted('existing-user',1,'line:fanhua-shanghai',false),true)
    assert.equal(store.listComments('line:fanhua-shanghai')[0].nickname,'原有读者')
  } finally {if(server)await new Promise(r=>server.close(r));store.close();await rm(dir,{recursive:true,force:true})}
})
