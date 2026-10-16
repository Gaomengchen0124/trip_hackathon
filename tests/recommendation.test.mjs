import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { loadRecommendationCatalog,validateRequest,recommend,createRecommendationHandler } from '../server/recommendation.mjs'
import { createAuthStore } from '../server/auth-store.mjs'
import { createAuthServer } from '../server/auth.mjs'
import { emptyInterests } from '../src/recommendation/options.mjs'
const catalog=await loadRecommendationCatalog()
const input=(patch={})=>validateRequest({mode:'discover',interests:emptyInterests(),...patch},catalog)
const mockResponse=items=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items})}}]})})

test('catalog follows source IDs, keeps untagged new works, and does not use itinerary inputs',()=>{
 assert.ok(catalog.length>0)
 assert.equal(new Set(catalog.map(c=>c.lineId)).size,catalog.length)
 assert.ok(catalog.every(c=>c.ipId===c.ip.ipId))
 assert.equal(input({timeRange:{startDate:'2026-10-20'}}).timeRange,undefined)
 assert.throws(()=>input({mode:'by_work',ipId:'unknown'}))
 assert.throws(()=>input({city:'unknown'}))
 assert.throws(()=>input({interests:{themes:['shopping']}}))
})
test('work and city are hard filters; no match stays empty; feedback excludes a whole IP',async()=>{
 const single=await recommend(input({mode:'by_work',ipId:'longzu'}),catalog,{apiKey:''})
 assert.equal(single.items.length,2);assert.ok(single.items.every(c=>c.ipId==='longzu'))
 const empty=await recommend(input({mode:'by_work',ipId:'longzu',city:'厦门'}),catalog,{apiKey:''})
 assert.equal(empty.source,'empty');assert.deepEqual(empty.items,[])
 const excluded=await recommend(input({excludedIpIds:['fanhua','longzu']}),catalog,{apiKey:''})
 assert.ok(excluded.items.every(c=>!['fanhua','longzu'].includes(c.ipId)))
})
test('interests affect ranking; basic mode is explicit and does not pretend free text was applied',async()=>{
 const result=await recommend(input({interests:{themes:['scifi']},text:'宇宙'}),catalog,{apiKey:''})
 assert.equal(result.source,'basic');assert.match(result.notice,/尚未/)
 assert.ok(result.items[0].themes.includes('scifi'))
 assert.equal(new Set(result.items.map(c=>c.ipId)).size,result.items.length)
})
test('model receives limited grounded candidates and can only select their IDs and evidence keys',async()=>{
 let sent
 const result=await recommend(input({mode:'by_work',ipId:'kaiduan'}),catalog,{apiKey:'test-key',fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return mockResponse([{lineId:'kaiduan-xiamen',reasonKeys:['work','destination']}])}})
 assert.equal(result.source,'ai');assert.equal(result.items[0].lineId,'kaiduan-xiamen')
 assert.ok(result.items[0].reasons.every(x=>typeof x==='string'))
 assert.equal(sent.response_format.type,'json_object')
 assert.equal(JSON.parse(sent.messages[1].content).candidates.length,1)
 for(const items of [[{lineId:'fanhua-shanghai',reasonKeys:['work']}],[{lineId:'kaiduan-xiamen',reasonKeys:['invented']}],[{lineId:'kaiduan-xiamen',reasonKeys:['work']},{lineId:'kaiduan-xiamen',reasonKeys:['work']}],null]){
  const invalid=await recommend(input({mode:'by_work',ipId:'kaiduan'}),catalog,{apiKey:'test',fetchImpl:async()=>mockResponse(items)})
  assert.equal(invalid.source,'basic')
 }
 const noMatch=await recommend(input(),catalog,{apiKey:'test',fetchImpl:async()=>mockResponse([])})
 assert.equal(noMatch.source,'ai');assert.equal(noMatch.items.length,0)
})
test('upstream timeout, HTTP failure, empty or truncated JSON fall back without leaking provider responses',async()=>{
 for(const fetchImpl of [async()=>{throw new Error('SECRET PROVIDER ERROR')},async()=>({ok:false}),async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'SECRET'}}]})})]){
  const result=await recommend(input(),catalog,{apiKey:'secret',fetchImpl})
  assert.equal(result.source,'basic');assert.doesNotMatch(JSON.stringify(result),/SECRET|secret/)
 }
})
test('HTTP handler rejects cross-origin, oversized and malformed requests; catalog is public',async()=>{
 const handler=await createRecommendationHandler({allowedOrigins:['http://localhost:5178'],apiKey:''})
 const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end()}})
 server.listen(0,'127.0.0.1');await once(server,'listening')
 const base=`http://127.0.0.1:${server.address().port}`
 const send=(body,origin='http://localhost:5178')=>fetch(base+'/api/recommendations',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body})
 try{
  assert.equal((await fetch(base+'/api/recommendations/catalog')).status,200)
  assert.equal((await send('{}','https://evil.example')).status,403)
  assert.equal((await send('{')).status,400)
  assert.equal((await send(JSON.stringify({text:'a'.repeat(13000)}))).status,413)
  const valid=await send(JSON.stringify(input()));assert.equal(valid.status,200);assert.equal((await valid.json()).source,'basic')
 }finally{await new Promise(resolve=>server.close(resolve))}
})
test('interest API authenticates identity, isolates profiles and records skip/save without modifying basic profile',async()=>{
 const store=createAuthStore({file:':memory:'}),server=createAuthServer({store,origin:'http://localhost:5178',secure:false})
 server.listen(0,'127.0.0.1');await once(server,'listening')
 const base=`http://127.0.0.1:${server.address().port}/api/me/interests`
 const user=store.verifiedIdentity('email','a@example.com'),other=store.verifiedIdentity('email','b@example.com')
 const cookie=`travel_session=${store.issueSession(user.id).token}`,otherCookie=`travel_session=${store.issueSession(other.id).token}`
 const put=(body,origin='http://localhost:5178')=>fetch(base,{method:'PUT',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)})
 try{
  assert.equal((await fetch(base)).status,401)
  assert.equal((await put({status:'saved',interests:{themes:['scifi']},userId:other.id},'https://evil.example')).status,403)
  assert.equal((await put({status:'saved',interests:{themes:['scifi']},userId:other.id})).status,200)
  const saved=await (await fetch(base,{headers:{Cookie:cookie}})).json();assert.deepEqual(saved.profile.interests.themes,['scifi'])
  assert.equal((await (await fetch(base,{headers:{Cookie:otherCookie}})).json()).profile,null)
  assert.equal((await put({status:'saved',interests:{themes:['invalid']}})).status,400)
  assert.equal((await put({status:'skipped',interests:emptyInterests()})).status,200)
  assert.equal(store.getInterests(user.id).status,'skipped')
  assert.equal(store.sessionUser(cookie.split('=')[1]).nickname,user.nickname)
 }finally{await new Promise(resolve=>server.close(resolve));store.close()}
})


test('valid extra reason keys are verified then trimmed, not treated as AI outage',async()=>{
 const request=input({mode:'by_work',ipId:'kaiduan'})
 const keys=['work','destination','themes_fact','moods_fact']
 const result=await recommend(request,catalog,{apiKey:'test',fetchImpl:async()=>mockResponse([{lineId:'kaiduan-xiamen',reasonKeys:keys}])})
 assert.equal(result.source,'ai');assert.equal(result.items.length,1);assert.equal(result.items[0].reasons.length,3)
 // Even an invalid key after the displayed first three must reject the response.
 const invalid=await recommend(request,catalog,{apiKey:'test',fetchImpl:async()=>mockResponse([{lineId:'kaiduan-xiamen',reasonKeys:[...keys,'invented']}])})
 assert.equal(invalid.source,'basic')
})
