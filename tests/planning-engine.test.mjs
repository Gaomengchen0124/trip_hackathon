import test from 'node:test'
import assert from 'node:assert/strict'
import { createFactTools,openingFor } from '../server/planning/facts.mjs'
import { scheduleItinerary,validateItinerary } from '../src/planning/scheduler.mjs'
import { timestamp } from '../src/planning/core.mjs'
import { mergeProposals } from '../src/planning/requirements.mjs'
const date='2026-11-01';
const pois=[{poiId:'a',name:'A',lat:31.2,lng:121.4,durationNormal:40,durationRush:20,durationDeep:80,openingVerified:true,openingByDate:{[date]:{windows:[[540,1020]],lastEntry:1000}}},{poiId:'b',name:'B',lat:31.21,lng:121.41,durationNormal:40,durationRush:20,durationDeep:80,openingVerified:true,openingByDate:{[date]:{windows:[[540,1020]],lastEntry:1000}}}];
const context={lineId:'test',selectedPoiIds:['a','b'],dateRange:{startDate:date,endDate:date},timeZone:'Asia/Shanghai',origin:{id:'hotel',lat:31.2,lng:121.4}};
const req=(key,value,extra={})=>({id:key,key,value,strength:'hard',scope:{type:'trip',targetId:null},state:'confirmed',...extra});
async function plan({ps=pois,requirements=[],ctx=context,provider}={}) {
 const tools=createFactTools({travelProvider:provider||(async()=>({minutes:10,walkMinutes:2,mode:'transit',certainty:'observed',provider:'synthetic_test',fetchedAt:'2026-01-01T00:00:00Z'}))});
 const dates=[date];const pf=await tools.poiFacts(ps,dates);const draft=await scheduleItinerary({context:ctx,requirements,points:pf.points,facts:pf.facts,tools});return {draft,validation:validateItinerary(draft)}
}
test('known synthetic facts: accounts for departure/return, visits, buffers, meals',async()=>{
 const {draft,validation}=await plan();assert.equal(validation.status,'passed');const items=draft.days[0].items;
 assert.equal(items[0].type,'travel');assert.equal(items.at(-1).toId,'hotel');
 assert.equal(draft.days[0].totals.occupied,items.reduce((s,x)=>s+x.durationMinutes,0));assert.equal(items.filter(x=>x.type==='visit').length,2);
});
test('unknown start/end and catalogue hours remain provisional',async()=>{
 const ps=pois.map(p=>({...p,openingByDate:null,openHours:'全天'}));const {validation}=await plan({ps,ctx:{...context,origin:null}});assert.equal(validation.status,'provisional');assert(validation.unresolved.some(u=>u.code==='UNKNOWN_ORIGIN'));
});
test('missing opening is unknown, not asserted open',()=>{assert.equal(openingFor({poiId:'x'},date).windows,null)});
test('closed Monday parses as no available window',()=>{assert.deepEqual(openingFor({openHours:'09:00-17:00，周一闭馆'},'2026-11-02').windows,[])});
test('cannot fit minimum stay before closing: does not silently shorten',async()=>{
 const ps=[{...pois[0],openingByDate:{[date]:{windows:[[600,630]],lastEntry:620}}}];const {draft,validation}=await plan({ps,ctx:{...context,selectedPoiIds:['a']}});assert.equal(validation.status,'failed');assert.deepEqual(draft.unscheduledPoiIds,['a']);
});
test('last entry prevents arrival even when closing later',async()=>{
 const ps=[{...pois[0],openingByDate:{[date]:{windows:[[540,1020]],lastEntry:605}}}];const {validation}=await plan({ps,ctx:{...context,selectedPoiIds:['a']}});assert.equal(validation.status,'failed');
});
test('deep duration applies to its own poi only',async()=>{
 const {draft}=await plan({requirements:[req('poiDepth',{poiId:'a',depth:'deep'})]});const visits=draft.days[0].items.filter(i=>i.type==='visit');assert.equal(visits.find(i=>i.poiId==='a').durationMinutes,80);assert.equal(visits.find(i=>i.poiId==='b').durationMinutes,40);
});
test('deep duration unavailable: unknown, never fabricated',async()=>{
 const ps=[{...pois[0],durationDeep:undefined}];const {draft,validation}=await plan({ps,ctx:{...context,selectedPoiIds:['a']},requirements:[req('poiDepth',{poiId:'a',depth:'deep'})]});assert.equal(validation.status,'failed');assert(draft.unresolved.some(u=>u.code==='UNKNOWN_DURATION'));
});
test('hard excluded selected point is conflict, not silent omission',async()=>{await assert.rejects(()=>plan({requirements:[req('exclude',['a'])]}),{code:'CONFLICTING_SELECTION'})});
test('flight with missing time leaves its date empty and explicit unresolved',async()=>{
 const {draft,validation}=await plan({requirements:[req('fixedEvent',{type:'flight',date,period:'afternoon'})]});assert.equal(draft.days[0].items.length,0);assert(validation.unresolved.some(u=>u.code==='FIXED_EVENT_UNCONFIRMED'));assert.equal(validation.status,'provisional');
});
test('validator catches individual-day overflow independent of totals',async()=>{const {draft}=await plan();draft.days[0].endAt=timestamp(date,620,'Asia/Shanghai');assert(validateItinerary(draft).violations.some(v=>v.code==='DAY_END_EXCEEDED'))});
test('validator catches missing traffic',async()=>{const {draft}=await plan();draft.days[0].items=draft.days[0].items.filter(i=>i.type!=='travel');assert(validateItinerary(draft).violations.some(v=>v.code==='MISSING_TRAVEL'))});
test('validator checks hard daily end and modified stay using source',async()=>{const {draft}=await plan({requirements:[req('dayEnd','13:00')]});draft.days[0].items.find(i=>i.type==='visit').durationMinutes=1;assert.equal(validateItinerary(draft).status,'failed')});
test('specific day wake exception does not change other date',async()=>{const {draft}=await plan({requirements:[req('wake','09:00'),req('wake','07:00',{id:'special',scope:{type:'day',targetId:'2026-11-02'}})]});assert.equal(draft.days[0].startAt.slice(11,16),'10:00')});
test('locked date requires actual baseline comparison',async()=>{const {draft}=await plan();const baseline=structuredClone(draft);draft.days[0].items[0].transportMode='taxi';assert(validateItinerary(draft,{preserve:{lockedDates:[date]},baselineSnapshot:baseline}).violations.some(v=>v.code==='LOCKED_DAY_CHANGED'))});
test('international timezone conversion and nonexistent DST time',()=>{assert.equal(timestamp('2026-11-01',600,'Asia/Shanghai'),'2026-11-01T10:00:00+08:00');assert.equal(timestamp('2026-07-01',600,'Europe/London'),'2026-07-01T10:00:00+01:00');assert.throws(()=>timestamp('2026-03-29',90,'Europe/London'))});
test('model cannot create requirement without verbatim evidence',()=>{assert.throws(()=>mergeProposals([],[{key:'wake',value:'07:00',strength:'hard',scope:{type:'trip'},evidence:{quote:'7点'}}],{text:'不早起'}))});
test('explicit hard constraint is not silently replaced',()=>{const old=req('dayEnd','17:00');assert.throws(()=>mergeProposals([old],[{key:'dayEnd',value:'19:00',strength:'soft',scope:old.scope,evidence:{quote:'晚一点'}}],{text:'晚一点'}))});
test('hard rest interval independently validated',async()=>{const {draft}=await plan({requirements:[req('rest',{intervalMinutes:40,durationMinutes:15})]});assert(validateItinerary(draft).violations.some(v=>v.code==='REST_INTERVAL_EXCEEDED'))});
test('fixed appointment cannot disappear from otherwise valid draft',async()=>{const {draft}=await plan();draft.requirements.push(req('fixedEvent',{type:'meeting',date,startTime:'14:00',endTime:'15:00',poiId:'a'}));assert(validateItinerary(draft).violations.some(v=>v.code==='MISSING_FIXED_EVENT'))});
test('hotel traffic provenance cannot be changed silently',async()=>{const {draft}=await plan();draft.days[0].items.find(i=>i.type==='travel').toId='b';assert(validateItinerary(draft).violations.some(v=>v.code==='INVALID_TRAVEL_FACT'))});
test('additional must-visits retain prior points and strength',()=>{const old=req('mustVisit',['a']);const out=mergeProposals([old],[{key:'mustVisit',value:['b'],strength:'soft',scope:old.scope,evidence:{quote:'也去B'}}],{text:'也去B',poiIds:['a','b']});assert.deepEqual(out.filter(r=>r.state==='confirmed').flatMap(r=>r.value),['a','b']);assert.equal(out[0].strength,'hard')});
test('per-poi depth preferences do not replace each other',()=>{const old=req('poiDepth',{poiId:'a',depth:'deep'});const out=mergeProposals([old],[{key:'poiDepth',value:{poiId:'b',depth:'quick'},strength:'soft',scope:old.scope,evidence:{quote:'B只打卡'}}],{text:'B只打卡',poiIds:['a','b']});assert.equal(out.filter(r=>r.state==='confirmed').length,2)});
test('normal sightseeing snaps upward without shortening source duration',async()=>{const ps=[{...pois[0],durationNormal:47}];const {draft,validation}=await plan({ps,ctx:{...context,selectedPoiIds:['a']},provider:async()=>({minutes:12,walkMinutes:2,mode:'transit',certainty:'observed'})});const visit=draft.days[0].items.find(i=>i.type==='visit');assert.equal(visit.durationMinutes,50);assert.equal(visit.planningPaddingMinutes,3);assert.equal(Number(visit.startAt.slice(14,16))%5,0);assert.equal(validation.status,'passed')});
test('meal preference changes reserved duration and preserves window',async()=>{for(const [preference,duration]of [['simple',30],['dedicated',60]]){const {draft,validation}=await plan({requirements:[req('meals',{preference,lunchStart:'11:30',lunchEnd:'13:30'})]});const meal=draft.days[0].items.find(i=>i.type==='meal');assert.equal(meal.durationMinutes,duration);assert.equal(meal.mealId,'lunch');assert.equal(validation.status,'passed')}});
test('long visit does not push lunch past latest start',async()=>{const {draft,validation}=await plan({ps:[{...pois[0],durationNormal:220}],ctx:{...context,selectedPoiIds:['a']}});const meal=draft.days[0].items.find(i=>i.type==='meal');assert(meal.startAt.slice(11,16)<='13:30');assert.equal(validation.status,'passed')});
test('narrow explicit meal window wins over fifteen-minute display preference',async()=>{const {draft,validation}=await plan({ps:[{...pois[0],durationNormal:160}],ctx:{...context,selectedPoiIds:['a']},requirements:[req('meals',{preference:'simple',lunchStart:'12:05',lunchEnd:'12:10'})]});const meal=draft.days[0].items.find(i=>i.type==='meal');assert(meal.startAt.slice(11,16)>='12:05'&&meal.startAt.slice(11,16)<='12:10');assert.equal(validation.status,'passed')});
test('independent validator rejects lunch moved outside user window',async()=>{const {draft}=await plan({requirements:[req('meals',{lunchStart:'11:30',lunchEnd:'13:30'})]});const meal=draft.days[0].items.find(i=>i.type==='meal');meal.startAt=timestamp(date,14*60,'Asia/Shanghai');meal.endAt=timestamp(date,14*60+meal.durationMinutes,'Asia/Shanghai');assert(validateItinerary(draft).violations.some(v=>v.code==='MEAL_WINDOW'))});
test('walking total includes transfers and return, not invented sightseeing steps',async()=>{const {draft}=await plan();const d=draft.days[0];assert.equal(d.totals.walkMinutes,6);assert.equal(d.walkingCoverage,'between_places_only');draft.requirements.push(req('mobility',{maxDailyWalkMinutes:5}));assert(validateItinerary(draft).violations.some(v=>v.code==='DAILY_WALK_LIMIT'))});
