import {displayTimeRange,readableRequirement} from './client.mjs'
const LABELS={travel:'交通接驳',meal:'用餐',rest:'休息一下',wait:'等候与自由时间',buffer:'预留机动时间',fixed_event:'固定安排',free:'自由活动'};
const MODES={transit:'公共交通',taxi:'打车',walk:'步行',bike:'骑行',mixed:'混合交通'};
const UNKNOWN={UNKNOWN_ORIGIN:'出发地点尚未确认，首站接驳待补充',UNKNOWN_DESTINATION:'返回地点尚未确认，返程接驳待补充',OPENING_UNCONFIRMED:'部分景点开放时间尚未核验',FIXED_EVENT_UNCONFIRMED:'固定安排的时间或接驳待确认，相关时段已留空',FIXED_EVENT_DATE_UNKNOWN:'固定安排的日期待确认',UNKNOWN_DURATION:'所选深度的游览时长缺少数据',BOOKING_UNCONFIRMED:'体验活动尚未确认预约',EVENT_OPENING_UNCONFIRMED:'活动场地开放时间待确认',UNSCHEDULED_PENDING_FACT:'部分景点因固定安排未确认而暂未排入',UNSUPPORTED_HARD_CONSTRAINT:'部分明确要求尚缺可验证的数据'};
export function renderPlanningResult({itinerary,container,h,pois,photoEl,onPoi,onEdit,onHome,onModify}) {
  const name=id=>pois.find(p=>p.poiId===id)?.name||id||'出发 / 返回地点';
  const wrapper=h('div',{class:'planning-result'});
  const prefs=h('div',{class:'panel'},[h('p',{class:'planning-keywords-label',text:'你的旅行keywords'})]);
  for(const original of itinerary.requirements.filter(r=>!['superseded','unknown'].includes(r.state))){const r=original.key==='exclude'?{...original,value:original.value.filter(id=>!itinerary.context.selectedPoiIds.includes(id))}:original;if(r.key==='exclude'&&!r.value.length)continue;prefs.append(h('span',{class:'chip',text:readableRequirement(r,name)}));}
  if(!itinerary.requirements.length)prefs.append(h('p',{class:'sub',text:'你跳过了偏好选择，当前使用可调整的标准安排。'}));
  wrapper.append(prefs);
  if(itinerary.optimizationNotice)wrapper.append(h('p',{class:'conversation-notice',role:'status',text:itinerary.optimizationNotice}));
  if(itinerary.completeness==='partial')wrapper.append(h('p',{class:'conversation-notice',role:'status',text:'已展示可安排的行程 · 仍有景点待安排'}));
  if(itinerary.pendingPoiIds?.length)wrapper.append(h('section',{class:'panel'},[h('h2',{text:'待安排 · 仍保留在已选清单'}),h('p',{class:'sub',text:'这些景点没有被删除。可以增加时间、调整游览深度，或在修改中继续安排。'}),...itinerary.pendingPoiIds.map(id=>h('span',{class:'chip',text:name(id)}))]));
  const row=(item)=>{
    const p=pois.find(p=>p.poiId===item.poiId);const visit=item.type==='visit';
    const title=visit?p?.name||'景点':item.type==='meal'?(item.label||'用餐')+' · 附近用餐，餐厅待定':item.type==='travel'?`${MODES[item.transportMode]||'交通'} · ${name(item.fromId)} → ${name(item.toId)}`:LABELS[item.type]||'安排';
    const sub=visit?({deep:'深度体验',normal:'正常游览',quick:'快速打卡'}[item.depth]||'游览'):'';
    const node=h(visit?'button':'div',{class:`stop ${visit?'':'nonvisit'} ${item.type}`,type:visit?'button':null,'aria-label':visit?'查看'+title+'详情':null,onclick:visit?()=>onPoi(item.poiId):null},[
      ...(!visit?[h('div',{class:'time'},[h('b',{text:displayTimeRange(item).replace(/^约 /,'')})])]:[]),
      visit&&p?photoEl(p):null,
      h('div',{class:'txt'},[h('b',{text:title}),...(sub?[h('small',{text:sub})]:[])])
    ]);return visit?h('article',{class:'itinerary-visit'},[h('div',{class:'time'},[h('b',{text:displayTimeRange(item).replace(/^约 /,'')})]),node,h('div',{class:'itinerary-stop-controls','data-poi-controls':item.poiId})]):node
  };
  for(const [index,day]of itinerary.days.entries()){
    const node=h('section',{class:'day'},[h('header',{},[h('b',{text:`第${index+1}天 · ${day.date}`}),h('span',{'data-day-controls':day.date,class:'itinerary-day-controls'})])]);
    if(!day.items.length){const reserved=(itinerary.unresolved||[]).some(u=>u.date===day.date&&u.code==='FIXED_EVENT_UNCONFIRMED');node.append(h('p',{class:'empty',text:reserved?'当天暂未安排观光。请先确认固定活动或返程信息。':'当天没有安排景点，可以自由活动，或返回补充想去的地方。'}))}
    for(const i of day.items.filter(i=>!['buffer','rest'].includes(i.type)&&!(i.type==='wait'&&i.durationMinutes<10)))node.append(row(i));
    const hidden=day.items.filter(i=>['buffer','rest'].includes(i.type)||i.type==='wait'&&i.durationMinutes<10);
    if(hidden.length){const details=h('details',{},[h('summary',{text:'机动时间 · 查看'})]);for(const i of hidden)details.append(row(i));node.append(details)}
    wrapper.append(node)
  }
  wrapper.append(h('p',{class:'itinerary-generation-note',text:`${itinerary.engineMode==='ai'?'本行程由大模型与圣地巡礼算法合作优化生成':'本行程由圣地巡礼算法生成'}；时间仅供参考，开放与预约以官方信息为准。`}));
  container.replaceChildren(wrapper)
}
