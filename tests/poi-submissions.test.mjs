import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createPoiHandler } from '../server/poi-submissions.mjs'
test('点位投稿：持久化、照片权限、重复投稿、IP 必填、其他点和审核状态',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'poi-test-'));let server
 const options={directory,fetchImpl:async()=>({ok:true,json:async()=>({features:[]})}),adminToken:'test-review',allowedOrigins:['http://localhost:5198']}
 const start=async()=>{const handler=await createPoiHandler(options);server=createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`}
 const close=()=>new Promise(r=>server.close(r))
 try{
 let base=await start()
 const photo='data:image/jpeg;base64,'+(await readFile('public/img/sh-ip-01.jpg')).toString('base64')
 const payload={requestId:crypto.randomUUID(),lineId:'fanhua-shanghai',type:'ip',place:{name:'测试未收录点',address:'上海测试地址',lat:31.25,lng:121.46,source:'manual'},intro:'这是用于验证投稿流程的地点介绍，内容不会进入正式路线库。',scene:'这是用于验证 IP 情节必填规则的测试说明。',relation:'现实原型',edition:'原著',confirmed:true,photos:[photo]}
 const post=(body,headers={})=>fetch(base+'/api/poi-submissions',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)})
 assert.equal((await post({...payload,scene:''})).status,400)
 assert.equal((await post({...payload,photos:['data:image/jpeg;base64,YWJj']})).status,400)
 assert.equal((await post({...payload,place:{...payload.place,name:'国泰电影院'}})).status,400)
 assert.equal((await post(payload,{Origin:'http://evil.example'})).status,403)
 const [a,b]=await Promise.all([post(payload),post(payload)]);assert.equal(a.status,201);const row=await a.json();assert.equal(row.id,(await b.json()).id)
 assert.equal((await fetch(base+'/api/poi-submissions')).status,401)
 const headers={Authorization:'Bearer test-review'}
 assert.equal((await fetch(`${base}/api/poi-submissions/${row.id}/photos/0`)).status,401)
 const image=await fetch(`${base}/api/poi-submissions/${row.id}/photos/0`,{headers});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/jpeg')
 const patch=await fetch(`${base}/api/poi-submissions/${row.id}`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({status:'待收录',reviewNote:'位置和照片已核对'})});assert.equal(patch.status,200)
 assert.equal((await post({...payload,requestId:crypto.randomUUID(),type:'classic',scene:''})).status,201)
 const unavailable=await fetch(base+'/api/places?q=国泰&lineId=fanhua-shanghai');assert.equal(unavailable.status,200);assert.deepEqual((await unavailable.json()).results,[])
 await close();base=await start()
 const rows=await(await fetch(base+'/api/poi-submissions',{headers})).json();assert.equal(rows.length,2);assert.equal(rows.find(r=>r.id===row.id).status,'待收录')
 assert.equal((await readdir(directory)).filter(f=>f.endsWith('.json')).length,2)
 }finally{if(server?.listening)await close();await rm(directory,{recursive:true,force:true})}
})
test('在线搜索适配与结果坐标',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'poi-geo-'))
 const handler=await createPoiHandler({directory,fetchImpl:async url=>{assert.equal(url.hostname,'photon.komoot.io');return {ok:true,json:async()=>({features:[{properties:{name:'测试地点',street:'测试路',city:'上海市',osm_id:123},geometry:{coordinates:[121.4,31.2]}}]})}}})
 const server=createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r))
 try{const data=await(await fetch(`http://127.0.0.1:${server.address().port}/api/places?q=测试&lineId=fanhua-shanghai`)).json();assert.equal(data.results[0].lng,121.4);assert.equal(data.results[0].source,'photon')}finally{await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true})}
})
