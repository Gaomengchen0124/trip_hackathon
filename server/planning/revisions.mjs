import {scheduleHybrid} from './hybrid-planner.mjs'
import {preferenceFit} from '../../src/planning/preference-ranking.mjs'
import { randomUUID,createHash } from 'node:crypto'
import { assert,active,datesBetween,clock } from '../../src/planning/core.mjs'
import { validateValue } from '../../src/planning/requirements.mjs'
import { scheduleItinerary,validateItinerary,reqsIds } from '../../src/planning/scheduler.mjs'
import { haversineKm } from '../../src/planner.mjs'
const TTL=10*60000;
const visits=it=>it.days.flatMap(d=>d.items.filter(i=>i.type==='visit').map(i=>({...i,date:d.date})));
const total=it=>it.days.reduce((n,d)=>n+(d.totals.occupied||0),0);
const walking=it=>it.days.reduce((n,d)=>n+(d.totals.walkMinutes||0),0);
const signature=it=>createHash('sha256').update(JSON.stringify(it.days.map(d=>({date:d.date,items:d.items.map(({id,factIds,...i})=>i)})))).digest('hex');
function changeSummary(old,next) {
  const before=new Map(visits(old).map(v=>[v.poiId,v])),after=new Map(visits(next).map(v=>[v.poiId,v]));
  return {added:[...after.keys()].filter(id=>!before.has(id)),removed:[...before.keys()].filter(id=>!after.has(id)),moved:[...after].filter(([id,v])=>before.has(id)&&v.date!==before.get(id).date).map(([poiId,v])=>({poiId,fromDate:before.get(poiId).date,toDate:v.date})),depthChanged:[...after].filter(([id,v])=>before.has(id)&&v.depth!==before.get(id).depth).map(([poiId,v])=>({poiId,from:before.get(poiId).depth,to:v.depth})),timeChanged:[...after].filter(([id,v])=>before.has(id)&&(v.startAt!==before.get(id).startAt||v.endAt!==before.get(id).endAt)).map(([poiId,v])=>({poiId,before:before.get(poiId),after:v})),incrementalMinutes:total(next)-total(old),incrementalWalkMinutes:walking(next)-walking(old),days:next.days.map(d=>({date:d.date,incrementalMinutes:d.totals.occupied-(old.days.find(x=>x.date===d.date)?.totals.occupied||0)}))}
}
function applyOperations(old,operations,line,source,text) {
  assert(Array.isArray(operations)&&operations.length>0&&operations.length<=40,'INVALID_OPERATIONS','请提供1至40个明确修改');
  const context=structuredClone(old.context),requirements=structuredClone(old.requirements),rows=visits(old),order=[...new Set([...rows.map(v=>v.poiId),...context.selectedPoiIds])];
  for(const r of requirements.filter(r=>active(r)&&r.key==='exclude')){r.value=r.value.filter(id=>!context.selectedPoiIds.includes(id));if(!r.value.length)r.state='superseded'}
  const assignments=Object.fromEntries(rows.map(v=>[v.poiId,v.date]));const dates=old.days.map(d=>d.date),touched=new Set(),removed=[];
  const known=id=>line.pois.some(p=>p.poiId===id);
  function touch(id){if(assignments[id])touched.add(assignments[id])}
  for(const op of operations) {
    assert(op&&typeof op==='object','INVALID_OPERATIONS','修改操作格式不正确');
    if(source==='model')assert(typeof op.evidence?.quote==='string'&&op.evidence.quote.length>0&&text.includes(op.evidence.quote),'UNSUPPORTED_EVIDENCE','修改缺少本次用户原文依据',502);
    const evidence={messageId:null,answerId:null,quote:source==='model'?op.evidence.quote:JSON.stringify(op),factId:null};
    if(['add_poi','remove_poi','move_poi','set_depth'].includes(op.type))assert(known(op.poiId),'UNKNOWN_POI','修改引用了未收录景点');
    if(op.type==='add_poi'||op.type==='move_poi') {
      const exists=context.selectedPoiIds.includes(op.poiId);
      assert(op.type==='add_poi'?!exists:exists,'INVALID_OPERATIONS',op.type==='add_poi'?'景点已经在行程中':'只能移动已有景点');
      const date=op.date||assignments[op.poiId]||old.days[0].date;assert(dates.includes(date),'INVALID_SCOPE','目标日期不在行程内');touch(op.poiId);touched.add(date);
      if(!exists){context.selectedPoiIds.push(op.poiId);for(const r of requirements.filter(r=>active(r)&&r.key==='exclude')){r.value=r.value.filter(id=>id!==op.poiId);if(!r.value.length)r.state='superseded'}}else order.splice(order.indexOf(op.poiId),1);
      let index=order.length;
      if(op.afterItemId) {const anchor=rows.find(v=>v.id===op.afterItemId);assert(anchor&&anchor.date===date&&anchor.poiId!==op.poiId,'INVALID_ANCHOR','插入位置已失效，请重试');index=order.indexOf(anchor.poiId)+1;assert(index>0,'INVALID_ANCHOR','插入位置已失效')}
      else {const first=order.findIndex(id=>assignments[id]===date);index=first<0?order.length:first}
      order.splice(index,0,op.poiId);assignments[op.poiId]=date;
    } else if(op.type==='remove_poi') {
      assert(context.selectedPoiIds.includes(op.poiId),'INVALID_OPERATIONS','景点已不在当前行程');touch(op.poiId);context.selectedPoiIds=context.selectedPoiIds.filter(id=>id!==op.poiId);order.splice(order.indexOf(op.poiId),1);delete assignments[op.poiId];removed.push(op.poiId);
    } else if(op.type==='set_depth'||op.type==='set_requirement') {
      const key=op.type==='set_depth'?'poiDepth':op.key,value=op.type==='set_depth'?{poiId:op.poiId,depth:op.depth}:op.value;
      assert(key!=='scheduleLock','INVALID_OPERATIONS','请使用锁定日期操作');validateValue(key,value);
      const scope=op.scope||{type:'trip',targetId:null};assert(['trip','day','poi'].includes(scope.type),'INVALID_SCOPE','需求作用范围不正确');
      if(scope.type==='day')assert(dates.includes(scope.targetId),'INVALID_SCOPE','需求日期不正确');if(scope.type==='poi')assert(known(scope.targetId),'INVALID_SCOPE','需求景点不正确');
      const ids=['mustVisit','exclude'].includes(key)?value:key==='poiDepth'?[value.poiId]:key==='fixedEvent'&&value.poiId?[value.poiId]:[];assert(ids.every(known),'UNKNOWN_POI','需求引用未收录点位');
      if(key==='fixedEvent'&&value.date)assert(dates.includes(value.date),'INVALID_SCOPE','活动日期不在行程内');
      for(const r of requirements.filter(r=>active(r)&&r.key===key&&r.scope.type===scope.type&&r.scope.targetId===scope.targetId&&(key!=='poiDepth'||r.value.poiId===value.poiId)&&(key!=='fixedEvent'||r.id===op.requirementId)))r.state='superseded';
      requirements.push({id:randomUUID(),key,value,strength:op.strength||'soft',scope,source:source==='model'?'user_text':'user_option',evidence,state:'confirmed'});
      assert(['hard','soft'].includes(requirements.at(-1).strength),'INVALID_REQUIREMENT','需求强度不正确');
      if(key==='mustVisit')for(const id of value)if(!context.selectedPoiIds.includes(id)){context.selectedPoiIds.push(id);order.push(id);assignments[id]=dates[0];touched.add(dates[0])}
      if(key==='poiDepth')touch(value.poiId);else if(scope.type==='day')touched.add(scope.targetId);else dates.forEach(d=>touched.add(d));
    } else if(['lock_day','unlock_day'].includes(op.type)) {
      assert(dates.includes(op.date),'INVALID_SCOPE','锁定日期不在行程内');
      for(const r of requirements.filter(r=>active(r)&&r.key==='scheduleLock')) {
        if(op.type==='unlock_day')r.value.lockedDates=r.value.lockedDates.filter(d=>d!==op.date);
        if(!r.value.lockedDates.length&&!r.value.lockedItemIds.length)r.state='superseded'
      }
      if(op.type==='lock_day')requirements.push({id:randomUUID(),key:'scheduleLock',value:{lockedDates:[op.date],lockedItemIds:[],baselineVersion:old.version},strength:'hard',scope:{type:'trip',targetId:null},source:source==='model'?'user_text':'user_option',evidence,state:'confirmed'});
    } else assert(false,'INVALID_OPERATIONS','不支持的修改操作');
  }
  assert(context.selectedPoiIds.length>0,'EMPTY_ITINERARY','至少保留一个景点；也可以返回首页重新选择');
  assert(context.selectedPoiIds.length<=30,'TOO_MANY_POIS','行程最多30个景点');
  const protectedRemoved=removed.filter(id=>reqsIds(requirements,'mustVisit').includes(id));
  const lockedDates=[...new Set(requirements.filter(r=>active(r)&&r.key==='scheduleLock').flatMap(r=>r.value.lockedDates))];
  const preserve={lockedDates,lockedItemIds:requirements.filter(r=>active(r)&&r.key==='scheduleLock').flatMap(r=>r.value.lockedItemIds),baselineVersion:old.version,minimizeOtherChanges:true};
  return {context,requirements,order:order.filter(id=>context.selectedPoiIds.includes(id)),assignments,touched,preserve,protectedRemoved};
}
export function createRevisionService({store,llm,tools,catalogue,model,profileProvider=async()=>({}),now=Date.now,totalTimeoutMs=60000}={}) {
  const pending=new Set();
  function base(owner,id,input) {
    const it=store.get(owner,id,'itinerary'),s=store.get(owner,it.planningSessionId,'session');
    assert(it.version===input.baseVersion,'STALE_VERSION','行程已更新，请刷新后重新预览',409);
    assert(input.baseIntakeRevision===undefined||input.baseIntakeRevision===s.intakeRevision,'STALE_INTAKE','需求已更新，请重新预览',409);
    assert(s.intakeRevision===it.intakeRevision,'STALE_INTAKE','当前行程的需求已变化，请先重新生成',409);return {it,s}
  }
  function job(owner,work) {
    const j={id:randomUUID(),state:'queued',phase:'scheduling',result:null,error:null};store.put(owner,j.id,'job',j);
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),totalTimeoutMs);
    const task=(async()=>{try{j.state='running';store.put(owner,j.id,'job',j);j.result=await Promise.race([work(ctrl.signal,phase=>{ctrl.signal.throwIfAborted();j.phase=phase;store.put(owner,j.id,'job',j)}),new Promise((_,reject)=>ctrl.signal.addEventListener('abort',()=>reject(Object.assign(new Error('修改超时，请重试'),{code:'PLANNING_TIMEOUT',retryable:true})),{once:true}))]);j.state='succeeded';j.phase='complete'}catch(e){j.state='failed';j.error={code:e.code||'REVISION_FAILED',message:e.code?e.message:'修改失败，原行程已保留',retryable:e.retryable||false}}finally{clearTimeout(timer);store.put(owner,j.id,'job',j)}})();pending.add(task);task.finally(()=>pending.delete(task));return j
  }
  async function refreshFacts(it,points,signal) {
    const snapshot=structuredClone(it),facts=[];
    const locations=new Map(Object.values(points).map(p=>[p.poiId,p]));
    for(const p of [it.context.origin,it.context.destination].filter(Boolean))locations.set(p.id,p);
    for(const d of snapshot.days)for(const i of d.items) {
      if(i.type==='visit'){const p=points[i.poiId];if(p)i.factIds=[p.opening[d.date].factId,p.durationFactId]}
      if(i.type==='travel'){
        const t=await tools.travel(locations.get(i.fromId),locations.get(i.toId),{date:d.date,departureMinute:clock(i.startAt.slice(11,16)),mode:i.transportMode,slow:Boolean(it.requirements.find(r=>active(r)&&r.key==='mobility')?.value.slowerWalking),signal});
        if(t.fact){facts.push(t.fact);i.factIds=[t.fact.id]}
      }
    }
    return {snapshot,facts}
  }
  async function build(old,operations,{source='manual',text='',signal}={}) {
    const line=await catalogue(old.context.lineId),edit=applyOperations(old,operations,line,source,text),dates=old.days.map(d=>d.date);
    const pf=await tools.poiFacts(line.pois,dates,{signal});const refreshed=await refreshFacts(old,pf.points,signal);
    const frozenDays=Object.fromEntries(refreshed.snapshot.days.filter(d=>!edit.touched.has(d.date)||edit.preserve.lockedDates.includes(d.date)).map(d=>[d.date,d]));
    const fullOrder=[...new Set([...edit.order,...reqsIds(edit.requirements,'mustVisit')])];
    const draft=(await scheduleHybrid({context:edit.context,requirements:edit.requirements,points:pf.points,facts:[...pf.facts,...refreshed.facts],tools,candidateOrder:fullOrder,assignments:edit.assignments,frozenDays,signal},{maxTrials:12,maxSearchMs:400,validator:d=>validateItinerary(d,{preserve:edit.preserve,baselineSnapshot:old})})).draft;
    // Unknown fixed events must survive local edits that freeze their date.
    for(const u of old.unresolved||[])if(u.eventId&&edit.requirements.some(r=>active(r)&&r.id===u.eventId))draft.unresolved.push(u);
    if(old.unresolved?.some(u=>u.code==='TEXT_NOT_PARSED'))draft.unresolved.push({code:'TEXT_NOT_PARSED',message:'规则排程仍未解析首次自由文字，原文字要求尚未应用'});
    const validation=validateItinerary(draft,{preserve:edit.preserve,baselineSnapshot:old});
    for(const poiId of edit.protectedRemoved)validation.violations.push({code:'PROTECTED_POI',relatedIds:[poiId],message:'这是必去景点，请先明确取消必去再删除'});
    if(validation.violations.length)validation.status='failed';
    const proposedItinerary={...draft,engineMode:source==='model'?'ai':old.engineMode||'ai',initialEngineMode:old.initialEngineMode||old.engineMode||'ai',id:old.id,version:old.version+1,planningSessionId:old.planningSessionId,intakeRevision:old.intakeRevision+1,validation,conflicts:validation.violations,createdAt:old.createdAt,updatedAt:new Date(now()).toISOString()};
    return {proposedItinerary,validation,preserve:edit.preserve,diff:changeSummary(old,proposedItinerary)}
  }
  function revise(owner,id,input) {
    const {it}=base(owner,id,input);
    assert(typeof (input.text||'')==='string'&&(input.text||'').length<=6000,'INVALID_TEXT','修改文字过长');
    const modes=[Boolean(input.text?.trim()),Boolean(input.operations?.length),Boolean(input.selectedCandidateIds?.length)].filter(Boolean).length;
    const timedAddition=!input.text?.trim()&&input.selectedCandidateIds?.length&&input.operations?.length&&input.operations.every(op=>op.type==='set_requirement'&&['departure','dayEnd'].includes(op.key)&&(!op.scope||op.scope.type==='trip'));
    assert(modes===1||timedAddition,'INVALID_OPERATIONS','每次请使用文字、手动操作或推荐勾选中的一种');
    return job(owner,async(signal,phase)=>{
      let operations=input.operations,source='manual';
      if(input.text?.trim()) {assert(llm.configured,'LLM_NOT_CONFIGURED','智能修改尚未配置模型，可以先使用手动调整',503);phase('analyzing');const line=await catalogue(it.context.lineId);const p=await model('revise',{currentText:input.text,itinerary:it,pois:line.pois.map(p=>({poiId:p.poiId,name:p.name}))},signal);operations=p.operationProposals;source='model';if(!operations.length)return {kind:'clarification',questions:p.questions?.slice(0,3)||['请明确想调整的景点、日期或时间'],message:'这次修改还不够明确，原行程未变。'}}
      if(input.selectedCandidateIds?.length){assert(Array.isArray(input.selectedCandidateIds)&&input.selectedCandidateIds.length<=8,'INVALID_OPERATIONS','一次最多勾选8个推荐');operations=[...(input.operations||[]),...input.selectedCandidateIds.map(cid=>{const c=store.get(owner,cid,'candidate');assert(c.itineraryId===id&&c.baseVersion===it.version&&c.baseIntakeRevision===it.intakeRevision&&Date.parse(c.expiresAt)>now(),'STALE_PREVIEW','推荐已过期，请重新获取',409);return {type:'add_poi',poiId:c.poiId,date:c.suggestedDate,afterItemId:c.afterItemId}})]}
      phase('scheduling');const result=await build(it,operations,{source,text:input.text||'',signal});signal.throwIfAborted();base(owner,id,input);
      const preview={id:randomUUID(),itineraryId:id,baseVersion:it.version,baseIntakeRevision:it.intakeRevision,expiresAt:new Date(now()+TTL).toISOString(),operations,...result,factSnapshotId:result.validation.factSnapshotId,signature:signature(result.proposedItinerary),requiresChoices:result.validation.violations};
      store.put(owner,preview.id,'preview',preview);return {kind:'preview',preview}
    })
  }
  async function additions(owner,id,baseVersion,{refresh=false}={}) {
    const {it}=base(owner,id,{baseVersion});
    const cacheId=`additions:${id}:${it.version}:${it.intakeRevision}`;
    if(!refresh)try{const c=store.get(owner,cacheId,'additions');if(Date.parse(c.expiresAt)>now()+5000&&c.candidates.every(p=>Date.parse(p.expiresAt)>now()+5000))return c}catch(e){if(e.code!=='NOT_FOUND')throw e}
    const signal=AbortSignal.timeout(Math.min(totalTimeoutMs,20000)),line=await catalogue(it.context.lineId),profile=await profileProvider(owner);
    const selected=new Set(it.context.selectedPoiIds),excluded=new Set(reqsIds(it.requirements,'exclude')),rows=visits(it),favorites=new Set(profile.favoritePoiIds||[]);
    const pool=line.pois.filter(p=>!selected.has(p.poiId)&&!excluded.has(p.poiId)&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.durationNormal>0);
    const distance=p=>Math.min(...rows.map(r=>{const point=line.pois.find(p=>p.poiId===r.poiId);return point?haversineKm(p,point):Infinity}));
    pool.sort((a,b)=>preferenceFit(b,it.requirements).score-preferenceFit(a,it.requirements).score||Number(favorites.has(b.poiId))-Number(favorites.has(a.poiId))||distance(a)-distance(b));
    const candidates=[];
    for(const p of pool.slice(0,8)) {
      signal.throwIfAborted();let best=null;
      for(const day of it.days) {
        const locked=it.requirements.some(r=>active(r)&&r.key==='scheduleLock'&&r.value.lockedDates.includes(day.date));if(locked)continue;
        const dayRows=rows.filter(r=>r.date===day.date);
        const nearby=[...dayRows].sort((a,b)=>haversineKm(p,line.pois.find(p=>p.poiId===a.poiId))-haversineKm(p,line.pois.find(p=>p.poiId===b.poiId))).slice(0,1);
        const anchors=[null,...nearby.map(r=>r.id),dayRows.at(-1)?.id].filter((v,i,a)=>a.indexOf(v)===i);
        for(const anchor of anchors) {
          const attempt=await build(it,[{type:'add_poi',poiId:p.poiId,date:day.date,afterItemId:anchor}],{signal});
          if(attempt.validation.status==='failed'||attempt.proposedItinerary.unscheduledPoiIds.length)continue;
          if(!best||attempt.diff.incrementalMinutes<best.diff.incrementalMinutes)best={...attempt,date:day.date,anchor};
        }
      }
      if(best){const reasons=[...(favorites.has(p.poiId)?['profile_interest']:[]),...(p.type==='ip'?['ip_related']:[]),'low_detour'];const candidate={candidateId:randomUUID(),itineraryId:id,poiId:p.poiId,name:p.name,baseVersion:it.version,baseIntakeRevision:it.intakeRevision,preferenceScore:preferenceFit(p,it.requirements).score,preferenceReasons:preferenceFit(p,it.requirements).reasons,reasonCodes:reasons,reason:`${favorites.has(p.poiId)?'与你收藏的兴趣相符；':p.type==='ip'?'同一作品的书中地点；':''}已按当前路线试排，可放在${best.date}${best.anchor?'的'+(line.pois.find(p=>p.poiId===rows.find(r=>r.id===best.anchor)?.poiId)?.name||'已选地点')+'之后':'的开头'}`,suggestedDate:best.date,afterItemId:best.anchor,beforeItemId:null,incrementalMinutes:best.diff.incrementalMinutes,incrementalWalkMinutes:best.diff.incrementalWalkMinutes,validationStatus:best.validation.status,bookingState:'unknown',factSnapshotId:best.validation.factSnapshotId,expiresAt:new Date(now()+TTL).toISOString()};candidates.push(candidate)}
    }
    signal.throwIfAborted();base(owner,id,{baseVersion});
    candidates.sort((a,b)=>(b.preferenceScore||0)-(a.preferenceScore||0)||(it.requirements.some(r=>active(r)&&r.key==='mobility'&&r.value.walkingLevel==='low')?a.incrementalWalkMinutes-b.incrementalWalkMinutes:0)||Number(b.reasonCodes.includes('profile_interest'))-Number(a.reasonCodes.includes('profile_interest'))||a.incrementalMinutes-b.incrementalMinutes||Number(b.reasonCodes.includes('ip_related'))-Number(a.reasonCodes.includes('ip_related')));
    const result={baseVersion:it.version,baseIntakeRevision:it.intakeRevision,candidates:candidates.slice(0,3).map((c,i)=>({...c,rank:i+1})),expiresAt:new Date(Math.min(now()+TTL,...candidates.slice(0,3).map(c=>Date.parse(c.expiresAt)))).toISOString()};
    for(const c of result.candidates)store.put(owner,c.candidateId,'candidate',c);store.put(owner,cacheId,'additions',result);return result
  }
  async function commit(owner,id,input) {
    const {it,s}=base(owner,id,input),p=store.get(owner,input.previewId,'preview');
    assert(p.itineraryId===id&&p.baseVersion===it.version&&p.baseIntakeRevision===s.intakeRevision&&Date.parse(p.expiresAt)>now(),'STALE_PREVIEW','预览已失效，请重新试排',409);
    assert(p.validation.status!=='failed','PLAN_CONFLICT','存在冲突，不能应用这份预览');
    const signal=AbortSignal.timeout(totalTimeoutMs),line=await catalogue(it.context.lineId),pf=await tools.poiFacts(line.pois,it.days.map(d=>d.date),{signal});
    const refreshed=await refreshFacts(p.proposedItinerary,pf.points,signal),candidate=refreshed.snapshot;candidate.facts=[...pf.facts,...refreshed.facts];
    const validation=validateItinerary(candidate,{preserve:p.preserve,baselineSnapshot:it});
    assert(validation.status!=='failed'&&validation.status===p.validation.status&&signature(candidate)===p.signature&&Date.parse(p.expiresAt)>now(),'STALE_PREVIEW','事实或安排发生变化，请重新预览',409);signal.throwIfAborted();
    const next={...candidate,validation,version:it.version+1,intakeRevision:s.intakeRevision+1};
    const nextSession={...s,engineMode:next.engineMode,context:next.context,requirements:next.requirements,intakeRevision:next.intakeRevision,unresolved:next.unresolved,nextQuestions:[]};
    return store.commit(owner,{itinerary:next,session:nextSession,baseVersion:it.version,baseIntakeRevision:s.intakeRevision})
  }
  async function undo(owner,id,input) {
    const {it}=base(owner,id,input);assert(Number.isInteger(input.targetVersion)&&input.targetVersion>=1&&input.targetVersion<it.version,'INVALID_VERSION','请选择更早的历史版本');
    const target=store.version(owner,id,input.targetVersion),signal=AbortSignal.timeout(totalTimeoutMs),line=await catalogue(it.context.lineId),pf=await tools.poiFacts(line.pois,it.days.map(d=>d.date),{signal});
    assert(JSON.stringify(target.context.dateRange)===JSON.stringify(it.context.dateRange),'INVALID_VERSION','日期范围不同，无法直接撤销');
    const fresh=await refreshFacts(target,pf.points,signal),draft=fresh.snapshot;draft.facts=[...pf.facts,...fresh.facts];
    const validation=validateItinerary(draft,{baselineSnapshot:target});assert(validation.status!=='failed','PLAN_CONFLICT','历史安排已不满足当前事实，不能直接恢复');signal.throwIfAborted();
    const s=store.get(owner,it.planningSessionId,'session');assert(s.intakeRevision===it.intakeRevision,'STALE_INTAKE','需求已变化，无法撤销',409);
    const next={...draft,id:it.id,version:it.version+1,intakeRevision:s.intakeRevision+1,validation,undoOf:input.targetVersion,updatedAt:new Date(now()).toISOString()};
    return store.commit(owner,{itinerary:next,session:{...s,engineMode:next.engineMode,context:next.context,requirements:next.requirements,intakeRevision:next.intakeRevision,unresolved:next.unresolved,nextQuestions:[]},baseVersion:it.version,baseIntakeRevision:s.intakeRevision})
  }
  return {revise,additions,commit,undo,async settle(){await Promise.allSettled([...pending])}}
}
