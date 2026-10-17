import {ticketPolicy} from './ticket-policy.mjs';
const node=(tag,attrs={},children=[])=>{const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(v==null)continue;if(k==='text')n.textContent=v;else if(k==='disabled')n.disabled=v;else n.setAttribute(k,v)}n.append(...children);return n};
const button=(text,action,disabled=false)=>{const n=node('button',{type:'button',class:'btn sm',text,disabled});n.addEventListener('click',action);return n};
function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['ctrip.com','trip.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h))?u.href:null}catch{return null}}
function link(text,url){return node('a',{text,href:url,target:'_blank',rel:'noopener noreferrer',class:'btn sm'})}
export function createTicketButton(poi,{busy=false,loading=false,onQuery}={}){
  const policy=ticketPolicy(poi),n=button(loading?'查询中…':policy.label,onQuery,!policy.queryEnabled||busy);
  n.className='itinerary-ticket-action ticket-query-circle';
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4V5Zm11 0v3m0 3v2m0 3v3');icon.append(path);n.replaceChildren(icon);
  if(loading)n.classList.add('is-loading');n.setAttribute('aria-label',`${poi?.name||'景点'}：${loading?'查询中':policy.label}`);
  n.title=policy.category==='reservation'?'需预约，预约入口待核实':policy.category==='free'?'本地资料标为免费，开放政策请以景点公告为准':policy.category==='mixed'?`部分区域或项目收费：${policy.reference}`:'查询携程票种；日期及价格以携程页面为准';
  return n;
}
export function createTicketPanel(q,{onRetry,onClose,busy=false}={}){
  const panel=node('section',{class:'revision-services ticket-panel','aria-label':'携程门票查询','aria-live':'polite'});
  panel.append(node('h3',{text:`${q.poiName||'景点'} · 门票信息`}));
  if(q.loading)panel.append(node('p',{role:'status',text:'正在查询携程门票…'}));
  else if(q.error){panel.append(node('p',{role:'alert',class:'planning-error',text:q.error}));if(onRetry)panel.append(button('重试查询',onRetry,busy))}
  else {
    panel.append(node('p',{class:'sub',text:q.notice||'具体日期、票种与最终价格以携程页面为准。'}));
    if(q.policy?.reference)panel.append(node('p',{class:'sub',text:`本地参考：${q.policy.reference}（政策待核实）`}));
    if(q.policy?.scopeNote)panel.append(node('p',{class:'sub',text:q.policy.scopeNote}));
    const items=q.items||[];
    if(!items.length){panel.append(node('p',{text:q.policy&&!q.policy.queryEnabled?'本地资料标为免费或需预约，预约入口与开放政策待核实。':'未查到匹配门票，不能据此判断景点免费。'}));if(onRetry&&q.policy?.queryEnabled!==false)panel.append(button('重新查询',onRetry,busy))}
    for(const item of items){
      const matched=item.matchStatus==='matched',card=node('div',{class:'revision-service-card'},[node('b',{text:item.name}),node('p',{text:item.address||''})]);
      card.append(node('p',{class:'sub',text:matched?'景点已匹配':'景点名称或城市待确认，暂不提供跳转'}));
      card.append(node('small',{text:item.price!=null&&item.currency?`${item.currency} ${item.price} 起`:'价格以携程页面为准'}));
      if(item.openDescription)card.append(node('p',{class:'sub',text:`开放时间参考：${item.openDescription}`}));
      if(item.latestEntry)card.append(node('p',{class:'sub',text:`最晚入园参考：${item.latestEntry}`}));
      const detail=matched&&safeLink(item.url);if(detail)card.append(link('去携程查看详情',detail));
      for(const resource of item.resources||[]){
        const row=node('div',{class:'ticket-resource'},[node('strong',{text:resource.name})]);
        row.append(node('p',{class:'sub',text:resource.price!=null&&item.currency?`${item.currency} ${resource.price}`:'票价以携程页面为准'}));
        const url=matched&&item.available===true&&resource.isBooking===true&&resource.canBook===true&&safeLink(resource.url);
        if(url)row.append(link('去携程购买',url));
        else row.append(button('暂不可购买',()=>{},true),node('small',{text:resource.disabledReason||'可订状态或购买链接尚未确认'}));
        card.append(row);
      }
      if(!item.resources?.length)card.append(node('p',{class:'sub',text:'暂无已确认可订票种，可查看景点详情。'}));
      panel.append(card);
    }
  }
  if(onClose)panel.append(button('收起门票信息',onClose));
  return panel;
}
