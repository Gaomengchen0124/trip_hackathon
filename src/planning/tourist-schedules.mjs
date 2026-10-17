import {assert,validDate,clock,datesBetween} from './core.mjs'
export const isTourist=r=>r.key==='fixedEvent'&&r.value?.type==='tourist'&&!['superseded','unknown'].includes(r.state);
export function scheduleIssues(s,{dateRange,hours}={}){
 const issues=[];if(!s.title?.trim())issues.push('活动名称');if(!validDate(s.date))issues.push('日期');else if(dateRange&&(s.date<dateRange.startDate||s.date>dateRange.endDate))issues.push('行程范围内的日期');
 const validTime=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t||'');
 if(!validTime(s.startTime))issues.push('开始时间');if(!validTime(s.endTime))issues.push('结束时间');
 if(validTime(s.startTime)&&validTime(s.endTime)&&(s.startTime>=s.endTime||clock(s.startTime)-(s.arrivalMinutes||0)<0))issues.push('有效的活动时间与提前到场时间');
 if(!s.location||!Number.isFinite(s.location.lat)||!Number.isFinite(s.location.lng)||!s.location.name)issues.push('地图上的活动地点');
 if(hours&&validTime(s.startTime)&&validTime(s.endTime)&&!s.extendDay&&(clock(s.startTime)-(s.arrivalMinutes||0)<clock(hours.start)||s.endTime>hours.end))issues.push('允许调整当天时间，或修改活动时间');
 return issues;
}
export function normalizeSchedules(input,pois=[]){
 assert(Array.isArray(input)&&input.length<=10,'INVALID_TOURIST_SCHEDULE','游客日程最多10项');const seen=new Set();
 return input.map(raw=>{assert(raw&&typeof raw==='object'&&typeof raw.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(raw.id)&&!seen.has(raw.id),'INVALID_TOURIST_SCHEDULE','游客日程标识无效或重复');seen.add(raw.id);
 const s={id:raw.id,title:String(raw.title||'').trim().slice(0,120),date:raw.date||'',startTime:raw.startTime||'',endTime:raw.endTime||'',locationText:String(raw.locationText||'').slice(0,150),rawText:String(raw.rawText||'').slice(0,1500),arrivalMinutes:raw.arrivalMinutes??30,extendDay:raw.extendDay===true,fulfillsVisit:raw.fulfillsVisit!==false,location:null};
 assert(Number.isInteger(s.arrivalMinutes)&&s.arrivalMinutes>=0&&s.arrivalMinutes<=180,'INVALID_TOURIST_SCHEDULE','提前到场时间需为0至180分钟');
 for(const key of ['date','startTime','endTime'])assert(typeof s[key]==='string'&&s[key].length<=10,'INVALID_TOURIST_SCHEDULE','游客日程时间格式错误');
 const p=pois.find(p=>p.poiId===raw.location?.poiId);if(p)s.location={poiId:p.poiId,name:p.name,lat:p.lat,lng:p.lng,address:p.address||'',source:'catalogue'};
 else if(raw.location){const p=raw.location;assert(typeof p.name==='string'&&p.name.length>0&&p.name.length<=150&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=85&&Number.isFinite(p.lng)&&Math.abs(p.lng)<=180,'INVALID_TOURIST_SCHEDULE','游客日程地点坐标无效');s.location={poiId:'tourist-'+s.id,name:p.name,lat:p.lat,lng:p.lng,address:String(p.address||'').slice(0,250),source:'user_confirmed',provider:String(p.provider||p.source||'manual').slice(0,60)};}
 return s;});
}
export function scheduleValue(s){return {type:'tourist',scheduleId:s.id,title:s.title,date:s.date,startTime:s.startTime,endTime:s.endTime,poiId:s.location?.poiId||null,location:s.location?.name||s.locationText,locationPoint:s.location,arrivalMinutes:s.arrivalMinutes,extendDay:s.extendDay,fulfillsVisit:s.fulfillsVisit,rawText:s.rawText};}
export function schedulesFromRequirements(reqs=[]){return reqs.filter(isTourist).map(r=>({id:r.value.scheduleId||r.id,title:r.value.title||'游客日程',date:r.value.date,startTime:r.value.startTime,endTime:r.value.endTime,location:r.value.locationPoint,locationText:r.value.location,arrivalMinutes:r.value.arrivalMinutes??30,extendDay:r.value.extendDay===true,fulfillsVisit:r.value.fulfillsVisit!==false,rawText:r.value.rawText||''}));}
export function withTouristVenues(line,requirements=[]){const pois=[...line.pois];for(const r of requirements.filter(isTourist)){const p=r.value.locationPoint;if(p&&!pois.some(x=>x.poiId===p.poiId))pois.push({...p,isEventVenue:true,durationNormal:0,durationRush:0,openHours:''});}return {...line,pois};}
export function scheduleSummary(s){return `游客日程 · ${s.title||'待命名'} · ${s.date||'日期待补充'} ${s.startTime||'时间待补充'}${s.endTime?'–'+s.endTime:''} · ${s.location?.name||s.locationText||'地点待补充'}`;}
export function parseTouristSchedules(text,{context,pois=[],force=false}={}){
 if(!text?.trim())return [];const result=[];
 for(const raw of text.split(/[；;\n]/).map(x=>x.trim()).filter(Boolean)){
  if(/不(?:想|要|用|需要).*?(?:音乐剧|演出|特殊日程)|没有特殊日程/.test(raw))continue;
  const dateLike=/今天|明天|后天|周[一二三四五六日天]|\d{1,2}[月/.]\d{1,2}|\d{4}-\d{2}-\d{2}|(?:^|\D)\d{4}(?:\D|$)|\d{1,2}日/.test(raw),timed=/\d{1,2}[:：]\d{2}|\d{1,2}点|晚上|上午|下午|中午/.test(raw);
  if(!force&&!((dateLike||timed)&&/音乐剧|演唱会|话剧|演出|会议|聚餐|见面|集合|预约|签到|报到|到达|必须.*到|(?:在|到|去)(?!\d|早上|晚上|下午|上午|中午|凌晨|傍晚|[：:])[^\s，。；;]{2,}/.test(raw)))continue;
  const range=context?.dateRange,dates=range?datesBetween(range.startDate,range.endDate):[];let date='';
  const full=raw.match(/\d{4}-\d{2}-\d{2}/),md=raw.match(/(?:(\d{4})年)?(\d{1,2})[月/.]\s*(\d{1,2})日?/),compact=raw.match(/(?:^|\D)(0?[1-9]|1[0-2])([0-2]\d|3[01])(?=\D|$)/);
  if(full)date=full[0];else if(md||compact){const m=md?Number(md[2]):Number(compact[1]),d=md?Number(md[3]):Number(compact[2]);date=dates.find(x=>Number(x.slice(5,7))===m&&Number(x.slice(8,10))===d)||`${md?.[1]||range?.startDate?.slice(0,4)||new Date().getFullYear()}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}else {const d=raw.match(/(\d{1,2})日/);const found=d?dates.filter(x=>Number(x.slice(8,10))===Number(d[1])):[];if(found.length===1)date=found[0];}
  const times=[...raw.matchAll(/(\d{1,2})[:：](\d{2})|(\d{1,2})点(?:(\d{1,2})分?|半)?/g)].map(m=>{let h=Number(m[1]??m[3]);if(/晚上|下午/.test(raw)&&h<12)h+=12;return `${String(h).padStart(2,'0')}:${m[0].endsWith('半')?'30':String(Number(m[2]??m[4]??0)).padStart(2,'0')}`;});
  const known=[...pois].sort((a,b)=>b.name.length-a.name.length).find(p=>raw.includes(p.name));const venue=raw.match(/([\u4e00-\u9fffA-Za-z]{2,24}(?:大剧院|剧院|音乐厅|体育馆|会展中心|酒店|餐厅))/)?.[1]?.replace(/^(?:(?:我|想|需要|准备|必须|晚上|下午|上午|当天|去|在|到))+/,'')||'';
  const activity=raw.match(/音乐剧|演唱会|话剧|演出|会议|聚餐|见面|集合|预约|签到|报到/),title=activity?activity[0]+(raw.match(/《[^》]+》/)?.[0]||''):'游客日程';
  result.push({id:crypto.randomUUID(),title,date,startTime:times[0]||'',endTime:times[1]||'',arrivalMinutes:30,extendDay:false,fulfillsVisit:true,location:known?{poiId:known.poiId,name:known.name,lat:known.lat,lng:known.lng,source:'catalogue'}:null,locationText:known?.name||venue,rawText:raw});
 }
 return result;
}
