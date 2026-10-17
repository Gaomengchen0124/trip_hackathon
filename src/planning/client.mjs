export function createPlanningAPI({fetchImpl=fetch}={}) {
  return async(path,body,{signal,idempotencyKey=crypto.randomUUID()}={})=>{
    const response=await fetchImpl(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify({...body,idempotencyKey}):undefined,signal});
    let envelope;try{envelope=await response.json()}catch{throw new Error('当前地址没有可用的规划后端，请使用 scripts/start-preview.sh 启动后重试。')}
    if(!response.ok){const e=new Error(envelope.error?.message||'规划请求失败，请重试');e.code=envelope.error?.code;if(response.status===429)e.retryAfterSeconds=Math.max(1,Number(envelope.error?.retryAfterSeconds||response.headers?.get?.('Retry-After'))||60);throw e}
    if(envelope.schemaVersion!=='planning.v1')throw new Error('规划接口版本不匹配，请重启服务');return envelope.data
  }
}
export async function waitForPlanningJob(api,job,{signal,onPhase=()=>{},delayMs=800,maxWaitMs=90000}={}) {
  const started=Date.now(),jobId=job.id;
  const cancel=()=>{if(job.cancellable&&['queued','running'].includes(job.state))api('/api/planning/jobs/'+encodeURIComponent(jobId)+'/cancel',{}).catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  try{
    if(signal?.aborted){cancel();signal.throwIfAborted();}
    while(['queued','running'].includes(job.state)) {
      signal?.throwIfAborted();if(Date.now()-started>maxWaitMs){cancel();throw new Error('等待超时，已保留输入；可以稍后重试。');}onPhase(job.phase,job);
      const pollDelay=job.state==='queued'?Math.max(800,delayMs):Math.max(300,delayMs);
      await new Promise((resolve,reject)=>{const done=()=>{signal?.removeEventListener('abort',abort);resolve()};const timer=setTimeout(done,pollDelay);const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason)};signal?.addEventListener('abort',abort,{once:true})});
      job=await api('/api/planning/jobs/'+encodeURIComponent(job.id),undefined,{signal})
    }
    if(job.state!=='succeeded'){const e=new Error(job.error?.message||'规划未完成，请重试');e.code=job.error?.code;throw e}
    return job.result;
  }finally{signal?.removeEventListener('abort',cancel);}
}

export function insertKeyword(text,keyword) {
  if(text.split(/[\n；;]/).some(s=>s.trim()===keyword.trim()))return text;
  return text.trim()?text.replace(/\s+$/,'')+'；'+keyword:keyword
}
export function approximateDuration(minutes) {
  if(!Number.isFinite(minutes))return '待确认';const n=Math.ceil(minutes/5)*5;
  return n>=60?`${Math.floor(n/60)}小时${n%60?`${n%60}分钟`:''}`:`${n}分钟`
}
export function displayTimeRange(item) {
  const exact=['fixed_event','event_checkin'].includes(item.type);
  const format=s=>{const t=s.length>5?s.slice(11,16):s;if(exact||item.preserveClock)return t;const minute=Number(t.slice(0,2))*60+Number(t.slice(3));const rounded=Math.round(minute/5)*5;return `${String(Math.floor(rounded/60)).padStart(2,'0')}:${String(rounded%60).padStart(2,'0')}`};
  return `${exact?'':'约 '}${format(item.startAt||item.arrive)}–${format(item.endAt||item.leave)}`
}
export function readableRequirement(r,poiName=id=>id) {
  const v=r.value;
  const map={pace:{more_places:'尽量多逛',balanced:'节奏适中',fewer_deeper:'少量慢游'},shopping:{none:'不专门购物',on_the_way:'顺路购物',dedicated:'留购物时间'},queue:{avoid:'尽量避开排队',selected_highlights:'喜欢的地点可以等',accept:'能接受排队'},freeTime:{structured:'安排充分',some_free:'留一段空白',flexible:'保留较多自由时间'}};
  if(map[r.key]?.[v])return map[r.key][v];
  if(r.key==='interests')return v.tags.join('、');
  if(r.key==='wake')return `通常${v}起床`;if(r.key==='departure')return `${v}开始游览`;if(r.key==='dayEnd')return `${v}前结束`;
  if(r.key==='party')return `${v.count?`${v.count}人 · `:''}${(v.companions||[]).map(x=>({solo:'独自',friends:'朋友',couple:'情侣',children:'亲子',elders:'带长辈',other:'同行'}[x]||x)).join('、')||'同行信息已记录'}`;
  if(r.key==='transport')return ({transit:'公共交通',taxi:'打车',walk:'步行',bike:'骑行',mixed:'混合交通'}[v.mode]||v.mode)+(r.strength==='hard'?'限定':'优先');
  if(r.key==='mobility')return [v.dailyStepsMax!=null&&`每日最多${v.dailyStepsMax}步（待核验）`,v.walkingLevel&&({low:'少走一点',moderate:'步行适中',high:'愿意多走'}[v.walkingLevel]),v.lessWalking&&v.walkingLevel!=='low'&&'尽量少走',v.slowerWalking&&'慢慢走',v.frequentBreaks&&'多休息',v.maxLegWalkMinutes&&`单段交通步行≤${v.maxLegWalkMinutes}分钟`,v.maxDailyWalkMinutes&&`每日交通步行≤${v.maxDailyWalkMinutes}分钟`].filter(Boolean).join(' · ');
  if(r.key==='rest')return `每${v.intervalMinutes||'适当间隔'}分钟休息${v.durationMinutes||'一会儿'}`;
  if(r.key==='meals')return `用餐${v.durationMinutes||({simple:30,local:45,dedicated:60}[v.preference]||45)}分钟${v.lunchStart||v.lunchEnd?` · 午餐${v.lunchStart||'11:30'}–${v.lunchEnd||'13:30'}间开始`:''}`;
  if(r.key==='poiDepth')return `${poiName(v.poiId)} · ${ {deep:'深度体验',normal:'正常游览',quick:'快速打卡'}[v.depth]}`;
  if(['mustVisit','exclude'].includes(r.key))return `${r.key==='mustVisit'?'必去':'不去'}：${v.map(poiName).join('、')}`;
  if(r.key==='fixedEvent'&&v.type==='tourist')return `游客日程：${v.title} · ${v.date||'日期待补充'} ${v.startTime||'时间待补充'}${v.endTime?'–'+v.endTime:''} · ${v.location||'地点待补充'}${v.arrivalMinutes?' · 提前'+v.arrivalMinutes+'分钟到场':''}`;
  if(r.key==='fixedEvent')return `${v.date||'日期待确认'} · ${v.type==='flight'?'航班':v.type==='activity'?'活动':'固定安排'}${v.startTime?' '+v.startTime:''}`;
  if(r.key==='budget')return v.amountMinor!=null?`预算${v.amountMinor/(v.currency==='JPY'?1:100)} ${v.currency||'币种待确认'}`:'预算偏好已记录';
  return '其他偏好已记录'
}
