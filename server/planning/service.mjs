import {normalizeSchedules,parseTouristSchedules,scheduleIssues,scheduleValue,isTourist,withTouristVenues} from '../../src/planning/tourist-schedules.mjs'
import {createPlanningQueue} from './job-queue.mjs'
import {digest} from './store.mjs'
import {removalProposal,additionProposal} from '../../src/planning/negotiation.mjs'
import {scheduleHybrid} from './hybrid-planner.mjs'
import {rankRemovalCandidates} from '../../src/planning/preference-ranking.mjs'
import {bestOrder,makeTravelFn} from '../../src/planner.mjs'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { assert, PlanningError, datesBetween, validateContext, active } from '../../src/planning/core.mjs'
import { mergeProposals,validateValue } from '../../src/planning/requirements.mjs'
import { scheduleItinerary,validateItinerary,reqsIds } from '../../src/planning/scheduler.mjs'
import { loadLine,createFactTools } from './facts.mjs'
import { QUESTION_BANK,makeQuestion,bootstrapQuestions,proposalsFromAnswers } from './questions.mjs'
import { createRevisionService } from './revisions.mjs'
import { createTripQueries } from './trip-adapter.mjs'
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const promptCache=Promise.all([read('../../skills/travel-itinerary-planner/SKILL.md'),read('../../skills/travel-itinerary-planner/references/questions.md'),read('../../docs/planning/接口与数据契约.md')]);
const safeError=e=>({code:e.code||'PLANNING_FAILED',message:e.code?e.message:'规划失败，请重试',retryable:e.retryable??false});
function questionSatisfied(template,requirements) {
  const values=key=>requirements.filter(r=>active(r)&&r.key===key).at(-1)?.value;
  if(template==='child_activity')return Boolean(values('party')?.ageBands&&values('party')?.nap);
  if(template==='wake_departure')return Boolean(values('wake')&&values('departure'));
  if(template==='rest_detail')return Boolean(values('rest')?.intervalMinutes&&values('rest')?.durationMinutes);
  const key=QUESTION_BANK[template]?.key;return key?Boolean(values(key)):false;
}
export function createPlanningService({store,llm,tools=createFactTools(),catalogue=loadLine,totalTimeoutMs=60000,maxTools=12,profileProvider,trip=createTripQueries(),queueOptions={}}={}) {
  const running=new Set(),queue=createPlanningQueue(queueOptions);
  async function model(mode,payload,signal) {
    const [skill,questions,contract]=await promptCache;
    const shape=mode==='intake'?{mode:'intake',requirementProposals:[],questionProposals:[{templateId:'pace'}],keywordProposals:[]}:mode==='revise'?{mode:'revise',operationProposals:[{type:'remove_poi',poiId:'真实ID',evidence:{quote:'本次用户的逐字原文'}}],questions:[]}:{mode:'generate',candidateOrder:payload.selectedPoiIds};
    const instructions=mode==='intake'?`只解析本次 currentText，不从已删除或过去消息重复提取需求。每个需求为 {key,value,strength,scope:{type:"trip",targetId:null},evidence:{quote:"本次原文的逐字片段"}}。value约定：wake/departure/dayEnd为HH:mm；pace为balanced/more_places/fewer_deeper；mobility为{lessWalking:boolean,slowerWalking:boolean,frequentBreaks:boolean,maxLegWalkMinutes?:整数}；rest为{intervalMinutes:整数,durationMinutes:整数}；transport为{mode:transit/taxi/walk/bike/mixed}；poiDepth为{poiId,depth:normal/quick/deep}；mustVisit/exclude为poiId数组；fixedEvent为{type:flight/activity/meeting,date:YYYY-MM-DD或null,startTime:HH:mm或null,endTime:HH:mm或null,poiId:真实ID或null,location:文字或null,period:afternoon/morning或null}。不得发明数值。只使用注册 questionTemplates。若有航班缺失优先flight_details。局部时间用day scope。keywordProposals只返回{label,insertText}。`:`candidateOrder必须是selectedPoiIds的完整排列，不增不删，不修改已确认需求。结合营业时间和每日期限提出顺序。修复仅调整顺序，不能压缩深度或删点。`;
    let previous=[];
    for(let attempt=0;attempt<2;attempt++) {
      let result,problem='输出结构无效';
      try {
        const revisionInstructions=`理解本次修改，输出 operationProposals，不输出最终行程。允许 add_poi/remove_poi/move_poi/set_depth/set_requirement/lock_day/unlock_day。add/move 字段 poiId,date(完整日期),afterItemId(真实行程条目ID或null，null表示当天开头)。set_depth 字段poiId,depth。set_requirement 字段key,value,strength,scope，可用requirementId明确替换固定活动。lock_day/unlock_day字段date。每个操作必须 evidence:{quote:本次原话逐字片段}。第一天不改须lock_day，不擅自锁全程。用户未明确解除必去时不得自行解除。改截止时间用dayEnd的HH:mm和对应day scope。模糊名称或指代不唯一时返回空operations及最多3个questions。`;
        result=await llm.complete({purpose:'itinerary_planning',messages:[{role:'system',content:`${skill}\n${mode==='intake'?questions:contract}\n本部署采用固定编排器，工具由后端主动执行，你只提出候选。仅输出 JSON，禁止输出 Markdown。每个需求的strength必须是hard或soft；scope必须为{type:trip/day/poi/event,targetId:null或完整日期或真实ID}，不能用其他命名或省略。${mode==='revise'?revisionInstructions:instructions}\nJSON example: ${JSON.stringify(shape)}`},{role:'user',content:JSON.stringify(payload)},...previous],signal});
        assert(result&&result.mode===mode,'MODEL_PROTOCOL','模式不正确',502);
        if(mode==='intake') {
          assert(Array.isArray(result.requirementProposals)&&result.requirementProposals.length<=40&&Array.isArray(result.questionProposals)&&result.questionProposals.length<=20&&result.questionProposals.every(q=>q&&typeof q.templateId==='string')&&Array.isArray(result.keywordProposals)&&result.keywordProposals.length<=20,'MODEL_PROTOCOL','需求或问题列表结构不正确',502);
          for(const r of result.requirementProposals){assert(r&&typeof r==='object','MODEL_PROTOCOL','需求必须为对象',502);assert(['hard','soft'].includes(r.strength)&&['trip','day','poi','event'].includes(r.scope?.type),'MODEL_PROTOCOL','需求strength须为hard或soft，scope须为含type和targetId的对象',502);validateValue(r.key,r.value);assert(typeof r.evidence?.quote==='string'&&r.evidence.quote.length>0&&payload.currentText.includes(r.evidence.quote),'MODEL_PROTOCOL','需求必须引用本次输入的逐字原文',502)}
          for(const k of result.keywordProposals)assert(k&&typeof k.label==='string'&&k.label.length<=30&&typeof k.insertText==='string'&&k.insertText.length<=200,'MODEL_PROTOCOL','关键词格式不正确',502);
        } else if(mode==='revise')assert(Array.isArray(result.operationProposals)&&result.operationProposals.length<=40&&(!result.questions||Array.isArray(result.questions)&&result.questions.every(q=>typeof q==='string'&&q.length<300)),'MODEL_PROTOCOL','修改操作格式不正确',502);
        else assert(Array.isArray(result.candidateOrder)&&result.candidateOrder.length===payload.selectedPoiIds.length&&new Set(result.candidateOrder).size===result.candidateOrder.length&&result.candidateOrder.every(id=>payload.selectedPoiIds.includes(id)),'MODEL_PROTOCOL','candidateOrder须完整保留所有已选点位且不重复',502);
        return result;
      } catch(e) {
        if(e.code&& !['MODEL_PROTOCOL','MODEL_TRUNCATED','INVALID_REQUIREMENT','INVALID_TIME'].includes(e.code))throw e;
        problem=e.code?e.message:'模型响应结构不正确';
      }
      previous=[...(result?[{role:'assistant',content:JSON.stringify(result)}]:[]),{role:'user',content:`${problem}。请严格按提供的 JSON example 和字段约定修正。`}];
    }
    throw new PlanningError('MODEL_PROTOCOL','模型返回结构不符合规划协议',502);
  }
  function readiness(s) {return !s.context.dateRange||!s.context.selectedPoiIds.length&&!s.touristSchedules?.length?'needs_core_context':s.unresolved.length?'provisional':'ready'}
  function view(s) {return {...s,generationReadiness:readiness(s)}}
  async function intake(owner,input,id) {
    const current=id?store.get(owner,id,'session'):null;
    const engineMode=current?.engineMode||input.engineMode||'ai';assert(['ai','rules'].includes(engineMode),'INVALID_MODE','不支持的规划模式');
    assert(engineMode==='rules'||llm.configured,'LLM_NOT_CONFIGURED','尚未配置 DEEPSEEK_API_KEY；请在 server/.env.local 填入',503);
    if(current)assert(input.baseIntakeRevision===current.intakeRevision,'STALE_INTAKE','需求版本已变化，请刷新',409);
    assert(['continue','skip','generate'].includes(input.action||'continue'),'INVALID_ACTION','不支持的采集动作');
    let c=current?.context||input.context;
    let line=await catalogue(c?.lineId);validateContext(c,line.pois);
    assert(!line.timeZone||c.timeZone===line.timeZone,'INVALID_TIMEZONE','时区须与所选目的地一致');
    c=Object.fromEntries(['lineId','selectedPoiIds','dateRange','timeZone','recommendationId','origin','destination','planningBoundary'].filter(k=>c[k]!==undefined).map(k=>[k,c[k]]));
    const dates=c.dateRange?datesBetween(c.dateRange.startDate,c.dateRange.endDate):[];
    const text=input.text??'';assert(typeof text==='string'&&text.length<=6000,'INVALID_TEXT','输入不能超过6000字');
    const skipped=input.skippedQuestionIds||[];
    assert(Array.isArray(skipped)&&skipped.every(id=>current?.nextQuestions.some(q=>q.id===id)),'UNKNOWN_QUESTION','跳过的问题不存在');
    const state=current?structuredClone(current):{engineMode,planningSessionId:randomUUID(),intakeRevision:0,context:c,requirements:[],unresolved:[],nextQuestions:[],suggestedKeywords:[],askedTemplates:[],skippedTemplates:[],rounds:0,generationRequested:false};
    assert(input.customRequests==null||Array.isArray(input.customRequests)&&input.customRequests.length<=20&&input.customRequests.every(x=>typeof x==='string'&&x.length<=1500),'INVALID_TEXT','自定义要求格式不正确');state.customRequests=input.customRequests||current?.customRequests||[];
    const hasSchedules=Object.hasOwn(input,'touristSchedules');
    const supplied=hasSchedules?normalizeSchedules(input.touristSchedules,line.pois):current?.touristSchedules||[];
    const extracted=parseTouristSchedules(text,{context:c,pois:line.pois});
    const schedules=[...supplied];for(const event of extracted)if(!schedules.some(x=>x.rawText===event.rawText||x.title===event.title&&x.date===event.date))schedules.push(event);
    state.touristSchedules=normalizeSchedules(schedules,line.pois);
    if(hasSchedules||extracted.length){
      for(const r of state.requirements.filter(isTourist))r.state='superseded';
      for(const event of state.touristSchedules){const value=scheduleValue(event);state.requirements.push({id:randomUUID(),key:'fixedEvent',value,strength:'hard',scope:{type:'trip',targetId:null},source:'user_option',evidence:{quote:JSON.stringify(event),messageId:null,answerId:'touristSchedules'},state:'confirmed'});}
    }
    line=withTouristVenues(line,state.requirements);
    const answers=proposalsFromAnswers(current?.nextQuestions||bootstrapQuestions(),input.answers||[],state.requirements);
    const mustAnswer=(input.answers||[]).find(a=>a.questionId==='q:conversation_must:0');
    if(mustAnswer){const ids=mustAnswer.values?.poiIds||[];let carried=false,negotiating=false;if(input.previousPlanningSessionId){const prior=store.get(owner,input.previousPlanningSessionId,'session');const protectedIds=reqsIds(prior.requirements,'mustVisit');negotiating=input.selectionNegotiation===true&&prior.context.lineId===c.lineId;carried=prior.context.lineId===c.lineId&&ids.every(id=>protectedIds.includes(id))}assert((carried||negotiating||ids.length<=Math.max(1,Math.floor(c.selectedPoiIds.length*.2)))&&ids.every(id=>c.selectedPoiIds.includes(id)),'INVALID_ANSWERS','必去景点须来自已选景点，且不超过20%（至少1个）；已有必去保留')}

    const messageId=randomUUID();
    if(answers.length) {
      const answerText=(input.answers||[]).map(a=>JSON.stringify(a)).join('\n');
      state.requirements=mergeProposals(state.requirements,answers,{text:answerText,messageId,poiIds:line.pois.map(p=>p.poiId),dates});
      for(const r of state.requirements.filter(r=>r.evidence?.messageId===messageId)) {r.source='user_option';r.evidence.answerId=answers.find(a=>a.evidence.quote===r.evidence.quote)?.answerId||null}
    }
    let proposal={requirementProposals:[],questionProposals:[],keywordProposals:[]};
    if(engineMode==='ai'&&(text.trim()||!current)) proposal=await model('intake',{currentText:text,context:c,requirements:state.requirements,pois:line.pois.map(p=>({poiId:p.poiId,name:p.name})),questionTemplates:Object.keys(QUESTION_BANK)},AbortSignal.timeout(totalTimeoutMs));
    state.requirements=mergeProposals(state.requirements,proposal.requirementProposals,{text,messageId,poiIds:line.pois.map(p=>p.poiId),dates});
    for(const qid of skipped)state.skippedTemplates.push(current.nextQuestions.find(q=>q.id===qid).templateId);
    state.generationRequested ||= input.action==='generate';state.intakeRevision++;
    const pending=state.requirements.filter(r=>active(r)&&r.key==='fixedEvent'&&(!r.value.date||r.value.type==='flight'||!r.value.startTime||!r.value.endTime||!r.value.poiId));
    state.unresolved=pending.map(r=>({code:'FIXED_EVENT_UNCONFIRMED',requirementId:r.id,message:'固定安排尚未具备可验证的时间与接驳数据'}));
    const unparsed=text.split(/[；;\n]/).filter(part=>!state.touristSchedules.some(event=>event.rawText===part.trim())).join('；').trim();
    if(engineMode==='rules'&&(unparsed||state.unparsedText)){state.unparsedText=unparsed||state.unparsedText;state.unresolved.push({code:'TEXT_NOT_PARSED',message:'本次规则排程没有解析自由文字，文字中的要求尚未应用'})}
    const candidates=[...proposal.questionProposals.map(p=>p.templateId)];
    if(pending.some(r=>r.value.type==='flight'&&(!r.value.startTime||!r.value.location)))candidates.unshift('flight_details');
    state.nextQuestions=[];
    if(!state.generationRequested&&state.rounds<2) {
      for(const t of [...new Set(candidates)]) {
        if(state.askedTemplates.includes(t)||state.skippedTemplates.includes(t)||questionSatisfied(t,state.requirements))continue;
        const q=makeQuestion(t,state.intakeRevision);if(q)state.nextQuestions.push(q);if(state.nextQuestions.length===3)break;
      }
      if(state.nextQuestions.length){state.rounds++;state.askedTemplates.push(...state.nextQuestions.map(q=>q.templateId))}
    }
    assert(proposal.keywordProposals.length<=20,'MODEL_PROTOCOL','关键词过多',502);
    state.suggestedKeywords=proposal.keywordProposals.slice(0,6).map(p=>{assert(typeof p.label==='string'&&p.label.length<=30&&typeof p.insertText==='string'&&p.insertText.length<=200,'MODEL_PROTOCOL','关键词格式无效',502);return {id:randomUUID(),label:p.label,insertText:p.insertText,source:'planning_suggestion',relatedRequirementIds:[]}});
    store.put(owner,state.planningSessionId,'session',state,current?{expectedRevision:current.intakeRevision}:{});
    return view(state)
  }
  function generate(owner,input) {
    const session=store.get(owner,input.planningSessionId,'session');
    const touristMissing=(session.touristSchedules||[]).map(event=>({scheduleId:event.id,missing:scheduleIssues(event,{dateRange:session.context.dateRange,hours:{start:session.requirements.filter(r=>active(r)&&r.key==='departure').at(-1)?.value||'10:00',end:session.requirements.filter(r=>active(r)&&r.key==='dayEnd').at(-1)?.value||'17:00'}})})).filter(x=>x.missing.length);
    assert(!touristMissing.length,'TOURIST_SCHEDULE_INCOMPLETE','请先补全游客日程的日期、地点、起止时间，并确认当天时间范围');
    const events=session.touristSchedules||[];for(let i=0;i<events.length;i++)for(let j=i+1;j<events.length;j++){const a=events[i],b=events[j],minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3));assert(a.date!==b.date||minute(a.endTime)<=minute(b.startTime)-b.arrivalMinutes||minute(b.endTime)<=minute(a.startTime)-a.arrivalMinutes,'TOURIST_SCHEDULE_CONFLICT','游客日程的活动或提前到场时间重叠，请先调整日程');}
    assert(session.engineMode==='rules'||llm.configured,'LLM_NOT_CONFIGURED','尚未配置 DEEPSEEK_API_KEY；请在 server/.env.local 填入',503);
    assert(session.intakeRevision===input.intakeRevision,'STALE_INTAKE','需求已更新，请重新生成',409);
    assert(session.context.dateRange&&(session.context.selectedPoiIds.length||session.touristSchedules?.length),'NEEDS_CORE_CONTEXT','请先提供日期并选择景点或添加游客日程');
    if(input.negotiation){const n=input.negotiation;assert(input.dryRun===true&&session.engineMode==='rules'&&['add','remove'].includes(n.kind)&&Array.isArray(n.candidateIds)&&n.candidateIds.length<=30&&new Set(n.candidateIds).size===n.candidateIds.length&&n.candidateIds.every(id=>typeof id==='string')&&Array.isArray(n.rejectedIds||[])&&(n.rejectedIds||[]).length<=30,'INVALID_NEGOTIATION','协商参数不正确');}
    const lane=input.planningLane||session.planningSessionId;assert(typeof lane==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(lane),'INVALID_LANE','规划面板标识不正确');
    const fingerprint=digest(JSON.stringify({context:session.context,requirements:session.requirements.filter(active).map(r=>({key:r.key,value:r.value,strength:r.strength,scope:r.scope})),engineMode:session.engineMode,dryRun:input.dryRun===true,allowPartial:input.allowPartial===true,negotiation:input.negotiation||null}));
    session.generationRequested=true;session.nextQuestions=[];store.put(owner,session.planningSessionId,'session',session,{expectedRevision:session.intakeRevision});
    return queue.submit({owner,lane,fingerprint,cacheable:input.dryRun===true,
      createJob:()=>({id:randomUUID(),state:'queued',phase:'queued',cancellable:true,result:null,error:null,createdAt:new Date().toISOString()}),
      persist:job=>store.put(owner,job.id,'job',job),
      run:(signal,job)=>runJob(owner,job,session,{allowPartial:input.allowPartial===true,dryRun:input.dryRun===true,negotiation:input.negotiation,signal})
    });
  }
  async function runJob(owner,job,s,{allowPartial=false,dryRun=false,negotiation=null,signal}={}) {
    const ctrl=new AbortController();const cancel=()=>ctrl.abort(signal.reason);if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});const timer=setTimeout(()=>ctrl.abort(new PlanningError('PLANNING_TIMEOUT','规划超时，请重试',504,true)),totalTimeoutMs);
    let count=0;
    const step=async(phase,fn)=>{ctrl.signal.throwIfAborted();assert(++count<=maxTools,'TOOL_BUDGET','工具调用次数到限');job.phase=phase;job.state='running';store.put(owner,job.id,'job',job);const value=await fn();ctrl.signal.throwIfAborted();return value};
    try {
      ctrl.signal.throwIfAborted();
      const work=async()=>{
        const line=withTouristVenues(await step('fetching',()=>catalogue(s.context.lineId)),s.requirements);
        const requirements=structuredClone(s.requirements);
        for(const date of datesBetween(s.context.dateRange.startDate,s.context.dateRange.endDate)){
          const events=requirements.filter(r=>isTourist(r)&&r.value.date===date&&r.value.extendDay);if(!events.length)continue;
          const start=requirements.filter(r=>active(r)&&r.key==='departure'&&(r.scope.type==='trip'||r.scope.type==='day'&&r.scope.targetId===date)).at(-1)?.value||'10:00',end=requirements.filter(r=>active(r)&&r.key==='dayEnd'&&(r.scope.type==='trip'||r.scope.type==='day'&&r.scope.targetId===date)).at(-1)?.value||'17:00';
          const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3)),format=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
          for(const [key,value]of [['departure',format(Math.min(minute(start),...events.map(r=>minute(r.value.startTime)-(r.value.arrivalMinutes||0))))],['dayEnd',events.reduce((latest,r)=>r.value.endTime>latest?r.value.endTime:latest,end)]]){for(const old of requirements.filter(r=>active(r)&&r.key===key&&r.scope.type==='day'&&r.scope.targetId===date))old.state='superseded';requirements.push({id:randomUUID(),key,value,strength:'hard',scope:{type:'day',targetId:date},source:'tourist_schedule',evidence:{quote:'用户允许按游客日程调整当天时间'},state:'confirmed'});}
        }
        const ids=[...new Set([...s.context.selectedPoiIds,...reqsIds(requirements,'mustVisit')])];
        const dates=datesBetween(s.context.dateRange.startDate,s.context.dateRange.endDate);
        const eventPoiIds=requirements.filter(r=>active(r)&&r.key==='fixedEvent'&&r.value.poiId).map(r=>r.value.poiId);
        const candidateIds=negotiation?.candidateIds||[];assert(candidateIds.every(id=>line.pois.some(p=>p.poiId===id)),'UNKNOWN_POI','协商候选点位不存在');
        const factPoiIds=new Set([...ids,...eventPoiIds,...(negotiation?.kind==='add'?candidateIds:[])]);
        const pf=await step('fetching',()=>tools.poiFacts(line.pois.filter(p=>factPoiIds.has(p.poiId)),dates,{signal:ctrl.signal}));
        if(negotiation){
          const protectedIds=[...new Set([...reqsIds(requirements,'mustVisit'),...requirements.filter(r=>isTourist(r)&&r.value.fulfillsVisit!==false).map(r=>r.value.poiId)])],excluded=reqsIds(requirements,'exclude');
          const ranked=candidateIds.filter(id=>!excluded.includes(id)).map(poiId=>({poiId}));
          const trial=async selected=>{
            await new Promise(resolve=>setImmediate(resolve));ctrl.signal.throwIfAborted();
            const result=await scheduleHybrid({context:{...s.context,selectedPoiIds:selected},requirements:requirements,points:pf.points,facts:pf.facts,tools,candidateOrder:bestOrder(line.pois.filter(p=>selected.includes(p.poiId)),makeTravelFn()).order.map(p=>p.poiId),signal:ctrl.signal},{maxTrials:24,maxSearchMs:800});
            return {feasible:result.validation.status!=='failed',days:result.draft.days,unscheduledPoiIds:result.draft.unscheduledPoiIds,planningDiagnostics:result.draft.planningDiagnostics};
          };
          job.phase='scheduling';job.state='running';store.put(owner,job.id,'job',job);
          const proposal=negotiation.kind==='remove'?await removalProposal({ids,ranked,protectedIds,trial,signal:ctrl.signal,allowEmpty:requirements.some(isTourist)}):await additionProposal({ids,ranked,rejectedIds:negotiation.rejectedIds||[],trial,signal:ctrl.signal});
          assert(store.get(owner,s.planningSessionId,'session').intakeRevision===s.intakeRevision,'STALE_INTAKE','核算期间需求已变化，请重试',409);
          return {kind:'negotiation_plan',proposal};
        }
        let proposal=s.engineMode==='rules'?{candidateOrder:bestOrder(line.pois.filter(p=>ids.includes(p.poiId)),makeTravelFn()).order.map(p=>p.poiId)}:await step('analyzing',()=>model('generate',{context:s.context,requirements:requirements,selectedPoiIds:ids,points:pf.points},ctrl.signal));
        let draft,validation;
        for(let attempt=0;attempt<=2;attempt++) {
          draft=(await step('scheduling',()=>scheduleHybrid({context:{...s.context,selectedPoiIds:ids},requirements:requirements,points:pf.points,facts:pf.facts,tools,candidateOrder:proposal.candidateOrder,signal:ctrl.signal}))).draft;
          draft.unresolved.push(...s.unresolved);
          validation=await step('validating',()=>validateItinerary(draft));
          if(validation.status!=='failed'||attempt===2||s.engineMode==='rules')break;
          proposal=await step('repairing',()=>model('generate',{context:s.context,requirements:requirements,selectedPoiIds:ids,points:pf.points,violations:validation.violations,previousOrder:proposal.candidateOrder},ctrl.signal));
        }
        const current=store.get(owner,s.planningSessionId,'session');assert(current.intakeRevision===s.intakeRevision,'STALE_INTAKE','生成期间需求已变化，请重新生成',409);
        ctrl.signal.throwIfAborted();
        if(dryRun)return {kind:'feasibility',days:draft.days,feasible:validation.status!=='failed',conflicts:validation.violations,unscheduledPoiIds:draft.unscheduledPoiIds,planningDiagnostics:draft.planningDiagnostics};
        if(validation.status==='failed'&&allowPartial){
          const pending=[...new Set(draft.unscheduledPoiIds)];
          const safe=validation.violations.every(v=>v.code==='UNSCHEDULED_POI')&&!reqsIds(requirements,'mustVisit').some(id=>pending.includes(id));
          if(safe&&draft.days.some(d=>d.items.some(i=>i.type==='visit'))){draft.completeness='partial';draft.pendingPoiIds=pending;draft.pendingConstraints=validation.violations;validation={...validation,status:'provisional',violations:[],unresolved:[...validation.unresolved,{code:'PARTIAL_ITINERARY',message:'部分景点尚未安排；全部选点仍保留，未表示同意舍弃。'}]}}
        }
        if(validation.status==='failed'){
          const protectedPoiIds=[...new Set([...reqsIds(requirements,'mustVisit'),...requirements.filter(r=>isTourist(r)&&r.value.fulfillsVisit!==false).map(r=>r.value.poiId)])];
          const blocking=draft.planningDiagnostics?.blockingPoints||[];
          const ranked=rankRemovalCandidates(line.pois,requirements,ids,protectedPoiIds);
          const candidates=[];
          for(const p of ranked){await new Promise(resolve=>setImmediate(resolve));ctrl.signal.throwIfAborted();const kept=ids.filter(id=>id!==p.poiId);let fitsAfterRemoval=false,remainingUnscheduled=null,walkMinutesAfterRemoval=null;
            if(kept.length){const trial=(await scheduleHybrid({context:{...s.context,selectedPoiIds:kept},requirements:requirements,points:pf.points,facts:pf.facts,tools,candidateOrder:proposal.candidateOrder.filter(id=>id!==p.poiId),signal:ctrl.signal},{maxTrials:12,maxSearchMs:300})).draft;fitsAfterRemoval=validateItinerary(trial).status!=='failed';remainingUnscheduled=trial.unscheduledPoiIds.length;walkMinutesAfterRemoval=trial.days.reduce((n,d)=>n+(d.totals.walkMinutes||0),0)}
            candidates.push({poiId:p.poiId,name:p.name,rank:candidates.length+1,preferenceScore:p.fit.score,reasons:[...p.fit.reasons,...(requirements.some(r=>active(r)&&r.key==='mobility'&&r.value.walkingLevel==='low')&&walkMinutesAfterRemoval!=null?[`舍弃后景点间交通步行预计${walkMinutesAfterRemoval}分钟，景点内部另计`]:[])],walkMinutesAfterRemoval,durationMinutes:p.durationNormal||null,fitsAfterRemoval,remainingUnscheduled});
          }
          candidates.sort((a,b)=>a.preferenceScore-b.preferenceScore||Number(b.fitsAfterRemoval)-Number(a.fitsAfterRemoval)||(requirements.some(r=>active(r)&&r.key==='mobility'&&r.value.walkingLevel==='low')?(a.walkMinutesAfterRemoval??Infinity)-(b.walkMinutesAfterRemoval??Infinity):0)||(b.durationMinutes||0)-(a.durationMinutes||0));candidates.forEach((c,i)=>c.rank=i+1);
          return {kind:'negotiation',planningDiagnostics:draft.planningDiagnostics,selectionAdvice:{kind:'remove',protectedPoiIds,candidates,blockingPoints:blocking,message:draft.planningDiagnostics?.message},conflicts:validation.violations,unresolved:validation.unresolved,choices:[{id:'change_selection',label:'调整景点或增加天数'},{id:'change_constraints',label:'明确修改时间或游览深度'}],partialDraft:{...draft,validation}};
        }
        const itinerary={...draft,touristSchedules:s.touristSchedules||[],eventVenues:line.pois.filter(p=>p.isEventVenue),customRequests:s.customRequests||[],engineMode:s.engineMode||'ai',id:randomUUID(),version:1,planningSessionId:s.planningSessionId,intakeRevision:s.intakeRevision,validation,conflicts:[],createdAt:new Date().toISOString()};
        store.put(owner,s.planningSessionId,'session',{...current,context:itinerary.context},{expectedRevision:current.intakeRevision});
        store.put(owner,itinerary.id,'itinerary',itinerary);return {kind:'itinerary',itinerary};
      };
      const aborted=new Promise((_,reject)=>ctrl.signal.addEventListener('abort',()=>reject(ctrl.signal.reason||new PlanningError('PLANNING_TIMEOUT','规划超时，请重试',504,true)),{once:true}));
      job.result=await Promise.race([work(),aborted]);job.state='succeeded';job.phase='complete';
    } catch(e) {job.state=e.code==='JOB_CANCELLED'?'cancelled':'failed';job.error=safeError(e);job.result=null}
    finally {signal?.removeEventListener('abort',cancel);clearTimeout(timer);store.put(owner,job.id,'job',job)}
  }
  const revisions=createRevisionService({store,llm,tools,catalogue,model,profileProvider,totalTimeoutMs});
  async function services(owner,id,{kind,poiId}) {
    assert(kind==='tickets','INVALID_QUERY','仅开放携程门票查询');
    const it=store.get(owner,id,'itinerary');assert(it.context.selectedPoiIds.includes(poiId),'UNKNOWN_POI','只能查询当前行程的景点');
    const cacheId=`trip:v2:${id}:${kind}:${poiId}`;try{const c=store.get(owner,cacheId,'trip');if(Date.parse(c.expiresAt)>Date.now())return c}catch(e){if(e.code!=='NOT_FOUND')throw e}
    assert(store.rateLimit('trip:'+owner,12,60000),'RATE_LIMITED','查询太频繁，请稍后重试',429);
    const line=await catalogue(it.context.lineId),poi=line.pois.find(p=>p.poiId===poiId);const result=await trip.query({kind,city:line.line.city,poi});const data={...result,expiresAt:new Date(Date.now()+5*60000).toISOString()};store.put(owner,cacheId,'trip',data);return data
  }
  return {intake,generate,cancelJob(owner,id){store.get(owner,id,'job');queue.cancel(owner,id);return store.get(owner,id,'job')},...revisions,services,getSession:(o,id)=>view(store.get(o,id,'session')),getJob:(o,id)=>store.get(o,id,'job'),getItinerary:(o,id)=>store.get(o,id,'itinerary'),status:()=>({configured:llm.configured,tripConfigured:trip.configured,plannerEngine:'hybrid.v1',touristSchedules:true,negotiation:'batch.v2',jobQueue:queue.stats(),mentorBudget:true,model:llm.model,traffic:'distance_estimate',opening:'catalogue_unverified',implemented:['intake','generate','validation','revisions','additions','commits','undo','trip_queries'],pending:[]}),async settle(){await queue.settle();await Promise.allSettled([...running]);await revisions.settle()}}
}
