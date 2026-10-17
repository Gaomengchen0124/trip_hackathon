import {normalizeSchedules,scheduleIssues} from './tourist-schedules.mjs'
const el=(tag,attrs={},children=[])=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(v==null||v===false)continue;if(k==='text')n.textContent=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v)}for(const c of children.flat())if(c)n.append(c);return n;};
const btn=(text,onclick,attrs={})=>el('button',{type:'button',text,onclick,...attrs});
export function openTouristScheduleEditor({draft,context,pois,hours,onSave,onCancel,onDelete}){
 let chosen=draft.location?{...draft.location}:null,controller,map,marker,closed=false,searchEpoch=0;const previous=document.activeElement;
 const overlay=el('div',{class:'negotiation-time-editor tourist-schedule-overlay'}),form=el('form',{class:'negotiation-time-dialog tourist-schedule-dialog',role:'dialog','aria-modal':'true','aria-label':'补充游客日程'}),fields=el('div',{class:'negotiation-time-settings'}),inputs={};
 form.append(el('h2',{text:'游客日程'}),el('p',{class:'negotiation-subtitle',text:'固定活动会锁定日期和时间，提前安排到场交通，并写入最终行程。'}));
 for(const[key,label,type,value]of [['title','活动名称','text',draft.title],['date','活动日期','date',draft.date],['startTime','活动开始时间','time',draft.startTime],['endTime','活动结束时间','time',draft.endTime],['arrivalMinutes','提前到场（分钟）','number',draft.arrivalMinutes??30]]){
 const input=el('input',{type,value:value??'','aria-label':label,required:true,...(key==='arrivalMinutes'?{min:0,max:180,step:1}:{})});inputs[key]=input;fields.append(el('label',{},[el('span',{text:label}),input]));}
 if(draft.rawText)form.append(el('p',{class:'tourist-original-request',text:'已记录你的要求：'+draft.rawText}));
 const place=el('input',{type:'text',value:chosen?.name||draft.locationText||'','aria-label':'活动地点',placeholder:'场馆、餐厅或其他活动地点',maxlength:150,required:true});inputs.place=place;
 const options=el('div',{class:'tourist-place-options'}),placeStatus=el('p',{class:'negotiation-status',role:'status'}),selected=el('p',{class:'tourist-place-selected',text:chosen?'已定位：'+chosen.name:''});
 function choose(p){chosen={poiId:p.poiId||'tourist-'+draft.id,name:p.name,lat:p.lat,lng:p.lng,address:p.address||'',source:p.source||'user_confirmed'};place.value=p.name;selected.textContent='已定位：'+p.name+(p.address?' · '+p.address:'');options.replaceChildren();placeStatus.textContent='';}
 function localResults(){const q=place.value.trim();options.replaceChildren();for(const p of pois.filter(p=>q&&p.name?.includes(q)).slice(0,6))options.append(btn(p.name,()=>choose(p),{class:'conversation-choice'}));}
 place.addEventListener('input',()=>{chosen=null;selected.textContent='';searchEpoch++;controller?.abort();localResults();});
 const search=btn('搜索地点',async()=>{const q=place.value.trim();if(!q){placeStatus.textContent='请先填写活动地点。';return;}const local=pois.filter(p=>p.name===q);if(local.length===1){choose(local[0]);return;}controller?.abort();controller=new AbortController();const ticket=++searchEpoch;search.disabled=true;placeStatus.textContent='正在查找地点…';
 try{const response=await fetch('/api/places?'+new URLSearchParams({lineId:context.lineId,q}),{credentials:'same-origin',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});const data=await response.json();if(!response.ok)throw Error(data.error||'地点搜索暂不可用');if(closed||ticket!==searchEpoch)return;const results=(data.results||data.data?.results||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.name);
 options.replaceChildren();for(const p of results)options.append(btn(p.name+(p.address?' · '+p.address:''),()=>choose(p),{class:'conversation-choice tourist-place-result'}));placeStatus.textContent=results.length?'请选择正确的场馆或地址。':'没有找到该地点，请换用完整场馆名或地址搜索。';
 }catch(e){if(!closed&&ticket===searchEpoch)placeStatus.textContent=e.name==='TimeoutError'?'地点搜索超时，可以重试。':e.message||'搜索失败，请重试。';}finally{if(!closed)search.disabled=false;}
 },{class:'btn'});
 const mapHost=el('div',{class:'tourist-location-map',hidden:true});
 const pickMap=btn('在地图上选点',async()=>{
  if(map){mapHost.hidden=!mapHost.hidden;if(!mapHost.hidden)map.invalidateSize();return;}
  pickMap.disabled=true;
  try{const module=await import('leaflet'),L=module.default||module;if(closed)return;
   mapHost.hidden=false;map=L.map(mapHost,{scrollWheelZoom:false}).setView([chosen?.lat??pois[0]?.lat??31.23,chosen?.lng??pois[0]?.lng??121.47],13);
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);
   map.on('click',e=>{const {lat,lng}=e.latlng;if(marker)marker.setLatLng([lat,lng]);else marker=L.circleMarker([lat,lng],{radius:8,color:'#7b8865'}).addTo(map);choose({name:place.value.trim()||'活动地点',lat,lng,address:'用户在地图选择的位置',source:'user_selected'});});
   placeStatus.textContent='点击活动场馆的位置完成定位。';
  }catch{placeStatus.textContent='地图暂不可用，请通过完整场馆名或地址搜索定位。';}finally{pickMap.disabled=false;}
 },{class:'btn'});
 const placeBox=el('div',{class:'tourist-place-picker'},[el('label',{},[el('span',{text:'活动地点'}),place]),search,pickMap,mapHost,options,placeStatus,selected]);
 const extend=el('input',{type:'checkbox','aria-label':'允许当天按游客日程调整出门和结束时间'});extend.checked=draft.extendDay===true;
 const fulfills=el('input',{type:'checkbox','aria-label':'活动同时算作到访此地点'});fulfills.checked=draft.fulfillsVisit!==false;
 form.append(fields,placeBox,el('label',{class:'tourist-schedule-check'},[extend,el('span',{text:`允许当天按此日程调整出门和结束时间（平日 ${hours.start}—${hours.end}）`})]),el('label',{class:'tourist-schedule-check'},[fulfills,el('span',{text:'活动同时算作到访此地点，不重复安排普通参观'})]));
 const error=el('p',{class:'planning-error',role:'alert'}),actions=el('div',{class:'negotiation-actions'},[...(onDelete?[btn('删除此日程',()=>{close();onDelete();},{class:'negotiation-skip'})]:[]),btn('暂时关闭',()=>{close();onCancel?.();},{class:'negotiation-skip'}),el('button',{type:'submit',class:'btn primary',text:'保存游客日程'})]);form.append(error,actions);
 function close(){if(closed)return;closed=true;controller?.abort();map?.remove();overlay.remove();for(const [node,value]of inertNodes)node.inert=value;previous?.isConnected&&previous.focus();}
 form.addEventListener('submit',e=>{e.preventDefault();try{if(!chosen){const matches=pois.filter(p=>p.name===place.value.trim());if(matches.length===1)choose(matches[0]);}const s=normalizeSchedules([{...draft,...Object.fromEntries(Object.entries(inputs).filter(([k])=>k!=='place').map(([k,n])=>[k,k==='arrivalMinutes'?Number(n.value):n.value])),locationText:place.value.trim(),location:chosen,extendDay:extend.checked,fulfillsVisit:fulfills.checked}],pois)[0];const issues=scheduleIssues(s,{dateRange:context.dateRange,hours});if(issues.length){error.textContent='请补充或调整：'+issues.join('、');return;}close();onSave(s);}catch(e){error.textContent=e.message;}});
 overlay.append(form);const inertNodes=[...document.body.children].map(node=>[node,node.inert]);for(const [node]of inertNodes)node.inert=true;document.body.append(overlay);(inputs.title.value?inputs.startTime:inputs.title).focus();
 overlay.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();onCancel?.();}if(e.key==='Tab'){const nodes=[...form.querySelectorAll('button:not(:disabled),input')];if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}}});localResults();return {close};
}
