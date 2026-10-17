import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {once} from 'node:events'
import {randomUUID} from 'node:crypto'
import {createContentStore} from '../server/content-store.mjs'
import {createContentValidator} from '../server/content-validate.mjs'
import {createWishWorkflow} from '../server/wish-workflow.mjs'
import {createContentServer} from '../server/content.mjs'
import {mergeWishPlans,newCityLine} from '../src/utils/wish-import.mjs'

const source=()=>({id:'W-one',ip:'测试作品',city:'上海',points:['外滩','武康路'],scene:'场景线索',styles:['拍照'],clues:'待核实',status:'待整理',email:'private@example.test',notify:true,createdAt:'2026-10-17T00:00:00Z'})
const document=()=>({_schema:'ip-v1',ip:{ipId:'flow-test',name:'测试作品',author:'',kind:'film',cover:'',aliases:[]},lines:{}})
const req={headers:{cookie:'admin=1'}}
function fixture(store){
 const wishes=[source()];let failSync=false
 const fetchImpl=async(url,opts={})=>{
  if(url.endsWith('/api/auth/session'))return {ok:true,json:async()=>({user:opts.headers?.cookie==='admin=1'?{id:'admin',role:'admin'}:null})}
  if(url.endsWith('/export'))return {ok:true,json:async()=>structuredClone(wishes)}
  if(failSync)throw new Error('offline')
  const body=JSON.parse(opts.body),wish=wishes.find(w=>url.includes(w.id))
  if(!wish)return {ok:false,status:404}
  if(wish.status!==body.expectedStatus&&wish.status!==body.status)return {ok:false,status:409}
  wish.status=body.status;return {ok:true,json:async()=>({status:wish.status})}
 }
 const workflow=createWishWorkflow({store,validator:createContentValidator(),fetchImpl,wishesBase:'http://wishes',ensureIp:async id=>store.getIp(id)})
 return {workflow,wishes,fetchImpl,setFail:v=>{failSync=v}}
}
const operation=()=>({operationId:randomUUID(),doc:document(),plans:[{wishId:'W-one',cityKey:'上海',points:['外滩','武康路']}]})

test('导入合并点位、拆城市、重复来源；私有邮箱不进入来源快照',()=>{
 const doc=document();doc.lines.上海=newCityLine('flow-test','测试作品','上海')
 doc.lines.上海.ipStops=[{poiId:'existing',name:'外滩',intro:'已核实的介绍'}]
 const plans=[{wishId:'W-one',cityKey:'上海',points:['外滩']},{wishId:'W-one',cityKey:'上海',points:['武康路']}]
 const merged=mergeWishPlans(doc,plans,[source()])
 assert.equal(merged.links.length,1);assert.equal(merged.doc.lines.上海.ipStops.length,2)
 assert.equal(merged.doc.lines.上海.ipStops[0].intro,'已核实的介绍')
 assert.equal(merged.links[0].poiIds.length,2);assert.ok(!JSON.stringify(merged).includes('private@example'))
 const again=mergeWishPlans(merged.doc,plans,[source()],merged.links)
 assert.equal(again.doc.lines.上海.ipStops.length,2);assert.deepEqual(again.links[0].poiIds,merged.links[0].poiIds)
 assert.throws(()=>mergeWishPlans(doc,[{wishId:'W-one',cityKey:'上海/北京',points:[]}],[source()]))
})

test('导入原子保存、幂等重试、版本冲突及草稿校验',async()=>{
 const store=createContentStore({file:':memory:'});const {workflow,wishes}=fixture(store)
 try{
  const body=operation();const first=await workflow.import(req,body,'admin')
  assert.equal(first.syncPending,false);assert.equal(wishes[0].status,'筹备中')
  const version=first.ip.updatedAt;await workflow.import(req,body,'admin')
  assert.equal(store.getIp('flow-test').updatedAt,version);assert.equal(store.wishLinks().length,1)
  assert.deepEqual(store.onlineLines(),{})
  await assert.rejects(workflow.import(req,{...body,plans:[]},'admin'),e=>e.status===409)
  await assert.rejects(workflow.import(req,{operationId:randomUUID(),targetIpId:'flow-test',expectedUpdatedAt:0,plans:body.plans},'admin'),e=>e.status===409)
  assert.throws(()=>store.saveIp('flow-test',first.ip.doc,'other',version-1),e=>e.status===409)
  const invalid=operation();invalid.doc.ip.ipId='bad-test';invalid.doc.ip.kind='nonsense'
  await assert.rejects(workflow.import(req,invalid,'admin'),e=>e.status===400)
  assert.equal(store.getIp('bad-test'),null)
  const mismatched=operation();mismatched.doc.ip.ipId='other-test';mismatched.doc.ip.name='另一作品'
  await assert.rejects(workflow.import(req,mismatched,'admin'),e=>e.status===400)
  assert.equal(store.getIp('other-test'),null)
  mismatched.confirmDifferentWork=true
  assert.equal((await workflow.import(req,mismatched,'admin')).ip.ipId,'other-test')
 }finally{store.close()}
})

test('状态服务失败后持久化重试，不重复创建；解除关联后不再回写状态',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wish-flow-'));let store=createContentStore({file:join(dir,'data.sqlite')})
 try{
  let f=fixture(store);f.setFail(true);const body=operation()
  assert.equal((await f.workflow.import(req,body,'admin')).syncPending,true)
  assert.equal(store.wishLinks().length,1);store.close();store=createContentStore({file:join(dir,'data.sqlite')})
  f=fixture(store);assert.equal((await f.workflow.retry(req,body.operationId)).syncPending,false)
  assert.equal(f.wishes[0].status,'筹备中');assert.equal(store.getIp('flow-test').doc.lines.上海.ipStops.length,2)
  assert.equal(store.pendingWishOperations().length,0)
  f.wishes[0].status='待整理';f.setFail(true)
  const second={operationId:randomUUID(),targetIpId:'flow-test',expectedUpdatedAt:store.getIp('flow-test').updatedAt,plans:body.plans}
  await f.workflow.import(req,second,'admin');store.unlinkWish('W-one','flow-test','上海','admin');f.setFail(false)
  await f.workflow.retry(req,second.operationId);assert.equal(f.wishes[0].status,'待整理')
 }finally{store.close();await rm(dir,{recursive:true,force:true})}
})

test('分城市发布快照隔离草稿，全部来源完成后才收录',async()=>{
 const store=createContentStore({file:':memory:'});const f=fixture(store)
 try{
  const body=operation();body.plans.push({wishId:'W-one',cityKey:'北京',points:[]})
  await f.workflow.import(req,body,'admin')
  const completion=city=>({operationId:randomUUID(),ipId:'flow-test',keys:[`W-one|${city}`]})
  await assert.rejects(f.workflow.complete(req,completion('上海'),'admin'),e=>e.status===400)
  // 存储层直接发布仅用于隔离测试；HTTP 发布入口另有完整资料校验。
  store.setStatus('flow-test','online',{cityKeys:['上海'],actor:'admin'})
  await f.workflow.complete(req,completion('上海'),'admin');assert.equal(f.wishes[0].status,'筹备中')
  const edited=store.getIp('flow-test').doc;edited.lines.上海.ipStops[0].name='草稿改名'
  store.saveIp('flow-test',edited,'admin')
  assert.equal(store.onlineLines()['flow-test-上海'].ipStops[0].name,'外滩')
  store.setStatus('flow-test','online',{cityKeys:['北京'],actor:'admin'})
  assert.equal(store.onlineLines()['flow-test-上海'].ipStops[0].name,'外滩')
  await f.workflow.complete(req,completion('北京'),'admin');assert.equal(f.wishes[0].status,'已收录')
  store.setStatus('flow-test','offline',{cityKeys:['上海'],actor:'admin'})
  assert.deepEqual(Object.keys(store.onlineLines()),['flow-test-北京'])
 }finally{store.close()}
})

test('联动 HTTP 接口鉴权、校验、创建与列表；伪造上线标记不能发布草稿',async()=>{
 const store=createContentStore({file:':memory:'});const f=fixture(store)
 const server=createContentServer({store,fetchImpl:f.fetchImpl,wishesBase:'http://wishes'})
 server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`
 const headers={'Content-Type':'application/json',Cookie:'admin=1'}
 try{
  assert.equal((await fetch(`${base}/api/manage/content/wish-links`)).status,401)
  assert.equal((await fetch(`${base}/api/manage/content/wish-links`,{headers:{Cookie:'user=1'}})).status,403)
  const result=await fetch(`${base}/api/manage/content/wish-imports`,{method:'POST',headers,body:JSON.stringify(operation())})
  assert.equal(result.status,200,await result.text())
  const links=await (await fetch(`${base}/api/manage/content/wish-links`,{headers})).json();assert.equal(links.links.length,1)
  const doc=document();doc.ip.ipId='forged';doc.lines.上海=newCityLine('forged','测试作品','上海');doc.lines.上海.status='online'
  const created=await fetch(`${base}/api/manage/content/ips`,{method:'POST',headers,body:JSON.stringify({doc,status:'online'})})
  assert.equal(created.status,201);assert.deepEqual(store.onlineLines(),{})
  const publish=await fetch(`${base}/api/manage/content/ips/forged/status`,{method:'PATCH',headers,body:JSON.stringify({status:'online'})})
  assert.equal(publish.status,422)
 }finally{await new Promise(r=>server.close(r));store.close()}
})
