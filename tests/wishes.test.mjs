import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWishServer } from '../server/wishes.mjs'
test('持久化、幂等、校验与导出鉴权', async () => {
 const dir = await mkdtemp(join(tmpdir(),'wish-')); const options = {file:join(dir,'wishes.jsonl'),adminToken:'test-secret'}
 let server
 const start = async () => { server = await createWishServer(options); await new Promise(r=>server.listen(0,'127.0.0.1',r)); return `http://127.0.0.1:${server.address().port}` }
 const close = () => new Promise(r=>server.close(r))
 try {
 let base = await start()
 const body = {requestId:'12345678-1234-1234-1234-123456789012',ip:'<龙族>',city:'北京',points:['虚构场景'],styles:['深度探索'],notify:false,email:'private@example.com'}
 const post = value => fetch(base+'/api/wishes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})
 const [a,b] = await Promise.all([post(body),post(body)]); assert.equal(a.status,201); assert.deepEqual(await a.json(),await b.json())
 assert.equal((await post({...body,ip:''})).status,400)
 assert.equal((await post({...body,notify:true,email:'invalid'})).status,400)
 assert.equal((await fetch(base+'/api/wishes/export')).status,401)
 await close(); base = await start()
 const rows = await (await fetch(base+'/api/wishes/export',{headers:{Authorization:'Bearer test-secret'}})).json()
 assert.equal(rows.length,1); assert.equal(rows[0].email,''); assert.equal(rows[0].ip,'<龙族>')
 const summary = await (await fetch(base+'/api/wishes/summary',{headers:{Authorization:'Bearer test-secret'}})).json(); assert.equal(summary[0].count,1)
 } finally { if(server?.listening) await close(); await rm(dir,{recursive:true,force:true}) }
})
