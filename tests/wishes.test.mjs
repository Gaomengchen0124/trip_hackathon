import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWishServer } from '../server/wishes.mjs'
test('点赞撤销、重新点赞、重复请求及重启后的状态', async () => {
 const dir = await mkdtemp(join(tmpdir(),'wish-toggle-'))
 let server, base
 const start = async () => {
  server = await createWishServer({file:join(dir,'wishes.jsonl')})
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
  base = `http://127.0.0.1:${server.address().port}`
 }
 const close = () => { server.closeAllConnections?.(); return new Promise(resolve => server.close(resolve)) }
 const board = async viewer => (await fetch(base+'/api/wishes/board',{headers:{'X-Real-IP':viewer}})).json()
 try {
  await start()
  const response = await fetch(base+'/api/wishes',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5178'},body:JSON.stringify({requestId:'toggle-test-12345678',ip:'蜡笔小新',city:'日本',points:[],styles:[]})})
  assert.equal(response.status,201)
  const rejectedOrigin = await fetch(base+'/api/wishes',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.example'},body:'{}'})
  assert.equal(rejectedOrigin.status,403)
  const {id} = await response.json()
  const setLike = async (liked, viewer = '192.0.2.1') => {
   const res = await fetch(base+'/api/wishes/like',{method:'POST',headers:{'Content-Type':'application/json','X-Real-IP':viewer},body:JSON.stringify({id,liked})})
   assert.equal(res.status,200)
   return res.json()
  }
  assert.equal((await board('192.0.2.1'))[0].wishes[0].liked,false)
  assert.deepEqual(await setLike(false),{likes:0,liked:false})
  assert.deepEqual(await Promise.all([setLike(true),setLike(true)]),[{likes:1,liked:true},{likes:1,liked:true}])
  assert.equal((await board('192.0.2.1'))[0].wishes[0].liked,true)
  assert.equal((await board('192.0.2.2'))[0].wishes[0].liked,false)
  assert.deepEqual(await setLike(true,'192.0.2.2'),{likes:2,liked:true})
  assert.deepEqual(await Promise.all([setLike(false),setLike(false)]),[{likes:1,liked:false},{likes:1,liked:false}])
  await close(); await start()
  const refreshed = (await board('192.0.2.1'))[0]
  assert.equal(refreshed.likes,1)
  assert.equal(refreshed.wishes[0].likes,1)
  assert.equal(refreshed.wishes[0].liked,false)
  assert.equal((await board('192.0.2.2'))[0].wishes[0].liked,true)
  assert.deepEqual(await setLike(true),{likes:2,liked:true})
  await close(); await start()
  assert.equal((await board('192.0.2.1'))[0].wishes[0].liked,true)
  assert.deepEqual(await setLike(false),{likes:1,liked:false})
  assert.deepEqual(await setLike(false,'192.0.2.2'),{likes:0,liked:false})
  assert.deepEqual(await setLike(false),{likes:0,liked:false})
  assert.equal((await board('192.0.2.1'))[0].likes,0)
  const invalid = await fetch(base+'/api/wishes/like',{method:'POST',body:JSON.stringify({id,liked:'false'})})
  assert.equal(invalid.status,400)
 } finally {
  if (server?.listening) await close()
  await rm(dir,{recursive:true,force:true})
 }
})

test('持久化、幂等、校验与导出鉴权', async () => {
 const dir = await mkdtemp(join(tmpdir(),'wish-')); const options = {file:join(dir,'wishes.jsonl'),adminToken:'test-secret'}
 let server
 const start = async () => { server = await createWishServer(options); await new Promise(r=>server.listen(0,'127.0.0.1',r)); return `http://127.0.0.1:${server.address().port}` }
 const close = () => { server.closeAllConnections?.(); return new Promise(r=>server.close(r)) }
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
 // 榜单：公开、脱敏、分组正确
 const board = await (await fetch(base+'/api/wishes/board')).json()
 assert.equal(board.length,1); const g = board[0]
 assert.equal(g.ip,'<龙族>'); assert.equal(g.count,1); assert.equal(g.wishes.length,1)
 const wish = g.wishes[0]
 assert.equal(wish.email,undefined); assert.equal(wish.requestId,undefined); assert.equal(wish.notify,undefined); assert.equal(wish.likedBy,undefined); assert.equal(wish.status,undefined)
 assert.equal(wish.points[0],'虚构场景')
 // 点赞：幂等（同 IP 重复点只算一次）、跨记录独立、重启后保持
 const like = () => fetch(base+'/api/wishes/like',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:wish.id})})
 assert.deepEqual(await (await like()).json(),{likes:1,liked:true}); assert.deepEqual(await (await like()).json(),{likes:1,liked:true})
 assert.equal((await fetch(base+'/api/wishes/like',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404)
 const board2 = await (await fetch(base+'/api/wishes/board')).json(); assert.equal(board2[0].likes,1); assert.equal(board2[0].wishes[0].likes,1)
 // 状态：未授权被拒、非法状态被拒、合法状态生效且重启后保持
 const patch = status => fetch(base+`/api/wishes/${wish.id}/status`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer test-secret'},body:JSON.stringify({status})})
 assert.equal((await fetch(base+`/api/wishes/${wish.id}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{"status":"已收录"}'})).status,401)
 assert.equal((await patch('乱写')).status,400)
 assert.deepEqual(await (await patch('筹备中')).json(),{id:wish.id,status:'筹备中'})
 await close(); base = await start()
 const rows2 = await (await fetch(base+'/api/wishes/export',{headers:{Authorization:'Bearer test-secret'}})).json()
 assert.equal(rows2[0].status,'筹备中'); assert.equal(rows2[0].likes,1); assert.equal(rows2[0].likedBy.length,1)
 } finally { if(server?.listening) await close(); await rm(dir,{recursive:true,force:true}) }
})
