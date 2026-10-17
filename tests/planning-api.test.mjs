import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPlanningStore } from '../server/planning/store.mjs'
import { createPlanningService } from '../server/planning/service.mjs'
import { createPlanningServer } from '../server/planning/http.mjs'
import { createDeepSeekClient } from '../server/planning/llm.mjs'
const context={lineId:'fanhua-shanghai',selectedPoiIds:['sh-ip-01','sh-sp-01'],dateRange:{startDate:'2026-11-01',endDate:'2026-11-02'},timeZone:'Asia/Shanghai'};
function fakeLLM(intake={mode:'intake',requirementProposals:[],questionProposals:[{templateId:'pace'}],keywordProposals:[{label:'轻松慢游',insertText:'想轻松慢游'}]}) {
 return {configured:true,model:'synthetic_test_only',async complete({messages}) {const payload=JSON.parse(messages[1].content);return payload.selectedPoiIds?{mode:'generate',candidateOrder:payload.selectedPoiIds}:intake}}
}
async function fixture(t,{llm=fakeLLM(),totalTimeoutMs=1000}={}) {
 const store=createPlanningStore({file:':memory:'}),service=createPlanningService({store,llm,totalTimeoutMs});
 const server=createPlanningServer({store,service,origin:'http://allowed.test'});server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;let cookie='';let seq=0;
 const request=async(path,{method='GET',body,origin='http://allowed.test',asOther=false}={})=>{
  const res=await fetch(base+path,{method,headers:{Origin:origin,...(!asOther&&cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify({idempotencyKey:`request_${++seq}`, ...body}):undefined});
  if(res.headers.get('set-cookie')&&!asOther)cookie=res.headers.get('set-cookie').split(';')[0];return {status:res.status,body:await res.json()}
 };
 t.after(async()=>{await service.settle();server.closeAllConnections();await new Promise(r=>server.close(r));store.close()});return {store,service,request};
}
test('missing key explicit 503; status is not fake success',async t=>{const {request}=await fixture(t,{llm:createDeepSeekClient({apiKey:''})});assert.equal((await request('/api/planning/status')).body.data.configured,false);const r=await request('/api/planning/sessions',{method:'POST',body:{context,text:'轻松一点'}});assert.equal(r.status,503);assert.equal(r.body.error.code,'LLM_NOT_CONFIGURED')});
test('complete intake → option answer → generation → job → retrieval',async t=>{
 const {request,service}=await fixture(t);const first=await request('/api/planning/sessions',{method:'POST',body:{context,text:''}});assert.equal(first.status,201);const s=first.body.data;assert.equal(s.nextQuestions[0].templateId,'pace');
 const updated=await request(`/api/planning/sessions/${s.planningSessionId}/intake`,{method:'POST',body:{baseIntakeRevision:1,answers:[{questionId:s.nextQuestions[0].id,optionIds:['fewer_deeper'],values:{}}],action:'generate'}});assert.equal(updated.status,200);assert.equal(updated.body.data.nextQuestions.length,0);assert.equal(updated.body.data.requirements[0].source,'user_option');
 const gen=await request('/api/itineraries',{method:'POST',body:{planningSessionId:s.planningSessionId,intakeRevision:2}});assert.equal(gen.status,202);await service.settle();
 const job=(await request(`/api/planning/jobs/${gen.body.data.id}`)).body.data;assert.equal(job.state,'succeeded');assert.equal(job.result.kind,'itinerary');assert.equal(job.result.itinerary.validation.status,'provisional');
 assert.equal((await request('/api/itineraries/'+job.result.itinerary.id)).status,200);
});
test('skip suppresses repeated template and late response uses revision guard',async t=>{const {request}=await fixture(t);const s=(await request('/api/planning/sessions',{method:'POST',body:{context,text:''}})).body.data;const path=`/api/planning/sessions/${s.planningSessionId}/intake`;const r=await request(path,{method:'POST',body:{baseIntakeRevision:1,text:'继续',skippedQuestionIds:[s.nextQuestions[0].id],action:'skip'}});assert.equal(r.status,200);assert.equal(r.body.data.nextQuestions.length,0);assert.equal((await request(path,{method:'POST',body:{baseIntakeRevision:1,text:'旧请求'}})).status,409)});
test('flight direct generate keeps unknown and can save provisional partial draft',async t=>{
 const intake={mode:'intake',requirementProposals:[{key:'fixedEvent',value:{type:'flight',date:'2026-11-02',period:'afternoon'},strength:'hard',scope:{type:'trip',targetId:null},evidence:{quote:'2号下午有飞机'}}],questionProposals:[{templateId:'flight_details'}],keywordProposals:[]};
 const {request,service}=await fixture(t,{llm:fakeLLM(intake)});const s=(await request('/api/planning/sessions',{method:'POST',body:{context,text:'2号下午有飞机',action:'generate'}})).body.data;assert.equal(s.nextQuestions.length,0);assert.equal(s.generationReadiness,'provisional');
 const j=(await request('/api/itineraries',{method:'POST',body:{planningSessionId:s.planningSessionId,intakeRevision:1}})).body.data;await service.settle();const result=(await request('/api/planning/jobs/'+j.id)).body.data;assert.equal(result.state,'succeeded');assert.equal(result.result.itinerary.validation.status,'provisional');assert.equal(result.result.itinerary.days[1].items.length,0)
});
test('other visitor cannot read session/job/itinerary',async t=>{const {request}=await fixture(t);const s=(await request('/api/planning/sessions',{method:'POST',body:{context}})).body.data;assert.equal((await request('/api/planning/sessions/'+s.planningSessionId,{asOther:true})).status,404)});
test('cross-origin write and unknown poi rejected',async t=>{const {request}=await fixture(t);assert.equal((await request('/api/planning/sessions',{method:'POST',origin:'http://evil.test',body:{context}})).status,403);assert.equal((await request('/api/planning/sessions',{method:'POST',body:{context:{...context,selectedPoiIds:['invented']}}})).status,422)});
test('idempotency identical replays and changed body conflicts',async t=>{const {request}=await fixture(t);const body={context,text:'',idempotencyKey:'same_request'};const a=await request('/api/planning/sessions',{method:'POST',body});const b=await request('/api/planning/sessions',{method:'POST',body});assert.equal(a.body.data.planningSessionId,b.body.data.planningSessionId);assert.equal((await request('/api/planning/sessions',{method:'POST',body:{...body,text:'changed'}})).status,409)});
test('empty / malformed model content cannot save a session',async t=>{const llm={configured:true,async complete(){return {mode:'intake',requirementProposals:[],questionProposals:[],keywordProposals:[{label:3}]}}};const {request}=await fixture(t,{llm});assert.equal((await request('/api/planning/sessions',{method:'POST',body:{context}})).status,502)});
test('superseded intake during generation makes job fail instead of saving stale result',async t=>{
 let release;let started;const ready=new Promise(r=>started=r);const fake=fakeLLM();const llm={...fake,async complete(a){if(JSON.parse(a.messages[1].content).selectedPoiIds){started();await new Promise(r=>release=r)}return fake.complete(a)}};
 const {request,service}=await fixture(t,{llm});const s=(await request('/api/planning/sessions',{method:'POST',body:{context}})).body.data;const j=(await request('/api/itineraries',{method:'POST',body:{planningSessionId:s.planningSessionId,intakeRevision:1}})).body.data;await ready;
 await request(`/api/planning/sessions/${s.planningSessionId}/intake`,{method:'POST',body:{baseIntakeRevision:1,action:'generate'}});release();await service.settle();const result=(await request('/api/planning/jobs/'+j.id)).body.data;assert.equal(result.state,'failed');assert.equal(result.error.code,'STALE_INTAKE');
});
test('real client adapter sends JSON mode and separates purpose; test transport only',async()=>{
 let payload,usage;
 const c=createDeepSeekClient({apiKey:'synthetic_key',onUsage:u=>usage=u,fetchImpl:async(u,options)=>{payload=JSON.parse(options.body);return Response.json({choices:[{finish_reason:'stop',message:{content:'{"mode":"intake"}'}}],usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14}})}});
 assert.deepEqual(await c.complete({purpose:'ip_recommendation',messages:[{role:'user',content:'json'}]}),{mode:'intake'});assert.equal(payload.thinking.type,'disabled');assert.equal(payload.response_format.type,'json_object');assert.equal(usage.purpose,'ip_recommendation');assert.equal(usage.usage.total_tokens,14);
});
test('client rejects truncated response and does not expose upstream body',async()=>{const c=createDeepSeekClient({apiKey:'synthetic_key',fetchImpl:async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]})});await assert.rejects(c.complete({purpose:'itinerary_planning',messages:[]}),{code:'MODEL_TRUNCATED'});const auth=createDeepSeekClient({apiKey:'synthetic_key',fetchImpl:async()=>new Response('secret upstream body',{status:401})});await assert.rejects(auth.complete({purpose:'itinerary_planning',messages:[]}),e=>e.code==='LLM_AUTH_FAILED'&&!e.message.includes('secret'))});
test('SQLite session survives reopen; pending job becomes restart error',async()=>{const dir=await mkdtemp(join(tmpdir(),'planning-'));try{let store=createPlanningStore({file:join(dir,'test.sqlite')});store.put('o','s','session',{intakeRevision:2,requirements:[]});store.put('o','j','job',{state:'running'});store.close();store=createPlanningStore({file:join(dir,'test.sqlite')});assert.equal(store.get('o','s','session').intakeRevision,2);assert.equal(store.get('o','j','job').error.code,'SERVER_RESTARTED');store.close()}finally{await rm(dir,{recursive:true,force:true})}});
test('generation timeout terminates task without late itinerary write',async t=>{
 const fake=fakeLLM();let release;const llm={...fake,async complete(a){if(JSON.parse(a.messages[1].content).selectedPoiIds)await new Promise(r=>release=r);return fake.complete(a)}};
 const {request,service}=await fixture(t,{llm,totalTimeoutMs:30});const s=(await request('/api/planning/sessions',{method:'POST',body:{context}})).body.data;const j=(await request('/api/itineraries',{method:'POST',body:{planningSessionId:s.planningSessionId,intakeRevision:1}})).body.data;
 await service.settle();const job=(await request('/api/planning/jobs/'+j.id)).body.data;assert.equal(job.state,'failed');assert.equal(job.error.code,'PLANNING_TIMEOUT');release();await new Promise(r=>setTimeout(r,5));assert.equal((await request('/api/planning/jobs/'+j.id)).body.data.result,null);
});
test('infeasible plan returns negotiation, at most two repair rounds',async t=>{
 let generations=0;const fake=fakeLLM();const llm={...fake,async complete(a){const p=JSON.parse(a.messages[1].content);if(p.selectedPoiIds)generations++;return fake.complete(a)}};
 const {request,service}=await fixture(t,{llm});
 const text='只能玩到10:05';const intake=llm.complete.bind(llm);llm.complete=async a=>{const p=JSON.parse(a.messages[1].content);if(!p.selectedPoiIds)return {mode:'intake',requirementProposals:[{key:'dayEnd',value:'10:05',strength:'hard',scope:{type:'trip',targetId:null},evidence:{quote:text}}],questionProposals:[],keywordProposals:[]};return intake(a)};
 const s=(await request('/api/planning/sessions',{method:'POST',body:{context,text,action:'generate'}})).body.data;const j=(await request('/api/itineraries',{method:'POST',body:{planningSessionId:s.planningSessionId,intakeRevision:1}})).body.data;await service.settle();const job=(await request('/api/planning/jobs/'+j.id)).body.data;assert.equal(job.state,'succeeded');assert.equal(job.result.kind,'negotiation');assert.equal(generations,3);
});
test('unknown template and optional empty answers do not create invented requirements',async t=>{
 const fake=fakeLLM({mode:'intake',requirementProposals:[],questionProposals:[{templateId:'__proto__'},{templateId:'rest_detail'}],keywordProposals:[]});const {request}=await fixture(t,{llm:fake});
 const s=(await request('/api/planning/sessions',{method:'POST',body:{context}})).body.data;assert.equal(s.nextQuestions.length,1);const r=await request(`/api/planning/sessions/${s.planningSessionId}/intake`,{method:'POST',body:{baseIntakeRevision:1,answers:[{questionId:s.nextQuestions[0].id,values:{},optionIds:[]}],action:'generate'}});assert.equal(r.status,200);assert.equal(r.body.data.requirements.length,0);
});
