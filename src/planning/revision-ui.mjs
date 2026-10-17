import {createTicketButton,createTicketPanel} from './ticket-ui.mjs'
import {createTimeWheel} from './time-wheel.mjs'
import {createPlanningAPI,waitForPlanningJob,approximateDuration,displayTimeRange} from './client.mjs'
const el=(tag,attrs={},children=[])=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(v==null||v===false)continue;if(k==='text')n.textContent=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v)}for(const c of children.flat())if(c)n.append(c);return n};
const btn=(text,onclick,attrs={})=>el('button',{type:'button',class:'btn',text,onclick,...attrs});
const unique=a=>[...new Set(a)];
const visits=it=>it.days.flatMap(d=>d.items.filter(i=>i.type==='visit').map(i=>({...i,date:d.date})));
const VIOLATIONS={UNSCHEDULED_POI:'时间或开放条件不足，尚有景点未排入',PROTECTED_POI:'必去景点不能直接删除，请先取消必去',LOCKED_DAY_CHANGED:'修改影响了已锁定的日期',UNEXPECTED_POI:'锁定日程中仍有本次要求删除的景点',DUPLICATE_POI:'景点与锁定安排发生重复',ASSIGNED_DATE_CHANGED:'目标日期与锁定安排冲突',DAY_END_EXCEEDED:'超过当天结束时间',DAY_END_CONSTRAINT:'结束时间与已锁定安排冲突',DEPTH_CONSTRAINT:'游览深度与锁定安排冲突',MISSING_MUST_VISIT:'必去景点尚未排入',EXCLUDED_POI:'安排包含明确不想去的景点',REST_INTERVAL_EXCEEDED:'连续活动时间超出休息要求',DAILY_WALK_LIMIT:'交通步行超过当天上限',MEAL_UNSCHEDULED:'无法保留合适的用餐时间',FIXED_EVENT_MISMATCH:'固定活动时间不能满足'};
export function createRevisionExperience({getPois,onUpdate,api=createPlanningAPI()}={}) {
  let root=null,timelineRoot=null,sidebar=null,layoutHost=null,it=null,controller=null,recController=null,epoch=0,additionController=null,additionTimer=null,additionEpoch=0,queryController=null,queryEpoch=0,ticketFloat=null;
  let state={text:'',preview:null,candidates:[],selected:new Set(),busy:false,loading:false,error:'',notice:'',query:null,queryBusy:false,commitKey:null,addId:'',addDate:''};
  const name=id=>getPois().find(p=>p.poiId===id)?.name||id;
  function stop(){ticketFloat?.remove();ticketFloat=null;state.query=null;queryEpoch++;queryController?.abort();additionEpoch++;clearTimeout(additionTimer);additionController?.abort();epoch++;controller?.abort();recController?.abort();state.busy=false;state.loading=false;state.queryBusy=false}
  async function action(work){if(state.busy)return;const token=++epoch;controller?.abort();controller=new AbortController();state.busy=true;state.error='';render();try{await work(controller.signal,()=>token===epoch)}catch(e){if(token!==epoch||controller.signal.aborted)return;if(e.code==='STALE_PREVIEW'&&state.additionSidebar){state.error='';state.notice='预览已更新，请核对后再次应用。';checkAdditions();return}state.error=e.code==='LLM_NOT_CONFIGURED'?'智能修改暂未就绪，仍可使用景点下方的调整控件。':e.code==='MODEL_PROTOCOL'?'智能体这次没能完成有效调整，原行程已保留。可以换个说法重试。':e.message||'操作失败，原行程已保留';if(['STALE_VERSION','STALE_INTAKE'].includes(e.code)){try{const current=await api(`/api/itineraries/${it.id}`,undefined,{signal:controller.signal});if(token===epoch)onUpdate(current)}catch{}}}finally{if(token===epoch){state.busy=false;render()}}}
  async function preview(payload){state.additionSidebar=false;state.sidebarOpen=true;state.preview=null;state.commitKey=null;await action(async(signal,current)=>{const job=await api(`/api/itineraries/${it.id}/revisions`,{baseVersion:it.version,baseIntakeRevision:it.intakeRevision,...payload},{signal});const result=await waitForPlanningJob(api,job,{signal});if(!current())return;if(result.kind==='clarification'){state.notice=result.questions.join('；');return}state.preview=result.preview;state.notice='这只是试排预览，原行程尚未改变。';render()})}
  function apply(){if(state.additionSidebar&&state.preview?.expiresAt&&Date.parse(state.preview.expiresAt)<=Date.now()){state.notice='预览已过期，正在重新核算；原行程未改变。';checkAdditions();return}state.commitKey||=crypto.randomUUID();action(async(signal,current)=>{const next=await api(`/api/itineraries/${it.id}/commits`,{baseVersion:it.version,previewId:state.preview.id},{signal,idempotencyKey:state.commitKey});if(current()){state.notice='修改已应用。';onUpdate(next,{reason:'commit'})}})}
  function undo(){action(async(signal,current)=>{const next=await api(`/api/itineraries/${it.id}/undo`,{baseVersion:it.version,targetVersion:it.version-1},{signal});if(current())onUpdate(next)})}
  async function recommendations({preserve=false,force=false,signal}={}){
    recController?.abort();const ctrl=new AbortController();recController=ctrl;const mounted=root,version=it.version,id=it.id;
    const current=()=>root===mounted&&it.id===id&&it.version===version&&!ctrl.signal.aborted&&!signal?.aborted;
    const abort=()=>ctrl.abort();signal?.addEventListener('abort',abort,{once:true});
    const chosen=state.candidates.filter(c=>state.selected.has(c.candidateId)).map(c=>c.poiId);
    state.loading=true;render();
    try{const data=await api(`/api/itineraries/${id}/additions?baseVersion=${version}${force?'&refresh=1':''}`,undefined,{signal:ctrl.signal});if(!current())return false;
      state.candidates=data.candidates;state.selected=new Set(preserve?data.candidates.filter(c=>chosen.includes(c.poiId)).map(c=>c.candidateId):[]);state.additionPreview=null;
      if(preserve&&chosen.some(poiId=>!data.candidates.some(c=>c.poiId===poiId))){state.selected.clear();state.additionStatus='推荐已更新，原勾选中有景点当前不再推荐，请重新选择。';return false}
      if(!preserve){state.additionStatus='';state.additionChecking=false;}return true;
    }catch(e){if(current())state.additionStatus='推荐刷新失败，请点击「刷新推荐」重试。';return false}
    finally{signal?.removeEventListener('abort',abort);if(current()){state.loading=false;render()}}
  }
  function checkAdditions(){
    clearTimeout(additionTimer);additionController?.abort();const token=++additionEpoch;
    state.additionPreview=null;if(state.additionSidebar)state.preview=null;
    if(!state.selected.size){if(state.additionSidebar){state.additionSidebar=false;state.sidebarOpen=false;state.preview=null;}state.additionStatus='';state.additionChecking=false;render();return}
    state.additionStatus='正在联合核算所选景点…';state.additionChecking=true;state.additionTimePending=false;render();
    additionTimer=setTimeout(async()=>{const ctrl=new AbortController();additionController=ctrl;const id=it.id,version=it.version;
      const current=()=>root&&token===additionEpoch&&it.id===id&&it.version===version&&!ctrl.signal.aborted;
      try{
        const operations=state.additionHours?[{type:'set_requirement',key:'departure',value:state.additionHours.start,scope:{type:'trip',targetId:null}},{type:'set_requirement',key:'dayEnd',value:state.additionHours.end,scope:{type:'trip',targetId:null}}]:[];
        if(state.additionHours&&state.additionHours.start>=state.additionHours.end)throw new Error('结束时间需晚于开始时间。');
        for(let retry=0;retry<2;retry++){
          try{
            const expired=state.candidates.some(c=>state.selected.has(c.candidateId)&&c.expiresAt&&Date.parse(c.expiresAt)<=Date.now()+5000);
            if(expired){const refreshed=await recommendations({preserve:true,force:true,signal:ctrl.signal});if(!current()||!refreshed)return;}
            const job=await api(`/api/itineraries/${id}/revisions`,{baseVersion:version,baseIntakeRevision:it.intakeRevision,selectedCandidateIds:[...state.selected],operations},{signal:ctrl.signal});
            const result=await waitForPlanningJob(api,job,{signal:ctrl.signal,delayMs:150});if(!current())return;
            if(!result.preview)throw new Error('未能完成追加试排。');state.additionPreview=result.preview;
            if(state.additionSidebar){state.preview=result.preview;state.sidebarOpen=true;state.commitKey=null;}
            state.additionStatus=result.preview.validation.status==='failed'?'当前组合排不下，请减少追加景点或增加游览时间。':'所选组合可以安排，查看预览后即可应用。';break;
          }catch(e){if(!current())return;if(retry===0&&['STALE_PREVIEW','NOT_FOUND'].includes(e.code)){state.additionStatus='推荐已更新，正在保留你的选择重新核算…';const refreshed=await recommendations({preserve:true,force:true,signal:ctrl.signal});if(!current()||!refreshed)return;continue;}throw e;}
        }
      }catch(e){if(current())state.additionStatus=e.message||'核算失败，请重试。'}finally{if(current()){state.additionChecking=false;render()}}
    },250)
  }
  function openAdditionPreview(){
    if(!state.selected.size)return;state.additionSidebar=true;state.sidebarOpen=true;state.commitKey=null;
    const p=state.additionPreview;
    if(p&&(!p.expiresAt||Date.parse(p.expiresAt)>Date.now())&&!state.additionTimePending){state.preview=p;render();return}
    state.preview=null;checkAdditions();
  }
  async function query(kind,poiId){
    if(state.busy||state.queryBusy)return;
    queryController?.abort();const ctrl=new AbortController();queryController=ctrl;const token=++queryEpoch,id=it.id,version=it.version;
    const current=()=>root&&token===queryEpoch&&it.id===id&&it.version===version&&!ctrl.signal.aborted;
    const context={kind:'tickets',poiId,poiName:name(poiId)};
    state.queryBusy=true;state.query={...context,loading:true};render();
    try{const data=await api(`/api/itineraries/${id}/services?kind=tickets&poiId=${encodeURIComponent(poiId)}`,undefined,{signal:ctrl.signal});if(current())state.query={...data,...context}}
    catch(e){if(current())state.query={...context,error:e.message||'门票查询失败，请稍后重试'}}
    finally{if(current()){state.queryBusy=false;render()}}
  }
  function closeTickets(){
    const poiId=state.query?.poiId;queryEpoch++;queryController?.abort();state.queryBusy=false;state.query=null;render();
    const host=[...(timelineRoot?.querySelectorAll('[data-poi-controls]')||[])].find(n=>n.dataset.poiControls===poiId);host?.querySelector('.ticket-query-circle')?.focus({preventScroll:true});
  }
  function closeSidebar(){sidebar?.remove();sidebar=null;layoutHost?.classList.remove('planning-preview-open')}
  function renderTimelineControls(){
    if(!timelineRoot||!it)return;
    const must=unique(it.requirements.filter(r=>r.state!=='superseded'&&r.key==='mustVisit').flatMap(r=>r.value));
    const locked=unique(it.requirements.filter(r=>r.state!=='superseded'&&r.key==='scheduleLock').flatMap(r=>r.value.lockedDates));
    for(const host of timelineRoot.querySelectorAll('[data-day-controls]')){const date=host.dataset.dayControls;host.replaceChildren(btn(locked.includes(date)?'解除锁定':'锁定当天',()=>preview({operations:[{type:locked.includes(date)?'unlock_day':'lock_day',date}]}),{class:'revision-text-action',disabled:state.busy}))}
    for(const host of timelineRoot.querySelectorAll('[data-poi-controls]')){
      const row=visits(it).find(v=>v.poiId===host.dataset.poiControls);if(!row){host.replaceChildren();continue}
      const rows=visits(it).filter(v=>v.date===row.date),index=rows.findIndex(v=>v.id===row.id);
      const depth=el('select',{'aria-label':`${name(row.poiId)}游览深度`});for(const[value,label]of [['normal','正常游览'],['deep','深度体验'],['quick','快速打卡']])depth.append(el('option',{value,text:label}));depth.value=row.depth;depth.addEventListener('change',()=>preview({operations:[{type:'set_depth',poiId:row.poiId,depth:depth.value}]}));
      const date=el('select',{'aria-label':`${name(row.poiId)}安排日期`});for(const d of it.days)date.append(el('option',{value:d.date,text:d.date}));date.value=row.date;date.addEventListener('change',()=>{const anchor=visits(it).filter(v=>v.date===date.value&&v.poiId!==row.poiId).at(-1)?.id||null;preview({operations:[{type:'move_poi',poiId:row.poiId,date:date.value,afterItemId:anchor}]})});
      const up=btn('↑',()=>preview({operations:[{type:'move_poi',poiId:row.poiId,date:row.date,afterItemId:index>1?rows[index-2].id:null}]}),{class:'itinerary-icon-action',disabled:index===0||state.busy,'aria-label':`${name(row.poiId)}上移`,title:'上移'});
      const down=btn('↓',()=>preview({operations:[{type:'move_poi',poiId:row.poiId,date:row.date,afterItemId:rows[index+1].id}]}),{class:'itinerary-icon-action',disabled:index===rows.length-1||state.busy,'aria-label':`${name(row.poiId)}下移`,title:'下移'});
      const remove=btn('−',()=>preview({operations:[...(must.includes(row.poiId)?[{type:'set_requirement',key:'mustVisit',value:must.filter(id=>id!==row.poiId),strength:'hard'}]:[]),{type:'remove_poi',poiId:row.poiId}]}),{class:'itinerary-remove-action','aria-label':`删除${name(row.poiId)}`,title:'删除景点',disabled:state.busy});
      const poi=getPois().find(p=>p.poiId===row.poiId)||{name:name(row.poiId)};
      const ticket=createTicketButton(poi,{busy:state.busy||state.queryBusy,loading:state.queryBusy&&state.query?.poiId===row.poiId,onQuery:()=>query('tickets',row.poiId)});date.disabled=state.busy;depth.disabled=state.busy;host.replaceChildren(up,down,remove,date,depth,ticket)
    }
  }
  function render(){
    if(!root||!it)return;
    const sendEdit=()=>{if(state.busy)return;if(!state.text.trim()){state.error='写下想调整的内容，再发送。';render();return}preview({text:state.text})};
    const text=el('textarea',{rows:2,maxlength:6000,'aria-label':'修改行程需求',placeholder:'想调整哪里？例如：第二天轻松一点，第一天保持不变。'});text.value=state.text;text.addEventListener('input',()=>state.text=text.value);text.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendEdit()}});
    const natural=el('div',{class:'conversation-followup revision-composer'},[text,btn('↑',sendEdit,{class:'revision-send','aria-label':'发送行程调整'})]);
    const head=el('div',{class:'revision-toolbar'},[...(it.version>1?[btn('撤销上次修改',undo,{class:'revision-text-action',disabled:state.busy})]:[])]);
    const rec=el('section',{class:'revision-recommendations'},[el('div',{class:'revision-heading'},[el('h3',{text:'还可以顺路去'}),btn('刷新推荐',()=>{additionEpoch++;additionController?.abort();clearTimeout(additionTimer);state.additionChecking=false;if(state.additionSidebar){state.preview=null;state.additionSidebar=false;state.sidebarOpen=false;}recommendations({force:true})},{class:'revision-text-action',disabled:state.loading})]),el('p',{class:'sub',text:'已按照你的偏好生成追加优先级'})]);
    if(state.loading)rec.append(el('p',{text:'正在找适合顺路加入的地方…',role:'status'}));
    else if(!state.candidates.length)rec.append(el('p',{class:'sub',text:'当前没有合适的追加建议。保留空白，也是一种好安排。'}));
    for(const c of state.candidates){const checkbox=el('input',{type:'checkbox','aria-label':`追加${name(c.poiId)}`});checkbox.checked=state.selected.has(c.candidateId);checkbox.addEventListener('change',()=>{checkbox.checked?state.selected.add(c.candidateId):state.selected.delete(c.candidateId);checkAdditions()});rec.append(el('label',{class:'revision-candidate'},[checkbox,el('div',{},[el('strong',{text:`${c.rank||state.candidates.indexOf(c)+1} · ${name(c.poiId)}`}),el('p',{class:'sub',text:getPois().find(p=>p.poiId===c.poiId)?.intro||''})])]))}
    if(state.selected.size){const hours=state.additionHours||{start:it.days[0].startAt.slice(11,16),end:it.days[0].endAt.slice(11,16)};const wheels=el('div',{class:'conversation-times'});for(const [key,label]of [['start','最早开始游览'],['end','最晚结束游览']])wheels.append(createTimeWheel({label,value:hours[key],onSubmit:checkAdditions,onChange:value=>{if(value===hours[key])return;hours[key]=value;state.additionHours=hours;state.additionTimePending=true;state.additionPreview=null;if(state.additionSidebar){state.preview=null;state.sidebarOpen=false;state.additionSidebar=false;closeSidebar()}additionEpoch++;additionController?.abort();clearTimeout(additionTimer);const b=root?.querySelector('[data-additions-preview]');if(b)b.disabled=true;const status=root?.querySelector('[data-addition-status]');if(status)status.textContent='时间已调整，点击「修改时间」核算。'}}));rec.append(wheels,btn('修改时间',()=>{root.querySelectorAll('.time-wheel').forEach(n=>n.commitValue?.());checkAdditions()},{class:'btn sm'}))}
    rec.append(el('p',{class:'sub',role:'status','data-addition-status':'',text:state.additionStatus||''}),btn('查看追加预览',openAdditionPreview,{class:'btn primary','data-additions-preview':'',hidden:!state.selected.size,disabled:!state.selected.size||state.additionChecking||state.additionTimePending||!state.additionPreview||state.additionPreview.validation.status==='failed'}));
    const feedback=el('div',{'aria-live':'polite'});if(state.notice)feedback.append(el('p',{class:'sub',text:state.notice}));if(state.error)feedback.append(el('p',{class:'planning-error',role:'alert',text:state.error}));
    root.replaceChildren(natural,head,feedback);
    if(state.sidebarOpen){if(!sidebar){sidebar=el('aside',{class:'planning-preview-sidebar','aria-label':'行程调整预览'});document.body.append(sidebar)}layoutHost?.classList.add('planning-preview-open');if(!state.preview)sidebar.replaceChildren(el('h3',{text:'行程预览'}),el('p',{role:'status',text:state.additionSidebar?state.additionStatus||'正在核算追加方案…':state.busy?'正在重新核算并更新预览…':state.error||state.notice||'原行程保持不变。'}),btn('保留原行程',()=>{state.sidebarOpen=false;state.additionSidebar=false;state.preview=null;render()},{class:'btn'}))}else closeSidebar();
    if(state.preview){const p=state.preview,d=p.diff,failed=p.validation.status==='failed';const pane=el('section',{class:'revision-preview'},[el('h3',{text:failed?'这次调整有冲突，原行程未变':'调整预览 · 应用后才生效'})]);
      const summary=[];if(d.added.length)summary.push('增加：'+d.added.map(name).join('、'));if(d.removed.length)summary.push('删除：'+d.removed.map(name).join('、'));for(const m of d.reordered||[])if(!d.moved.some(v=>v.poiId===m.poiId))summary.push(`${name(m.poiId)}：调整当天游览顺序`);if(d.unscheduled?.length)summary.push('试排未能安排：'+d.unscheduled.map(name).join('、')+'（未删除，原行程保留）');for(const m of d.moved)summary.push(`${name(m.poiId)}：${m.fromDate} → ${m.toDate}`);for(const m of d.depthChanged)summary.push(`${name(m.poiId)}：调整游览深度`);if(d.timeChanged.length)summary.push(`${d.timeChanged.length}个景点的预计时段将调整`);if(!summary.length)summary.push('更新偏好或当天锁定条件');if(!failed)summary.push(`整体${d.incrementalMinutes>=0?'增加':'减少'}约${approximateDuration(Math.abs(d.incrementalMinutes))}`);
      pane.append(el('ul',{},summary.map(text=>el('li',{text}))));
      if(failed)pane.append(el('ul',{class:'planning-error'},unique(p.validation.violations.map(v=>(VIOLATIONS[v.code]||v.message||'当前条件暂时无法满足')+(v.relatedIds?.length?'：'+v.relatedIds.map(name).join('、'):''))).map(text=>el('li',{text}))));
      else {for(const day of p.proposedItinerary.days){pane.append(el('h4',{text:day.date}));for(const item of day.items.filter(i=>['visit','meal','fixed_event'].includes(i.type)))pane.append(el('p',{text:`${displayTimeRange(item)}  ${item.type==='visit'?name(item.poiId):item.type==='meal'?(item.label||'用餐'):(item.touristSchedule?'游客日程 · '+item.label:'固定安排')}`}))}}
      pane.append(el('div',{class:'planning-actions'},[btn('应用新行程',apply,{class:'btn primary',disabled:failed||state.busy}),btn('保留原行程',()=>{state.sidebarOpen=false;state.additionSidebar=false;state.preview=null;state.notice='已取消预览，原行程未变。';render()})]));sidebar?.replaceChildren(pane)
    }
    root.append(rec);
    if(state.query){
      const fresh=!ticketFloat;
      if(fresh){ticketFloat=el('aside',{class:'ticket-floating-window',role:'dialog','aria-modal':'false','aria-label':'门票与预约',tabindex:'-1'});document.body.append(ticketFloat);ticketFloat.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeTickets()}})}
      const scroll=ticketFloat.querySelector('.ticket-floating-body')?.scrollTop||0;
      const close=btn('×',closeTickets,{class:'ticket-floating-close','aria-label':'关闭门票浮窗',title:'关闭'});
      const body=el('div',{class:'ticket-floating-body'},[createTicketPanel(state.query,{busy:state.busy||state.queryBusy,onRetry:()=>query('tickets',state.query.poiId)})]);
      ticketFloat.replaceChildren(el('header',{class:'ticket-floating-header'},[el('strong',{text:'门票与预约'}),close]),body);body.scrollTop=scroll;
      if(fresh)ticketFloat.focus({preventScroll:true});
    }else {ticketFloat?.remove();ticketFloat=null}

    if(sidebar&&state.busy){for(const n of sidebar.querySelectorAll('button'))n.disabled=true}renderTimelineControls();
    if(state.busy){for(const n of root.querySelectorAll('button,input,textarea,select'))n.disabled=true;root.append(el('p',{role:'status',text:'正在重新核算，原行程会保留…'}),btn('停止等待',()=>{stop();state.notice='已停止等待；未应用的预览不会改变原行程。';render()},{class:'btn sm'}))}
  }
  return {queryTicket(poiId){return query('tickets',poiId)},mount(container,latest,{timeline=null}={}){stop();root=container;timelineRoot=timeline||container.parentElement?.querySelector('.planning-result');layoutHost=container.closest('.formal-itinerary')||container.parentElement;const changed=!it||it.id!==latest.id||it.version!==latest.version;it=latest;if(changed)state={...state,preview:null,sidebarOpen:false,candidates:[],selected:new Set(),error:'',notice:'',text:'',query:null,commitKey:null,addId:'',addDate:'',additionPreview:null,additionHours:null,additionStatus:'',additionChecking:false,additionTimePending:false,additionSidebar:false};render();recommendations()},unmount(){stop();closeSidebar();root=null;timelineRoot=null;layoutHost=null}}
}
