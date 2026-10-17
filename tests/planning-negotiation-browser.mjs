import test from 'node:test';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const origin=process.env.NEGOTIATION_TEST_ORIGIN||'http://127.0.0.1:5173';
async function setup(t,{adding=false}={}){
 const browser=await chromium.launch({headless:true,channel:'chrome'});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));await page.route(origin+'/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body></body></html>'}));await page.goto(origin+'/');
 await page.evaluate(async({adding})=>{
  document.head.innerHTML='<link rel="stylesheet" href="/src/planning/ui.css">';document.body.replaceChildren();const root=document.createElement('div');document.body.append(root);
  const {createPlanningExperience}=await import('/src/planning/ui.mjs');let ids=adding?['a']:['a','b','c','d','e'],latest;window.calls=[];window.finished=null;
  const pois=['a','b','c','d','e'].map((poiId,i)=>({poiId,name:['朱家角','外滩','豫园','武康路','南京路'][i],durationNormal:60,lat:31,lng:121,intro:'景点简介'}));
  const api=async(url,body)=>{
   if(url.endsWith('/status'))return{configured:false};
   if(url.endsWith('/sessions')){latest=body;window.calls.push(body);return{planningSessionId:'test',intakeRevision:window.calls.length}};
   if(url==='/api/itineraries'){
    const selected=latest.context.selectedPoiIds,extended=latest.answers.some(a=>a.values?.dayEnd>='20:00');
    const feasible=selected.length<=(adding?2:extended?5:3);const hours=latest.answers.find(a=>a.values?.dayEnd)?.values;
    const days=[{date:'2026-11-01',endAt:'2026-11-01T'+(hours?.dayEnd||'17:00')+':00+08:00',items:selected.map(poiId=>({type:'visit',poiId,endAt:'2026-11-01T16:00:00+08:00'}))}];
    if(body.dryRun){
     if(body.negotiation){const {removalProposal,additionProposal}=await import('/src/planning/negotiation.mjs');const n=body.negotiation;const trial=async selected=>{await new Promise(r=>setTimeout(r,100));return{feasible:selected.length<=(adding?2:extended?5:3),days:[{...days[0],items:selected.map(poiId=>({type:'visit',poiId,endAt:'2026-11-01T16:00:00+08:00'}))}]}};const ranked=n.candidateIds.map(poiId=>({poiId}));const protectedIds=latest.answers.find(a=>a.questionId==='q:conversation_must:0')?.values.poiIds||[];const proposal=n.kind==='add'?await additionProposal({ids:selected,ranked,trial,rejectedIds:n.rejectedIds}):await removalProposal({ids:selected,ranked,trial,protectedIds});return{state:'succeeded',result:{kind:'negotiation_plan',proposal}};}
     await new Promise(r=>setTimeout(r,100));return{state:'succeeded',result:{kind:'feasibility',feasible,days}};}
    return{state:'succeeded',result:feasible?{kind:'itinerary',itinerary:{id:'done',version:1,intakeRevision:1,context:latest.context,days,requirements:[],validation:{status:'passed'}}}:{kind:'negotiation',selectionAdvice:{kind:'remove',candidates:pois.map((p,i)=>({poiId:p.poiId,name:p.name,rank:i+1,reasons:['路线试排建议']}))}}};
   }throw Error(url);
  };
  const ex=createPlanningExperience({getContext:()=>({lineId:'test',selectedPoiIds:ids,dateRange:{startDate:'2026-11-01',endDate:'2026-11-01'},timeZone:'Asia/Shanghai'}),getPois:()=>pois,onSelectionChange:next=>{ids=next;ex.mount(root)},onItinerary:it=>window.finished=it,api});
  ex.restoreSession({planningSessionId:'old',requirements:[]});ex.mount(root);
 },{adding});
 await page.locator('[data-planning-action=generate]').click();await page.getByRole('dialog').waitFor();return page;
}
test('automatic prefix, left slide, loading, notice, replacement and hard retention survive apply',{timeout:30000},async t=>{
 const page=await setup(t);const dialog=page.getByRole('dialog');await dialog.getByText('建议舍弃 2 个地点，整组方案已通过试排。',{exact:true}).waitFor();assert.equal(await dialog.locator('[data-advice-poi]').count(),2);await page.screenshot({path:'/tmp/negotiation-desktop.png'});
 await dialog.locator('[data-keep-poi=a]').click();await dialog.locator('[data-negotiation-placeholder=a] .negotiation-dots').waitFor();await dialog.getByText('已为你保留朱家角，调整了其余建议',{exact:true}).waitFor();await dialog.locator('[data-advice-poi=c]').waitFor();assert.equal(await dialog.locator('[data-advice-poi=a]').count(),0);await dialog.getByRole('button',{name:'已保留 · 1',exact:true}).click();assert(await dialog.locator('[data-unprotect-poi=a]').isVisible());
 await dialog.getByRole('button',{name:'应用方案',exact:true}).click();await page.waitForFunction(()=>window.finished);const final=await page.evaluate(()=>window.calls.at(-1));assert.deepEqual(final.context.selectedPoiIds,['a','d','e']);assert.deepEqual(final.answers.find(a=>a.questionId==='q:conversation_must:0').values.poiIds,['a']);assert.equal(final.selectionNegotiation,true);assert.equal(await dialog.count(),0);
});
test('time editor only calculates on save; cancel and unchanged save send no requests',{timeout:30000},async t=>{
 const page=await setup(t);const dialog=page.getByRole('dialog',{name:'景点取舍协商',exact:true});await dialog.getByText('建议舍弃 2 个地点，整组方案已通过试排。',{exact:true}).waitFor();const before=await page.evaluate(()=>window.calls.length);
 await dialog.getByRole('button',{name:'修改时间',exact:true}).click();let editor=page.getByRole('dialog',{name:'调整日期与每天时间',exact:true});await editor.getByLabel('每天结束',{exact:true}).fill('20:00');await editor.getByLabel('结束日期',{exact:true}).fill('2026-11-02');await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>window.calls.length),before);await page.screenshot({path:'/tmp/negotiation-time-editor.png'});await editor.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.getByRole('dialog',{name:'调整日期与每天时间'}).count(),0);assert.equal(await page.evaluate(()=>window.calls.length),before);assert(await dialog.getByText(/每天 10:00—17:00/).isVisible());
 await dialog.getByRole('button',{name:'修改时间',exact:true}).click();editor=page.getByRole('dialog',{name:'调整日期与每天时间',exact:true});await editor.getByRole('button',{name:'保存并核算',exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.length),before);
 await dialog.getByRole('button',{name:'修改时间',exact:true}).click();editor=page.getByRole('dialog',{name:'调整日期与每天时间',exact:true});await editor.getByLabel('每天开始',{exact:true}).fill('09:00');await editor.getByLabel('每天结束',{exact:true}).fill('20:00');await editor.getByRole('button',{name:'保存并核算',exact:true}).click();assert(await dialog.locator('[data-negotiation-apply]').isDisabled());await dialog.getByText('时间刚刚好，所有已选地点都能安排',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.calls.length),before+1);await dialog.getByRole('button',{name:'生成行程',exact:true}).click();await page.waitForFunction(()=>window.finished);assert.equal((await page.evaluate(()=>window.finished.context.selectedPoiIds)).length,5);
});
test('new additions are jointly validated and may be declined for direct generation',{timeout:30000},async t=>{
 const page=await setup(t,{adding:true});const dialog=page.getByRole('dialog');await dialog.getByText('建议追加 1 个地点，整组方案已通过试排。',{exact:true}).waitFor();await dialog.locator('[data-keep-poi=b]').click();await dialog.getByText('已跳过外滩，调整了其余建议',{exact:true}).waitFor();await dialog.locator('[data-advice-poi=c]').waitFor();await dialog.getByRole('button',{name:'不追加，直接生成',exact:true}).click();await page.waitForFunction(()=>window.finished);assert.deepEqual(await page.evaluate(()=>window.finished.context.selectedPoiIds),['a']);
});
test('narrow screen retains usable layout and protected exhaustion blocks generation',{timeout:30000},async t=>{
 const page=await setup(t);await page.setViewportSize({width:390,height:844});const dialog=page.getByRole('dialog');for(const id of ['a','b','c','d']){await dialog.locator('[data-keep-poi='+id+']').click();await page.waitForTimeout(1800);}await dialog.getByText('按当前条件，暂时无法安排所有必去地点',{exact:true}).waitFor();assert(await dialog.locator('[data-negotiation-apply]').isDisabled());assert(await dialog.getByRole('button',{name:'延长游玩时间',exact:true}).isVisible());const bounds=await dialog.boundingBox();assert(bounds.width<=390);await page.screenshot({path:'/tmp/negotiation-mobile.png'});
});

test('failed recomputation keeps previous suggestions and provides one clear recovery action',{timeout:20000},async t=>{
 const page=await setup(t);const dialog=page.getByRole('dialog');await dialog.getByText('建议舍弃 2 个地点，整组方案已通过试排。',{exact:true}).waitFor();
 // Use the component directly to inject a recoverable limit response without network flooding.
 await page.evaluate(async()=>{document.querySelector('.negotiation-overlay').remove();const {createNegotiation}=await import('/src/planning/negotiation-ui.mjs');let calls=0;window.recoveryCalls=0;const n=createNegotiation({kind:'remove',ids:['a','b','c','d'],candidates:['a','b','c','d'].map(poiId=>({poiId,name:poiId})),context:{dateRange:{startDate:'2026-11-01',endDate:'2026-11-01'}},hours:{start:'10:00',end:'17:00'},getPois:()=>[],plan:async()=>{window.recoveryCalls=++calls;if(calls===2){const e=Error('limited');e.code='RATE_LIMITED';e.retryAfterSeconds=2;throw e;}return{ids:calls===1?['a','b']:['b','c'],feasible:true};},onApply:()=>window.applied=true,onCancel:()=>{}});const overlay=document.createElement('div');overlay.className='negotiation-overlay';overlay.append(n.host);document.body.append(overlay);n.start();});
 const panel=page.getByRole('dialog',{name:'景点取舍协商',exact:true});await panel.locator('[data-keep-poi=a]').click();await panel.getByRole('heading',{name:'这次核算未完成',exact:true}).waitFor();assert.equal(await panel.locator('[data-advice-poi=b]').count(),1);assert.equal(await panel.locator('[data-advice-poi=a]').count(),0);assert.equal(await panel.locator('[data-negotiation-apply]').count(),0);assert(await panel.locator('[data-negotiation-retry]').isDisabled());
 await panel.getByRole('button',{name:'修改时间',exact:true}).click();const editor=page.getByRole('dialog',{name:'调整日期与每天时间',exact:true});await editor.getByLabel('每天结束',{exact:true}).fill('19:30');assert.equal(await page.evaluate(()=>window.recoveryCalls),2);await editor.getByRole('button',{name:'取消',exact:true}).click();
 await panel.getByRole('button',{name:'重新核算',exact:true}).waitFor();await panel.getByRole('button',{name:'重新核算',exact:true}).click();await panel.locator('[data-negotiation-apply]').waitFor();assert(await panel.locator('[data-negotiation-apply]').isEnabled());assert.equal(await panel.locator('[role=alert]').count(),0);assert.equal(await page.evaluate(()=>window.recoveryCalls),3);
});
