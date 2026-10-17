import {isTourist} from './tourist-schedules.mjs'
import { randomUUID } from 'node:crypto'
import { assert, active, pick, applicable, clock, datesBetween, timestamp, minutesBetween } from './core.mjs'
import { roundUpSlot,mealWindows,mealStart } from './meal-policy.mjs'
export const POLICY={version:'planning-policy.v3',start:'10:00',end:'17:00',mealMinutes:45,mealAt:720,restIntervalMinutes:120,restMinutes:15,bufferMinutes:10,prepareMinutes:60};
function eventRows(reqs,date,points) {
  return reqs.filter(r=>active(r)&&r.key==='fixedEvent'&&r.value.date===date).map(r=>{
    const v=r.value;let start=v.startTime?clock(v.startTime):null,end=v.endTime?clock(v.endTime):null;
    // Flight departure is not an arrival deadline. Until an airport transfer provider is
    // configured the entire date is left out of sightseeing, even with a flight time.
    const flight=v.type==='flight';
    return {id:r.id,...v,start,end,point:points[v.poiId]||null,incomplete:flight||start===null||end===null||!points[v.poiId]}
  })
}
export async function scheduleItinerary({context,requirements=[],points,facts=[],tools,candidateOrder,policy={},signal,assignments={},frozenDays={}}) {
  const cfg={...POLICY,...policy};const dates=datesBetween(context.dateRange?.startDate,context.dateRange?.endDate);
  const requested=context.selectedPoiIds;
  assert(requested.length>0||requirements.some(isTourist),'NEEDS_CORE_CONTEXT','请至少选择一个景点或添加游客日程');
  const must=reqsIds(requirements,'mustVisit');
  const selected=[...new Set([...requested,...must])];
  assert(selected.every(id=>points[id]),'UNKNOWN_POI','已选点位数据缺失');
  const exclusions=new Set(reqsIds(requirements,'exclude'));
  assert(!must.some(id=>exclusions.has(id)),'CONFLICTING_SELECTION','同一景点不能同时保留和舍弃，请重新选择');
  assert(!requested.some(id=>exclusions.has(id)),'CONFLICTING_SELECTION','已选景点与舍弃名单冲突，请重新选择');
  let order=candidateOrder||selected;
  assert(Array.isArray(order)&&new Set(order).size===order.length&&order.length===selected.length&&order.every(id=>selected.includes(id)),'MODEL_PROTOCOL','模型必须保留全部已选点位且不可重复',502);
  if(!Object.keys(assignments).length&&!Object.keys(frozenDays).length)order=[...order.filter(id=>must.includes(id)),...order.filter(id=>!must.includes(id))];
  const covered=new Set(requirements.filter(r=>isTourist(r)&&r.value.fulfillsVisit!==false&&r.value.date&&r.value.startTime&&r.value.endTime&&points[r.value.poiId]).map(r=>r.value.poiId));
  const remaining=order.filter(id=>!covered.has(id)),allFacts=[...facts],unresolved=[],assumptions=[{code:'POLICY_DEFAULTS',policy:cfg}];
  const days=[];let reservedUnknownDay=false;
  const modelOnlyKeys=['party','shopping','budget','queue'];
  for(const r of requirements.filter(r=>active(r)&&modelOnlyKeys.includes(r.key)))assumptions.push({code:'PREFERENCE_NOT_FACT_VERIFIED',requirementId:r.id,message:'已提供给模型辅助排序；适龄、消费、排队及具体用餐体验尚无外部数据验证'});
  const origin=context.origin||null,destination=context.destination||context.origin||null;
  if(!origin&&context.planningBoundary!=='first_to_last_poi')unresolved.push({code:'UNKNOWN_ORIGIN',message:'未提供出发地点，首站交通待确认'});
  if(!destination&&context.planningBoundary!=='first_to_last_poi')unresolved.push({code:'UNKNOWN_DESTINATION',message:'未提供返回地点，末站交通待确认'});
  for(const r of requirements.filter(r=>active(r)&&r.key==='fixedEvent'&&!r.value.date))unresolved.push({code:'FIXED_EVENT_DATE_UNKNOWN',eventId:r.id,message:'固定安排日期尚未确认'});
  for(const date of dates) {
    signal?.throwIfAborted();
    const dep=pick(requirements,'departure',date),wake=pick(requirements,'wake',date);
    const start=dep?clock(dep):wake?clock(wake)+cfg.prepareMinutes:clock(cfg.start);
    const end=clock(pick(requirements,'dayEnd',date)||cfg.end);
    assert(start<end&&start<1440,'INVALID_DAY_WINDOW','出门时间须早于结束时间');
    if(frozenDays[date]) {
      const day=structuredClone(frozenDays[date]);day.startAt=timestamp(date,start,context.timeZone);day.endAt=timestamp(date,end,context.timeZone);
      for(const item of day.items.filter(i=>i.type==='visit'))if(remaining.includes(item.poiId)&&(!assignments[item.poiId]||assignments[item.poiId]===date))remaining.splice(remaining.indexOf(item.poiId),1);
      days.push(day);continue;
    }
    const events=eventRows(requirements,date,points).sort((a,b)=>(a.start??0)-(b.start??0));
    const incomplete=events.filter(e=>e.incomplete);
    for(const e of events.filter(e=>e.type==='activity'&&e.bookingState!=='booked'))unresolved.push({code:'BOOKING_UNCONFIRMED',eventId:e.id,message:'体验活动仅为暂定时间，预约尚未确认'});
    if(incomplete.length) {
      reservedUnknownDay=true;
      unresolved.push(...incomplete.map(e=>({code:'FIXED_EVENT_UNCONFIRMED',eventId:e.id,date,message:e.type==='flight'?'返程当日留空，机场接驳和赶机条件尚未验证':'固定活动时间或位置缺失，当日留空'})));
      days.push({date,startAt:timestamp(date,start,context.timeZone),endAt:timestamp(date,end,context.timeZone),items:[],totals:{occupied:0},unscheduledPoiIds:[]});continue;
    }
    const mobility=pick(requirements,'mobility',date)||{};
    const transport=pick(requirements,'transport',date)||{mode:mobility.lessWalking?'taxi':'mixed'};
    const rest={intervalMinutes:mobility.frequentBreaks?60:cfg.restIntervalMinutes,durationMinutes:cfg.restMinutes,...Object.fromEntries(Object.entries(pick(requirements,'rest',date)||{}).filter(([,v])=>v!=null))};
    const free=pick(requirements,'freeTime',date);
    const targetEnd=end-(free==='flexible'?60:free==='some_free'?30:0);
    const windowsForMeals=mealWindows(requirements,date,start,end,cfg);
    let items=[],cursor=start,last=origin,sinceRest=0,placedMeals=new Set(),walked=0;
    const push=(list,type,a,b,extra={})=>{if(b>a)list.push({id:randomUUID(),type,startAt:timestamp(date,a,context.timeZone),endAt:timestamp(date,b,context.timeZone),durationMinutes:b-a,poiId:null,eventId:null,fromId:null,toId:null,transportMode:null,walkMinutes:null,factIds:[],certainty:'estimated',...extra})};
    const leg=async(from,to,at)=>tools.travel(from,to,{date,departureMinute:at,mode:transport.mode,slow:mobility.slowerWalking,signal});
    const appendTravel=(list,t,from,to,at)=>{if(!t.fact)return at;allFacts.push(t.fact);push(list,'travel',at,at+t.minutes,{fromId:from.poiId||from.id,toId:to.poiId||to.id,transportMode:t.mode,walkMinutes:t.walkMinutes,factIds:[t.fact.id],certainty:t.certainty});return at+t.minutes};
    async function fit(p,limit,nextPoint,includeReturn) {
      let list=[],at=cursor,restAge=sinceRest,meals=new Set(placedMeals),embeddedMeals=[],embeddedBreaks=[];
      const internal=p.visitPolicy?.mealHandling==='inside'&&p.visitPolicy?.durationBasis==='elapsed';
      if(restAge>=rest.intervalMinutes&& !windowsForMeals.some(m=>!meals.has(m.id)&&at>=m.earliest&&at<=m.latest)) {if(at+rest.durationMinutes>limit)return null;push(list,'rest',at,at+rest.durationMinutes);at+=rest.durationMinutes;restAge=0}
      let t=await leg(last,p,at);
      if(mobility.maxLegWalkMinutes!=null&&t.walkMinutes>mobility.maxLegWalkMinutes)return null;
      const depth=requirements.filter(r=>r.key==='poiDepth'&&r.value.poiId===p.poiId&&applicable(r,date,p.poiId)).at(-1)?.value.depth||'normal';
      const minimum=depth==='quick'?p.durationRush:depth==='deep'?p.durationDeep:p.durationNormal;
      const duration=roundUpSlot(minimum);
      if(!Number.isInteger(minimum)||minimum<=0) {unresolved.push({code:'UNKNOWN_DURATION',poiId:p.poiId,depth});return null}
      for(const m of windowsForMeals.filter(m=>!meals.has(m.id)&&!internal)) {
        if(at>=m.preferred||at+(t.minutes||0)+duration>m.latest) {
          const mealAt=mealStart(m,at);
          if(mealAt>m.latest||mealAt+m.duration>limit)return null;
          push(list,'wait',at,mealAt);push(list,'meal',mealAt,mealAt+m.duration,{mealId:m.id,label:m.label,preserveClock:m.customWindow,nearPoiId:last?.poiId||null});
          at=mealAt+m.duration;meals.add(m.id);restAge=0;t=await leg(last,p,at);
        }
      }
      if(mobility.maxDailyWalkMinutes!=null&&walked+(t.walkMinutes||0)>mobility.maxDailyWalkMinutes)return null;
      if(at+(t.minutes||0)>limit)return null;
      at=appendTravel(list,t,last,p,at);
      const opening=p.opening[date];const windows=opening.windows??[[start,end]];
      let arrive=null;
      for(const [a,b] of windows) {const candidate=roundUpSlot(Math.max(at,a));if(candidate+duration<=b&&(opening.lastEntry==null||candidate<=opening.lastEntry)) {arrive=candidate;break}}
      if(arrive===null||arrive+duration+cfg.bufferMinutes>limit)return null;
      if(internal){for(const m of windowsForMeals.filter(m=>!meals.has(m.id)&&arrive+duration>m.latest)){
        const mealAt=mealStart(m,Math.max(arrive,m.preferred));if(mealAt>m.latest||mealAt+m.duration>arrive+duration)return null;
        embeddedMeals.push({mealId:m.id,label:m.label,startAt:timestamp(date,mealAt,context.timeZone),endAt:timestamp(date,mealAt+m.duration,context.timeZone),durationMinutes:m.duration,poiId:p.poiId,certainty:'estimated'});meals.add(m.id);
      }}
      if(internal&&p.visitPolicy?.restHandling==='inside'){
        let lastBreak=arrive-Math.min(rest.intervalMinutes,restAge+(t.minutes||0));
        for(const meal of [...embeddedMeals,{startAt:timestamp(date,arrive+duration,context.timeZone),endAt:timestamp(date,arrive+duration,context.timeZone)}]){
          const boundary=clock(meal.startAt.slice(11,16));
          while(lastBreak+rest.intervalMinutes+rest.durationMinutes<=boundary){const a=Math.max(arrive,lastBreak+rest.intervalMinutes);if(a+rest.durationMinutes>boundary)break;embeddedBreaks.push({startAt:timestamp(date,a,context.timeZone),endAt:timestamp(date,a+rest.durationMinutes,context.timeZone),durationMinutes:rest.durationMinutes,poiId:p.poiId,certainty:'estimated'});lastBreak=a+rest.durationMinutes;}
          if(boundary<arrive+duration)lastBreak=clock(meal.endAt.slice(11,16));
        }
      }
      push(list,'wait',at,arrive);at=arrive;
      push(list,'visit',at,at+duration,{poiId:p.poiId,depth,...(internal?{embeddedMeals,embeddedBreaks,visitPolicy:p.visitPolicy}:{}),planningPaddingMinutes:duration-minimum,factIds:[opening.factId,p.durationFactId],certainty:opening.certainty||'unknown'});at+=duration;
      push(list,'buffer',at,at+cfg.bufferMinutes);at+=cfg.bufferMinutes;
      for(const m of windowsForMeals.filter(m=>!meals.has(m.id)&&at>=m.preferred)) {
        const mealAt=mealStart(m,at);
        if(mealAt>m.latest||mealAt+m.duration>limit)return null;
        push(list,'wait',at,mealAt);push(list,'meal',mealAt,mealAt+m.duration,{mealId:m.id,label:m.label,preserveClock:m.customWindow,nearPoiId:p.poiId});at=mealAt+m.duration;meals.add(m.id);restAge=0;
      }
      const ret=includeReturn&&nextPoint?await leg(p,nextPoint,at):null;
      if(at+(ret?.minutes||0)>limit)return null;
      if(mobility.maxLegWalkMinutes!=null&&ret?.walkMinutes>mobility.maxLegWalkMinutes)return null;
      if(mobility.maxDailyWalkMinutes!=null&&walked+(t.walkMinutes||0)+(ret?.walkMinutes||0)>mobility.maxDailyWalkMinutes)return null;
      const lastPause=[...list.filter(i=>['meal','rest'].includes(i.type)),...embeddedMeals,...embeddedBreaks].sort((a,b)=>a.endAt.localeCompare(b.endAt)).at(-1);
      const restAgeAfter=lastPause?at-clock(lastPause.endAt.slice(11,16)):sinceRest+at-cursor;
      return {list,at,meals,restAge:restAgeAfter,point:p,walk:t.walkMinutes||0}
    }
    const futureDays=dates.filter(d=>d>=date&&!frozenDays[d]).length;
    const durationFor=id=>{const depth=requirements.filter(r=>r.key==='poiDepth'&&r.value.poiId===id&&applicable(r,date,id)).at(-1)?.value.depth||'normal';return (depth==='quick'?points[id].durationRush:depth==='deep'?points[id].durationDeep:points[id].durationNormal)||0};
    const dailyTarget=policy.balanceWorkload?remaining.reduce((n,id)=>n+durationFor(id)+cfg.bufferMinutes+15,0)/Math.max(1,futureDays):Infinity;
    let placedWork=0;
    const visitSegment=async(limit,nextPoint,includeReturn)=>{
      for(const id of [...remaining]) {
        if(placedWork>=dailyTarget&&futureDays>1&&!assignments[id])continue;
        const p=points[id];if(exclusions.has(id)||assignments[id]&&assignments[id]!==date)continue;
        const result=await fit(p,limit,nextPoint,includeReturn);
        if(result) {placedWork+=result.at-cursor;items.push(...result.list);cursor=result.at;placedMeals=result.meals;walked+=result.walk;sinceRest=result.restAge;last=result.point;remaining.splice(remaining.indexOf(id),1)}
      }
    };
    for(const event of events) {
      await visitSegment(Math.min(targetEnd,event.start-(event.arrivalMinutes||0)),event.point,true);
      const deadline=event.start-(event.arrivalMinutes||0);
      for(const m of windowsForMeals.filter(m=>!placedMeals.has(m.id)&&event.end>m.latest)){
        const mealAt=mealStart(m,Math.max(cursor,m.earliest)),trip=await leg(last,event.point,mealAt+m.duration);
        if(mealAt<=m.latest&&mealAt+m.duration+(trip.minutes||0)<=deadline){push(items,'wait',cursor,mealAt);push(items,'meal',mealAt,mealAt+m.duration,{mealId:m.id,label:m.label,preserveClock:m.customWindow,nearPoiId:last?.poiId||null});cursor=mealAt+m.duration;placedMeals.add(m.id);sinceRest=0;}
      }
      const t=await leg(last,event.point,cursor);if(cursor+(t.minutes||0)>=1440){unresolved.push({code:'FIXED_EVENT_LATE',eventId:event.id});continue;}cursor=appendTravel(items,t,last,event.point,cursor);
      const arrived=cursor;
      push(items,'wait',cursor,Math.max(cursor,deadline));cursor=Math.max(cursor,deadline);
      push(items,'event_checkin',cursor,Math.max(cursor,event.start),{eventId:event.id,poiId:event.poiId,label:'提前到场',arrivalDeadline:timestamp(date,deadline,context.timeZone)});cursor=Math.max(cursor,event.start);
      const dur=Math.max(1,event.end-event.start);if(cursor+dur>=1440){unresolved.push({code:'FIXED_EVENT_LATE',eventId:event.id});continue;}
      push(items,'fixed_event',cursor,cursor+dur,{eventId:event.id,poiId:event.poiId,label:event.title||'固定安排',touristSchedule:event.type==='tourist',fulfillsVisit:event.type==='tourist'&&event.fulfillsVisit!==false,locationName:event.point?.name||event.location||'',certainty:event.type==='tourist'?'user_confirmed':'observed',scheduledStart:timestamp(date,event.start,context.timeZone),arrivedAt:timestamp(date,arrived,context.timeZone),arrivalDeadline:timestamp(date,deadline,context.timeZone)});
      cursor+=dur;last=event.point;sinceRest=0;
    }
    await visitSegment(targetEnd,destination,true);
    for(const m of windowsForMeals.filter(m=>!placedMeals.has(m.id)&&cursor>=m.earliest)) {
      const at=mealStart(m,cursor);
      const ret=destination&&last?await leg(last,destination,at+m.duration):null;
      if(at<=m.latest&&at+m.duration+(ret?.minutes||0)<=end){push(items,'wait',cursor,at);push(items,'meal',at,at+m.duration,{mealId:m.id,label:m.label,preserveClock:m.customWindow,nearPoiId:last?.poiId||null});cursor=at+m.duration;placedMeals.add(m.id)}
    }
    if(last&&destination&&last!==origin) {const t=await leg(last,destination,cursor);cursor=appendTravel(items,t,last,destination,cursor)}
    const totals={occupied:items.reduce((n,x)=>n+x.durationMinutes,0)};
    for(const x of items)totals[x.type]=(totals[x.type]||0)+x.durationMinutes;
    totals.walkMinutes=items.filter(i=>i.type==='travel').reduce((sum,i)=>sum+(i.walkMinutes||0),0);
    days.push({walkingCoverage:'between_places_only',mealWindows:windowsForMeals,date,startAt:timestamp(date,start,context.timeZone),endAt:timestamp(date,end,context.timeZone),items,totals,unscheduledPoiIds:[]});
  }
  // One authoritative list, not repeated in every day's accounting.
  const deferredPoiIds=reservedUnknownDay?remaining.filter(id=>!exclusions.has(id)):[];
  if(deferredPoiIds.length)unresolved.push({code:'UNSCHEDULED_PENDING_FACT',poiIds:deferredPoiIds,message:'部分景点因固定安排未确认而暂未排入'});
  if(requirements.some(r=>active(r)&&r.key==='mobility'&&r.value.dailyStepsMax!=null))unresolved.push({code:'DAILY_STEPS_ESTIMATED',message:'步数仅作偏好参考，尚缺景点内部步行数据，无法验证全日步数'});
  const draft={context,days,requirements,unresolved,assumptions,facts:allFacts,unscheduledPoiIds:remaining,deferredPoiIds,selectedPoiIds:selected,assignedDates:assignments};
  for(const r of requirements.filter(r=>active(r)&&r.strength==='hard'&&!['wake','departure','dayEnd','transport','rest','mobility','poiDepth','mustVisit','exclude','fixedEvent','scheduleLock','meals'].includes(r.key)))unresolved.push({code:'UNSUPPORTED_HARD_CONSTRAINT',requirementId:r.id});
  return draft;
}
export function reqsIds(reqs,key) { return reqs.filter(r=>r.key===key&&active(r)).flatMap(r=>r.value) }
export function validateItinerary(draft,{preserve,baselineSnapshot}={}) {
  const checks=[],violations=[],unknown=[];
  const fail=(code,relatedIds=[],message=code)=>{checks.push({code,status:'fail',relatedIds});violations.push({code,relatedIds,message})};
  const pass=(code,ids=[])=>checks.push({code,status:'pass',relatedIds:ids});
  const reqs=draft.requirements||[],visits=draft.days.flatMap(d=>d.items.filter(i=>i.type==='visit'));
  const covered=draft.days.flatMap(d=>d.items.filter(i=>i.type==='fixed_event'&&i.touristSchedule&&i.fulfillsVisit).map(i=>i.poiId));
  const ids=[...visits.map(i=>i.poiId),...[...new Set(covered)].filter(id=>(draft.selectedPoiIds||draft.context.selectedPoiIds).includes(id))],facts=new Map((draft.facts||[]).map(f=>[f.id,f]));
  for(const id of ids)if(!(draft.selectedPoiIds||draft.context.selectedPoiIds).includes(id))fail('UNEXPECTED_POI',[id]);
  for(const [id,date]of Object.entries(draft.assignedDates||{}))if(draft.days.some(d=>d.date!==date&&d.items.some(i=>i.type==='visit'&&i.poiId===id)))fail('ASSIGNED_DATE_CHANGED',[id,date]);
  const events=reqs.filter(r=>active(r)&&r.key==='fixedEvent');
  const canDefer=events.some(r=>draft.days.some(d=>d.date===r.value.date)&&(!r.value.startTime||!r.value.endTime||!r.value.poiId||r.value.type==='flight'));
  const deferred=id=>canDefer&&draft.deferredPoiIds?.includes(id);
  for(const id of draft.selectedPoiIds||draft.context.selectedPoiIds) {if(!ids.includes(id)&&!deferred(id))fail('UNSCHEDULED_POI',[id]);else if(ids.includes(id))pass('SELECTED_POI',[id])}
  if(new Set(ids).size!==ids.length)fail('DUPLICATE_POI');
  for(const id of reqsIds(reqs,'exclude'))if(ids.includes(id))fail('EXCLUDED_POI',[id]);
  for(const id of reqsIds(reqs,'mustVisit'))if(!ids.includes(id)&&!deferred(id))fail('MISSING_MUST_VISIT',[id]);
  for(const r of events) {
    const v=r.value;
    if(v.type==='tourist'&&(!v.date||!v.startTime||!v.endTime||!v.poiId)){fail('TOURIST_SCHEDULE_INCOMPLETE',[r.id]);continue;}
    if(!v.date||!v.startTime||!v.endTime||!v.poiId||v.type==='flight'){unknown.push({code:'FIXED_EVENT_UNCONFIRMED',eventId:r.id});continue}
    const item=draft.days.flatMap(d=>d.items).find(i=>i.type==='fixed_event'&&i.eventId===r.id);
    if(!item)fail('MISSING_FIXED_EVENT',[r.id]);
    else if(item.startAt!==timestamp(v.date,clock(v.startTime),draft.context.timeZone)||item.endAt!==timestamp(v.date,clock(v.endTime),draft.context.timeZone)||item.poiId!==v.poiId)fail('FIXED_EVENT_MISMATCH',[r.id]);
    if(item&&v.type==='tourist'){const deadline=timestamp(v.date,clock(v.startTime)-(v.arrivalMinutes||0),draft.context.timeZone);const day=draft.days.find(d=>d.date===v.date),position=day.items.indexOf(item),preceding=day.items.slice(0,position).filter(i=>i.type==='travel'||i.type==='visit'||i.type==='fixed_event').at(-1);if(preceding&&Date.parse(preceding.endAt)>Date.parse(deadline))fail('FIXED_EVENT_ARRIVAL_LATE',[r.id]);if(!item.arrivedAt||Date.parse(item.arrivedAt)>Date.parse(deadline)||item.arrivalDeadline!==deadline)fail('FIXED_EVENT_ARRIVAL_LATE',[r.id]);if(item.label!==v.title||item.touristSchedule!==true||item.fulfillsVisit!==(v.fulfillsVisit!==false))fail('FIXED_EVENT_MISMATCH',[r.id]);if(v.arrivalMinutes){const checkin=day.items.find(i=>i.type==='event_checkin'&&i.eventId===r.id);if(!checkin||checkin.startAt!==deadline||checkin.endAt!==item.startAt||checkin.poiId!==v.poiId)fail('FIXED_EVENT_ARRIVAL_LATE',[r.id]);}}
    if(item&&v.type==='activity') {
      const f=[...facts.values()].find(f=>f.kind==='opening'&&f.validFor.poiId===v.poiId&&f.validFor.date===v.date);
      if(f?.value.windows&&!f.value.windows.some(([a,b])=>clock(v.startTime)>=a&&clock(v.endTime)<=b))fail('EVENT_OUTSIDE_OPENING',[r.id]);
      if(!f||f.certainty==='unknown')unknown.push({code:'EVENT_OPENING_UNCONFIRMED',eventId:r.id});
      if(v.bookingState!=='booked')unknown.push({code:'BOOKING_UNCONFIRMED',eventId:r.id});
    }
  }
  for(const d of draft.days) {
    const failuresBefore=violations.length;
    let cursor=Date.parse(d.startAt),last=draft.context.origin?.id||null,continuous=0;
    const restRequirement=reqs.filter(r=>r.key==='rest'&&r.strength==='hard'&&applicable(r,d.date)).at(-1)?.value;
    const hardRest=restRequirement?{intervalMinutes:POLICY.restIntervalMinutes,durationMinutes:POLICY.restMinutes,...Object.fromEntries(Object.entries(restRequirement).filter(([,v])=>v!=null))}:null;
    const expectedStart=pick(reqs,'departure',d.date),expectedEnd=pick(reqs,'dayEnd',d.date);
    if(expectedStart&&Date.parse(d.startAt)<Date.parse(timestamp(d.date,clock(expectedStart),draft.context.timeZone)))fail('DEPARTURE_CONSTRAINT',[d.date]);
    if(expectedEnd&&Date.parse(d.endAt)>Date.parse(timestamp(d.date,clock(expectedEnd),draft.context.timeZone)))fail('DAY_END_CONSTRAINT',[d.date]);
    for(const i of d.items) {
      const a=Date.parse(i.startAt),b=Date.parse(i.endAt);
      if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||minutesBetween(i.startAt,i.endAt)!==i.durationMinutes)fail('INVALID_ITEM_TIME',[i.id]);
      if(a<cursor)fail('TIME_OVERLAP',[i.id]);
      if(b>Date.parse(d.endAt))fail('DAY_END_EXCEEDED',[i.id]);cursor=b;
      if(['rest','meal'].includes(i.type)&&(!hardRest||i.durationMinutes>=hardRest.durationMinutes))continuous=0;
      else if(i.type==='visit'&&((i.embeddedMeals?.length||0)+(i.embeddedBreaks?.length||0))){let at=a;for(const pause of [...(i.embeddedMeals||[]),...(i.embeddedBreaks||[])].sort((x,y)=>x.startAt.localeCompare(y.startAt))){continuous+=(Date.parse(pause.startAt)-at)/60000;if(hardRest&&continuous>hardRest.intervalMinutes)fail('REST_INTERVAL_EXCEEDED',[i.id]);if(!hardRest||pause.durationMinutes>=hardRest.durationMinutes)continuous=0;at=Date.parse(pause.endAt)}continuous+=(b-at)/60000;}
      else if(['travel','visit'].includes(i.type))continuous+=i.durationMinutes;
      if(hardRest&&continuous>hardRest.intervalMinutes)fail('REST_INTERVAL_EXCEEDED',[i.id]);
      if(i.type==='travel') {
        const f=facts.get(i.factIds[0]);
        const departureMinute=Number(i.startAt.slice(11,13))*60+Number(i.startAt.slice(14,16));
        if(!f||f.kind!=='travel'||f.value.minutes!==i.durationMinutes||f.validFor.fromId!==i.fromId||f.validFor.toId!==i.toId||f.validFor.date!==d.date||f.validFor.departureMinute!==departureMinute)fail('INVALID_TRAVEL_FACT',[i.id]);
        if(last&&last!==i.fromId)fail('TRAVEL_DISCONTINUITY',[i.id]);last=i.toId;
        const mobility=pick(reqs,'mobility',d.date)||{};
        if(mobility.maxLegWalkMinutes!=null&&i.walkMinutes>mobility.maxLegWalkMinutes)fail('WALK_LIMIT',[i.id]);
        const tr=reqs.filter(r=>r.key==='transport'&&r.strength==='hard'&&applicable(r,d.date)).at(-1);
        if(tr&&tr.value.mode!=='mixed'&&i.transportMode!==tr.value.mode)fail('TRANSPORT_CONSTRAINT',[i.id]);
      }
      if(['visit','fixed_event','event_checkin'].includes(i.type)) {
        if(last&&last!==i.poiId)fail('MISSING_TRAVEL',[i.id]);last=i.poiId;
        if(i.type==='event_checkin')continue;
        if(i.type==='fixed_event') {if(i.scheduledStart!==i.startAt)fail('FIXED_EVENT_LATE',[i.id]);continue}
        const f=facts.get(i.factIds[0]);
        if(!f||f.kind!=='opening'||f.validFor.date!==d.date||f.validFor.poiId!==i.poiId)fail('MISSING_OPENING_FACT',[i.id]);
        else {
          const minute=Number(i.startAt.slice(11,13))*60+Number(i.startAt.slice(14,16));
          if(f.value.windows&&!f.value.windows.some(([a,b])=>minute>=a&&minute+i.durationMinutes<=b))fail('OUTSIDE_OPENING',[i.id]);
          if(f.value.lastEntry!=null&&minute>f.value.lastEntry)fail('AFTER_LAST_ENTRY',[i.id]);
          if(f.certainty==='unknown'||f.value.windows===null)unknown.push({code:'OPENING_UNCONFIRMED',poiId:i.poiId});
        }
        if(i.embeddedMeals?.length){const durationFact=i.factIds.map(id=>facts.get(id)).find(f=>f?.kind==='duration');if(durationFact?.value.visitPolicy?.mealHandling!=='inside'||durationFact?.value.visitPolicy?.durationBasis!=='elapsed')fail('INVALID_INTERNAL_MEAL',[i.id]);for(const meal of i.embeddedMeals)if(meal.poiId!==i.poiId||Date.parse(meal.startAt)<a||Date.parse(meal.endAt)>b||minutesBetween(meal.startAt,meal.endAt)!==meal.durationMinutes)fail('INVALID_INTERNAL_MEAL',[i.id]);}
        if(i.embeddedBreaks?.length){const fact=i.factIds.map(id=>facts.get(id)).find(f=>f?.kind==='duration');if(fact?.value.visitPolicy?.restHandling!=='inside'||fact?.value.visitPolicy?.durationBasis!=='elapsed')fail('INVALID_INTERNAL_REST',[i.id]);for(const pause of i.embeddedBreaks)if(pause.poiId!==i.poiId||Date.parse(pause.startAt)<a||Date.parse(pause.endAt)>b||minutesBetween(pause.startAt,pause.endAt)!==pause.durationMinutes)fail('INVALID_INTERNAL_REST',[i.id]);}
        const pauses=[...(i.embeddedMeals||[]),...(i.embeddedBreaks||[])].sort((a,b)=>a.startAt.localeCompare(b.startAt));for(let j=1;j<pauses.length;j++)if(Date.parse(pauses[j].startAt)<Date.parse(pauses[j-1].endAt))fail('INTERNAL_BREAK_OVERLAP',[i.id]);
        const durationFact=i.factIds.map(id=>facts.get(id)).find(f=>f?.kind==='duration');
        if(!durationFact||durationFact.validFor.poiId!==i.poiId||durationFact.value[i.depth]+(i.planningPaddingMinutes||0)!==i.durationMinutes||(i.planningPaddingMinutes||0)<0||(i.planningPaddingMinutes||0)>=5)fail('INVALID_VISIT_DURATION',[i.id]);
        const depth=reqs.filter(r=>r.key==='poiDepth'&&r.value.poiId===i.poiId&&applicable(r,d.date,i.poiId)).at(-1)?.value.depth;
        if(depth&&depth!==i.depth)fail('DEPTH_CONSTRAINT',[i.id]);
      }
    }
    const mobility=pick(reqs,'mobility',d.date)||{};
    const walking=d.items.filter(i=>i.type==='travel').reduce((s,i)=>s+(i.walkMinutes||0),0);
    if(mobility.maxDailyWalkMinutes!=null&&walking>mobility.maxDailyWalkMinutes)fail('DAILY_WALK_LIMIT',[d.date]);
    const localMinute=t=>Number(t.slice(11,13))*60+Number(t.slice(14,16));
    const cfg=draft.assumptions?.find(a=>a.code==='POLICY_DEFAULTS')?.policy||POLICY;
    const expectedMeals=mealWindows(reqs,d.date,localMinute(d.startAt),localMinute(d.endAt),cfg);
    for(const m of expectedMeals) {
      const meals=[...d.items.filter(i=>i.type==='meal'&&i.mealId===m.id),...d.items.filter(i=>i.type==='visit').flatMap(i=>(i.embeddedMeals||[]).filter(x=>x.mealId===m.id))];
      if(meals.length>1)fail('DUPLICATE_MEAL',[d.date,m.id]);
      if(!meals.length&&d.items.some(i=>['visit','fixed_event'].includes(i.type)&&localMinute(i.endAt)>m.latest))fail('MEAL_UNSCHEDULED',[d.date,m.id]);
      for(const meal of meals)if(localMinute(meal.startAt)<m.earliest||localMinute(meal.startAt)>m.latest||meal.durationMinutes<m.duration)fail('MEAL_WINDOW',[meal.id]);
    }
    const destination=draft.context.destination||draft.context.origin;
    if(d.items.length&&destination&&last!==destination.id)fail('MISSING_RETURN_TRAVEL',[d.date]);
    if(d.totals.occupied!==d.items.reduce((s,i)=>s+i.durationMinutes,0))fail('INVALID_TOTAL',[d.date]);
    if(violations.length===failuresBefore)pass('DAY_CHECKED',[d.date]);
  }
  const lock=preserve||{lockedDates:reqs.filter(r=>r.key==='scheduleLock'&&active(r)).flatMap(r=>r.value.lockedDates),lockedItemIds:[]};
  const semantic=items=>items.map(({id,factIds,...rest})=>rest);
  if(lock.lockedDates?.length||lock.lockedItemIds?.length) {
    if(!baselineSnapshot)fail('MISSING_LOCK_BASELINE');
    else {
      for(const date of lock.lockedDates||[])if(JSON.stringify(semantic(draft.days.find(d=>d.date===date)?.items||[]))!==JSON.stringify(semantic(baselineSnapshot.days.find(d=>d.date===date)?.items||[])))fail('LOCKED_DAY_CHANGED',[date]);
      for(const id of lock.lockedItemIds||[]) {const old=baselineSnapshot.days.flatMap(d=>d.items).find(i=>i.id===id),now=draft.days.flatMap(d=>d.items).find(i=>i.id===id);if(!old||!now||JSON.stringify(semantic([old]))!==JSON.stringify(semantic([now])))fail('LOCKED_ITEM_CHANGED',[id])}
    }
  }
  unknown.push(...draft.unresolved);
  checks.push(...unknown.map(u=>({code:u.code,status:'unknown',relatedIds:[u.poiId||u.requirementId||u.eventId].filter(Boolean)})));
  return {status:violations.length?'failed':unknown.length?'provisional':'passed',checkedAt:new Date().toISOString(),factSnapshotId:randomUUID(),checks,violations,unresolved:unknown};
}
