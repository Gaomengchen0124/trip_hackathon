import {preferenceFit} from './preference-ranking.mjs'
import {removalProposal,additionProposal} from './negotiation.mjs'
const el=(tag,attrs={},children=[])=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(v==null||v===false)continue;if(k==='text')n.textContent=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v)}for(const c of children.flat())if(c)n.append(c);return n};
const button=(text,onclick,attrs={})=>el('button',{type:'button',text,onclick,...attrs});
export function createNegotiation({kind,ids,candidates,protectedIds=[],requirements=[],context,hours,trial,plan,onApply,onCancel,getPois}){
 const adding=kind==='add',host=el('section',{class:'negotiation-panel conversation-advice',role:'dialog','aria-modal':'true','aria-label':adding?'顺路追加协商':'景点取舍协商'});
 const state={protected:[...protectedIds],rejected:[],dates:{...context.dateRange},hours:{...hours},proposal:null,busy:true,error:'',retryAt:0,row:null,rowPhase:'',manage:false,settings:false,dirty:false};
 const cache=new Map();
 let epoch=0,ctrl,timer,retryTimer,timeEditor=null,disposed=false,previousFocus=document.activeElement;
 const name=id=>candidates.find(c=>c.poiId===id)?.name||getPois().find(p=>p.poiId===id)?.name||id;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const snapshot=()=>({dateRange:{...state.dates},hours:{...state.hours},protectedIds:[...state.protected]});
 async function calculate({row=null}={}){
  clearTimeout(timer);ctrl?.abort();ctrl=new AbortController();const signal=ctrl.signal,ticket=++epoch,current=()=>!disposed&&ticket===epoch&&!signal.aborted;
  if(state.retryAt>Date.now()){state.busy=false;state.dirty=true;render();return;}
  state.busy=true;state.dirty=true;state.error='';state.pendingText='正在核算整组路线与时间…';if(row){state.row=row;state.rowPhase='exit'}render();
  try{
   if(state.hours.start>=state.hours.end)throw Error('结束时间需晚于开始时间。');
   const dayCount=(Date.parse(state.dates.endDate)-Date.parse(state.dates.startDate))/86400000;
   if(!Number.isInteger(dayCount)||dayCount<0||dayCount>=14)throw Error('请选择有效日期，行程需为 1 至 14 天。');
   if(row){await pause(220);if(!current())return;state.rowPhase='loading';render();}
   const settings=snapshot();const check=selected=>trial(selected,settings,signal);
   const request={kind,candidateIds:candidates.map(c=>c.poiId),rejectedIds:[...state.rejected]};const cacheKey=JSON.stringify({settings,request});
   const cached=cache.get(cacheKey);let proposal=cached?.expires>Date.now()?cached.proposal:null;if(!proposal){proposal=plan?await plan(settings,request,signal,text=>{if(current()){state.pendingText=text;for(const n of host.querySelectorAll('[data-negotiation-progress]'))n.textContent=text;}}):adding?await additionProposal({ids,ranked:candidates,rejectedIds:state.rejected,trial:check,signal}):await removalProposal({ids,ranked:candidates,protectedIds:state.protected,trial:check,signal});if(current()){if(cache.size>=20)cache.delete(cache.keys().next().value);cache.set(cacheKey,{expires:Date.now()+120000,proposal});}}
   if(!current())return;
   if(row){state.rowPhase='notice';render();await pause(1000);if(!current())return;}
   if(!row&&state.proposal?.ids.length&&!proposal.ids.length&&proposal.feasible){host.querySelectorAll('.negotiation-row').forEach(n=>n.classList.add('is-exiting'));await pause(220);if(!current())return;}
   state.proposal=proposal;state.dirty=false;state.row=null;state.rowPhase='';
  }catch(e){if(current()){state.error=e.code==='RATE_LIMITED'?'服务暂时繁忙，暂时无法完成核算。':e.message||'连接暂时中断，这次核算未完成。';state.dirty=true;state.row=null;state.rowPhase='';if(e.code==='RATE_LIMITED'){state.retryAt=Date.now()+(e.retryAfterSeconds||60)*1000;clearInterval(retryTimer);retryTimer=setInterval(()=>{if(disposed)return;render();if(state.retryAt<=Date.now())clearInterval(retryTimer);},1000);}}}
  finally{if(current()){state.busy=false;render();}}
 }
 function refuse(id){if(state.busy)return;if(adding)state.rejected.push(id);else state.protected.push(id);calculate({row:id});}
 function apply(skip=false){if(state.error||state.busy||!state.proposal?.feasible||state.dirty)return;const selected=skip?ids:adding?[...ids,...state.proposal.ids]:ids.filter(id=>!state.proposal.ids.includes(id));onApply({ids:selected,...snapshot(),kind,skip});}
 function closeTimeEditor(){state.settings=false;timeEditor?.remove();timeEditor=null;host.inert=false;host.querySelector('.negotiation-time-toggle')?.focus();}
 function openTimeEditor(){
  if(timeEditor)return;state.settings=true;
  const draft={dates:{...state.dates},hours:{...state.hours}},inputs={};
  const form=el('form',{class:'negotiation-time-dialog',role:'dialog','aria-modal':'true','aria-label':'调整日期与每天时间'},[el('h2',{text:'调整日期与每天时间'}),el('p',{class:'negotiation-subtitle',text:'调整完成后点击保存，系统再统一核算。'})]);
  const fields=el('div',{class:'negotiation-time-settings'});
  for(const [group,key,label,type]of [['dates','startDate','开始日期','date'],['dates','endDate','结束日期','date'],['hours','start','每天开始','time'],['hours','end','每天结束','time']]){
   const input=el('input',{type,value:draft[group][key],'aria-label':label,required:true});inputs[key]=input;
   fields.append(el('label',{},[el('span',{text:label}),input]));
  }
  const error=el('p',{class:'planning-error',role:'alert'});
  form.append(fields,error,el('div',{class:'negotiation-actions'},[button('取消',closeTimeEditor,{class:'negotiation-skip'}),el('button',{type:'submit',class:'btn primary',text:'保存并核算','data-save-negotiation-time':''})]));
  form.addEventListener('submit',e=>{
   e.preventDefault();const dates={startDate:inputs.startDate.value,endDate:inputs.endDate.value},hours={start:inputs.start.value,end:inputs.end.value};
   const count=(Date.parse(dates.endDate)-Date.parse(dates.startDate))/86400000;
   if(!Number.isInteger(count)||count<0||count>=14){error.textContent='请选择有效日期，行程需为 1 至 14 天。';return;}
   if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.end)||hours.start>=hours.end){error.textContent='结束时间需晚于开始时间。';return;}
   const changed=JSON.stringify(dates)!==JSON.stringify(state.dates)||JSON.stringify(hours)!==JSON.stringify(state.hours);
   closeTimeEditor();if(!changed)return;state.dates=dates;state.hours=hours;calculate();
  });
  timeEditor=el('div',{class:'negotiation-time-editor'},[form]);host.inert=true;document.body.append(timeEditor);inputs.startDate.focus();
  timeEditor.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeTimeEditor();}if(e.key==='Tab'){const nodes=[...form.querySelectorAll('button,input')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 }
 function render(){
  const positions=new Map([...host.querySelectorAll('[data-advice-poi]')].map(n=>[n.dataset.advicePoi,n.getBoundingClientRect().top]));
  const p=state.proposal,rows=(p?.ids||[]).filter(id=>!(state.error&&(adding?state.rejected:state.protected).includes(id))),blocked=!state.busy&&!state.error&&p&&!p.feasible;
  const content=[el('div',{class:'negotiation-heading'},[el('span',{class:'planning-eyebrow',text:'一起把行程安排得刚刚好'}),button('返回调整',()=>onCancel(),{class:'negotiation-back'})]),el('h2',{text:state.error?'这次核算未完成':adding?'还有余裕，顺路再去看看？':'时间有限，先把这些留给下次'}),el('p',{class:'negotiation-subtitle',text:state.error?'你的时间和选择都已保存。完成重新核算后，才能应用方案。':adding?'已为你搭配可同时安排的追加方案，也可以保留空余时间。':'已按取舍优先级试排。想去的可以保留，我们继续调整。'})];
  const list=el('div',{class:'negotiation-list','aria-live':'polite'});
  if(state.error)list.append(el('div',{class:'negotiation-error-card',role:'alert'},[el('strong',{text:state.error}),el('p',{text:rows.length?'下方保留上次建议供参考，当前尚未通过校验。':state.retryAt>Date.now()?'请稍等片刻，恢复后可点击下方「重新核算」。无需重复修改时间。':'点击下方「重新核算」继续，也可以返回规划页调整。'})]));
  rows.forEach((id,i)=>{const c=candidates.find(c=>c.poiId===id)||{},isRow=state.row===id;
   if(isRow&&state.rowPhase!=='exit'){list.append(el('div',{class:'negotiation-placeholder',role:'status','data-negotiation-placeholder':id},state.rowPhase==='loading'?[el('span',{class:'negotiation-dots','aria-label':'正在重新核算'},[el('i'),el('i'),el('i')])]:[el('span',{text:adding?`已跳过${name(id)}，调整了其余建议`:`已为你保留${name(id)}，调整了其余建议`})]));return;}
   const reason=adding?(c.reason||'与本次主题相关，已通过整组路线及时间试排。'):(c.reasons?.join('；')||'按当前取舍顺序移除此地点后，整组方案可通过时间试排。');
   list.append(el('article',{class:'negotiation-row'+(isRow?' is-exiting':''),'data-advice-poi':id},[el('span',{class:'negotiation-rank',text:i+1}),el('div',{class:'negotiation-copy'},[el('strong',{text:name(id)}),el('p',{text:reason}),adding&&Number.isFinite(c.incrementalMinutes)?el('small',{text:`单点试排预计增加 ${Math.max(0,Math.round(c.incrementalMinutes))} 分钟；当前方案已联合校验` }):null]),button(adding?'不想追加':'想要保留',()=>refuse(id),{class:'negotiation-keep',disabled:state.busy||Boolean(state.error),'data-keep-poi':id})]));
  });
  if(state.busy&&!state.row)list.append(el('div',{class:'negotiation-placeholder',role:'status'},[el('span',{class:'negotiation-dots','aria-label':'正在重新核算'},[el('i'),el('i'),el('i')]),el('span',{'data-negotiation-progress':'',text:state.pendingText||'正在核算整组路线与时间…'})]));
  if(!state.busy&&!state.error&&p?.feasible&&!rows.length)list.append(el('div',{class:'negotiation-empty'},[el('span',{text:'✓',class:'negotiation-check'}),el('h3',{text:adding?'留一点空白，也很好':'时间刚刚好，所有已选地点都能安排'}),el('p',{text:adding?'当前没有其他合适的追加地点，可以直接生成行程。':'已根据新的条件重新计算，无需舍弃景点。'})]));
  if(blocked)list.append(el('div',{class:'negotiation-empty'},[el('h3',{text:adding?'当前时间已无法容纳原有景点':'按当前条件，暂时无法安排所有必去地点'}),el('p',{text:'可以延长游玩时间，或调整已保留地点后重新核算。'}),button('延长游玩时间',openTimeEditor,{class:'btn'}),button('调整已保留地点',()=>{state.manage=true;render()},{class:'btn'})]));
  content.push(list);
  if(!adding)content.push(button(`已保留 · ${state.protected.length}`,()=>{state.manage=!state.manage;render()},{class:'negotiation-manage','aria-expanded':String(state.manage)}));
  if(state.manage){const manager=el('div',{class:'negotiation-protected'});for(const id of state.protected)manager.append(button(`${name(id)} · 取消保留`,()=>{state.protected=state.protected.filter(x=>x!==id);calculate()},{class:'conversation-choice',disabled:state.busy,'data-unprotect-poi':id}));if(!state.protected.length)manager.append(el('p',{text:'暂无锁定保留的地点。'}));content.push(manager);}
  const dateText=d=>d?`${Number(d.slice(5,7))}月${Number(d.slice(8,10))}日`:'';
  content.push(el('div',{class:'negotiation-time-summary'},[el('span',{text:`${dateText(state.dates.startDate)}—${dateText(state.dates.endDate)} · 每天 ${state.hours.start}—${state.hours.end}`}),button('修改时间',openTimeEditor,{class:'negotiation-time-toggle','aria-haspopup':'dialog'})]));
  content.push(el('p',{role:'status','data-feasibility-status':'','data-negotiation-progress':state.busy?'':null,class:'negotiation-status',text:state.error?'当前没有可应用的新方案。':(state.busy?'正在核算方案…':p?.feasible?rows.length?`建议${adding?'追加':'舍弃'} ${rows.length} 个地点，整组方案已通过试排。`:adding?'可以按当前行程生成。':'可以安排全部已选地点。':'请调整条件后重试。')}));
  const actions=el('div',{class:'negotiation-actions'});
  if(adding&&!state.error)actions.append(button('不追加，直接生成',()=>apply(true),{class:'negotiation-skip','data-negotiation-skip':'',disabled:state.busy||!p?.baseFeasible||state.dirty}));
  if(state.error){const remaining=Math.max(0,Math.ceil((state.retryAt-Date.now())/1000));actions.append(button(remaining?`${remaining} 秒后可重新核算`:'重新核算',()=>calculate(),{class:'btn primary','data-negotiation-retry':'',disabled:remaining>0}));}else actions.append(button(p?.feasible&&!rows.length?'生成行程':'应用方案',()=>apply(),{class:'btn primary','data-negotiation-apply':'','data-planning-action':'generate',disabled:state.busy||!p?.feasible||state.dirty}));content.push(actions);
  const retained=ids.filter(id=>adding||!p?.feasible||!p.ids.includes(id));
  const preview=el('aside',{class:'negotiation-retained','aria-label':'当前行程内景点'},[el('span',{class:'planning-eyebrow',text:'已选地点 · '+retained.length}),el('h2',{text:'当前行程内景点'}),el('p',{class:'negotiation-retained-note',text:state.busy?'正在核算，以下为上次方案中的保留地点。':state.error?'以下为上次方案预览，重新核算后确认。':adding?'这些是你已经选择的地点，右侧可选择顺路追加。':p?.feasible?'按当前取舍方案保留的地点，应用方案后生效。':'当前已选地点；尚未找到可应用的取舍方案。'})]);
  const retainedList=el('ol',{class:'negotiation-retained-list'});
  for(const id of retained){const poi=getPois().find(p=>p.poiId===id)||{};const fit=preferenceFit(poi,requirements);const reason=state.protected.includes(id)?'你已明确选择保留，本轮将优先确保安排。':fit.matched.length?`景点资料与你偏好的「${fit.matched.join('、')}」相关，保留此次体验。`:poi.type==='ip'?'你已选择的作品相关地点，保留本次主题体验。':poi.intro?`你已选择此地。${String(poi.intro).slice(0,65)}${String(poi.intro).length>65?'…':''}`:'你已选择的地点，当前方案保留此次游览安排。';retainedList.append(el('li',{'data-retained-poi':id},[el('strong',{text:name(id)}),el('p',{text:reason})]));}
  if(!retained.length)preview.append(el('p',{class:'negotiation-retained-note',text:'当前方案暂无普通景点保留，固定游客日程仍按原要求安排。'}));
  preview.append(retainedList);
  host.classList.toggle('is-calculating',state.busy);host.replaceChildren(preview,el('div',{class:'negotiation-main'},content));if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const n of host.querySelectorAll('[data-advice-poi]')){const previous=positions.get(n.dataset.advicePoi);if(previous!=null){const delta=previous-n.getBoundingClientRect().top;if(Math.abs(delta)>1)n.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:320,easing:'ease-out'});}}
 }
 host.tabIndex=-1;
 host.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onCancel();}if(e.key==='Tab'){const nodes=[...host.querySelectorAll('button:not(:disabled),input:not(:disabled)')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===host)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
 render();
 return {host,start:()=>calculate(),focus:()=>host.focus(),dispose(){closeTimeEditor();disposed=true;epoch++;ctrl?.abort();clearTimeout(timer);clearInterval(retryTimer);host.remove();previousFocus?.isConnected&&previousFocus.focus();},get state(){return state;}};
}
