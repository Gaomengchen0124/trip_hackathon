import {haversineKm} from '../../src/planner.mjs'
import {normalizeRequest,computeBudget} from '../../client(1)/itinerary-planner/src/itinerary.js'
import {scheduleItinerary,validateItinerary} from '../../src/planning/scheduler.mjs'
import {active,applicable,pick,clock,datesBetween} from '../../src/planning/core.mjs'

// Reuse the mentor's exact packing budget with optimistic assumptions. This is
// a necessary-condition check, never a proof that opening/travel/meals fit.
export function preflightBudget({context,requirements=[],points}) {
 const dates=datesBetween(context.dateRange.startDate,context.dateRange.endDate);
 const windows=dates.map(date=>{const start=pick(requirements,'departure',date);const wake=pick(requirements,'wake',date);return clock(pick(requirements,'dayEnd',date)||'17:00')-(start?clock(start):wake?clock(wake)+60:600)});
 const window=Math.max(...windows);if(window<=0||window>=1440)return {status:'unknown',reason:'INVALID_DAY_WINDOW'};
 const attractions=[];
 for(const id of context.selectedPoiIds){const p=points[id];if(!p)return {status:'unknown',reason:'MISSING_POI'};const durations=dates.map(date=>{const depth=requirements.filter(r=>r.key==='poiDepth'&&applicable(r,date,id)).at(-1)?.value.depth||'normal';return depth==='quick'?p.durationRush:depth==='deep'?p.durationDeep:p.durationNormal});if(durations.some(v=>!Number.isInteger(v)||v<=0||v>1440))return {status:'unknown',reason:'MISSING_DURATION'};attractions.push({name:id,durationMinutes:Math.min(...durations)})}
 const request=normalizeRequest({city:'当前目的地',days:dates.length,dailyStart:'00:00',dailyEnd:`${String(Math.floor(window/60)).padStart(2,'0')}:${String(window%60).padStart(2,'0')}`,transferMinutes:0,attractions});
 const budget=computeBudget(request);return {status:budget.fits?'possible':'over_capacity',source:'mentor_itinerary_planner',exact:budget.exact,minimumDays:budget.minimumDays===Infinity?null:budget.minimumDays,visitMinutes:budget.totalVisitMinutes,optimisticCapacityMinutes:budget.capacityMinutes,actualWindowMinutes:windows.reduce((n,v)=>n+Math.max(0,v),0),assumptions:['使用最长单日窗口作为乐观上限','转场按0分钟作下界，不含用餐休息','不同日期的游览深度取最短有效时长'],message:budget.fits?'基础游览预算未排除可行性，仍需核算开放时间、交通和用餐休息。':'即使不计交通和用餐休息，基础游览预算仍不足；需调整时间或自主取舍。'}
}
function alternatives(ids,points,requirements){const variants=[];const add=a=>variants.push(a);const duration=id=>points[id]?.durationNormal||0;for(const start of ids.slice(0,6)){const route=[start],remaining=ids.filter(id=>id!==start);while(remaining.length){remaining.sort((a,b)=>haversineKm(points[route.at(-1)],points[a])-haversineKm(points[route.at(-1)],points[b]));route.push(remaining.shift())}add(route)}add([...ids].reverse());add([...ids].sort((a,b)=>duration(b)-duration(a)));add([...ids].sort((a,b)=>duration(a)-duration(b)));const mandatory=new Set(requirements.filter(r=>active(r)&&r.key==='mustVisit').flatMap(r=>r.value));add([...ids].sort((a,b)=>Number(mandatory.has(b))-Number(mandatory.has(a))));for(let i=1;i<ids.length;i++)add([...ids.slice(i),...ids.slice(0,i)]);
 // Bounded permutations search different grouping boundaries without asking the
 // model to do arithmetic. Larger cases use deterministic local swaps.
 if(ids.length<=7){const walk=(prefix,rest)=>{if(variants.length>=120)return;if(!rest.length){add(prefix);return}for(let i=0;i<rest.length;i++)walk([...prefix,rest[i]],[...rest.slice(0,i),...rest.slice(i+1)])};walk([],ids)}else for(let i=0;i<ids.length&&variants.length<120;i++)for(let j=i+1;j<ids.length&&variants.length<120;j++){const v=[...ids];[v[i],v[j]]=[v[j],v[i]];add(v)}return variants}
export async function scheduleHybrid(options,{validator=validateItinerary,maxTrials=48,maxSearchMs=2500}={}){
 const started=Date.now();let attempts=0,successes=0;const seen=new Set();const budget=preflightBudget(options);let best;
 const score=(draft,validation)=>{const loads=draft.days.map(d=>d.items.filter(i=>['visit','travel','buffer','rest'].includes(i.type)).reduce((n,i)=>n+i.durationMinutes,0));const mean=loads.reduce((a,b)=>a+b,0)/Math.max(1,loads.length);const imbalance=Math.sqrt(loads.reduce((n,v)=>n+(v-mean)**2,0)/Math.max(1,loads.length));const transit=draft.days.flatMap(d=>d.items).filter(i=>['travel','wait'].includes(i.type)).reduce((n,i)=>n+i.durationMinutes,0);return [validation.status==='failed'?1:0,draft.unscheduledPoiIds.length,validation.violations.length,Math.round(imbalance/30),transit]};
 const better=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]<b[i]}return false};
 const consider=draft=>{const validation=validator(draft),value=score(draft,validation);if(!best||better(value,best.score))best={draft,validation,score:value};if(validation.status!=='failed')successes++;return validation};
 const ids=options.candidateOrder||options.context.selectedPoiIds;
 const dates=datesBetween(options.context.dateRange.startDate,options.context.dateRange.endDate);
 const availability=id=>dates.filter(d=>options.points[id].opening[d]?.windows?.length!==0);
 const deadline=id=>availability(id).at(-1)||'';
 const deadlineOrder=[...ids].sort((a,b)=>deadline(a).localeCompare(deadline(b))||availability(a).length-availability(b).length||(options.points[b].durationNormal||0)-(options.points[a].durationNormal||0));
 const explicitPlacement=Object.keys(options.assignments||{}).length||Object.keys(options.frozenDays||{}).length;
 const orders=explicitPlacement?[ids]:[deadlineOrder,ids,...alternatives(ids,options.points,options.requirements||[])];
 for(const order of orders){options.signal?.throwIfAborted();const key=JSON.stringify(order);if(seen.has(key))continue;if(attempts&&(attempts>=Math.max(1,maxTrials-Math.min(12,Math.floor(maxTrials/3)))||Date.now()-started>=maxSearchMs*.7||successes>=6))break;seen.add(key);attempts++;
   const draft=await scheduleItinerary({...options,policy:{...options.policy,balanceWorkload:true},candidateOrder:order});const validation=consider(draft);
   if(validation.status==='failed')consider(await scheduleItinerary({...options,candidateOrder:order}));
   if(budget.status==='over_capacity')break;
 }
 // Explicit day moves explore partitions that a one-pass ordering cannot reach.
 // Existing revision assignments and frozen dates remain authoritative.
 if(best.validation.status==='failed'&&!Object.keys(options.assignments||{}).length&&!Object.keys(options.frozenDays||{}).length){
   const windows=dates.map(date=>clock(pick(options.requirements||[],'dayEnd',date)||'17:00')-clock(pick(options.requirements||[],'departure',date)||'10:00'));
   const critical=[...ids].filter(id=>availability(id).length<dates.length||(options.points[id].durationNormal||0)>=Math.max(...windows)*.5).sort((a,b)=>availability(a).length-availability(b).length||(options.points[b].durationNormal||0)-(options.points[a].durationNormal||0)).slice(0,3);
   const placements=[];const assign=(index,current)=>{if(placements.length>=24)return;if(index===critical.length){placements.push({...current});return}const id=critical[index];for(const date of availability(id))assign(index+1,{...current,[id]:date})};if(critical.length)assign(0,{});
   for(const assignments of placements){if(attempts>=maxTrials||Date.now()-started>=maxSearchMs)break;options.signal?.throwIfAborted();attempts++;const order=[...critical,...ids.filter(id=>!critical.includes(id))];const draft=await scheduleItinerary({...options,candidateOrder:order,assignments,policy:{...options.policy,balanceWorkload:true}});if(consider(draft).status==='failed')consider(await scheduleItinerary({...options,candidateOrder:order,assignments}));}

 }
 const failures=[];
 if(best.validation.status==='failed')for(const id of best.draft.unscheduledPoiIds){
   if(Date.now()-started>=maxSearchMs)break;
   const mandatory=(options.requirements||[]).filter(r=>r.key!=='mustVisit'||r.value.includes(id)).map(r=>r.key==='mustVisit'?{...r,value:[id]}:r);
   const solo=await scheduleItinerary({...options,context:{...options.context,selectedPoiIds:[id]},requirements:mandatory,candidateOrder:[id],assignments:options.assignments?.[id]?{[id]:options.assignments[id]}:{},frozenDays:{}});
   if(solo.unscheduledPoiIds.includes(id))failures.push({poiId:id,code:'POI_CANNOT_FIT_ALONE',message:'该景点单独试排也无法满足当前时长、开放或用餐条件，删除其他景点不能解决此冲突。'});
 }
 best.draft.planningDiagnostics={engine:'hybrid.v2',budget,blockingPoints:failures,search:{attempts,maxTrials,elapsedMs:Date.now()-started,exhaustive:false},failureType:failures.length?'poi_constraints':budget.status==='over_capacity'?'capacity':best.validation.status==='failed'?'search_limit':null,message:best.validation.status==='failed'?(failures.length?'部分景点自身条件冲突，应先调整对应时长、日期或用餐策略。':'在限定搜索内未找到完整方案，尚未证明无解。'):'已按当前事实、时间负荷和约束核算。'};return {draft:best.draft,validation:best.validation}
}
