export class PlanningError extends Error {
  constructor(code, message, status = 422, retryable = false) { super(message); Object.assign(this, { code, status, retryable }) }
}
export function assert(ok, code, message, status = 422) { if (!ok) throw new PlanningError(code, message, status) }
export function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s }
export function clock(s) { assert(typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s), 'INVALID_TIME', '时间须为 HH:mm'); return Number(s.slice(0,2))*60+Number(s.slice(3)) }
export function datesBetween(start, end) {
  assert(validDate(start) && validDate(end), 'NEEDS_CORE_CONTEXT', '请提供有效出行日期');
  const count = (Date.parse(end)-Date.parse(start))/86400000;
  assert(count >= 0 && count < 14, 'INVALID_DATES', '行程日期范围须为1至14天');
  return Array.from({ length: count+1 }, (_, i) => new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10))
}
function localParts(ms, tz) {
  const o = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' }).formatToParts(ms).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}:${o.second}`
}
export function timestamp(date, minutes, tz) {
  assert(validDate(date) && Number.isInteger(minutes) && minutes>=0 && minutes<1440, 'INVALID_TIME', '无效日内时间');
  const local = `${date}T${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}:00`;
  let ms=Date.parse(local+'Z');
  for(let i=0;i<4;i++) ms += Date.parse(local+'Z')-Date.parse(localParts(ms,tz)+'Z');
  assert(localParts(ms,tz)===local,'INVALID_LOCAL_TIME','该时间在目的地时区不存在');
  const off=(Date.parse(local+'Z')-ms)/60000;
  return local+`${off<0?'-':'+'}${String(Math.floor(Math.abs(off)/60)).padStart(2,'0')}:${String(Math.abs(off)%60).padStart(2,'0')}`
}
export const minutesBetween=(a,b)=>(Date.parse(b)-Date.parse(a))/60000;
export function validateContext(c, pois) {
  assert(c && /^[a-z0-9-]{1,80}$/.test(c.lineId),'INVALID_CONTEXT','线路不正确');
  assert(Array.isArray(c.selectedPoiIds) && c.selectedPoiIds.length<=30 && new Set(c.selectedPoiIds).size===c.selectedPoiIds.length,'INVALID_SELECTION','点位须去重且不超过30个');
  if(pois) assert(c.selectedPoiIds.every(id=>pois.some(p=>p.poiId===id)),'UNKNOWN_POI','点位不属于当前线路');
  assert(typeof c.timeZone==='string','INVALID_TIMEZONE','需要目的地时区');
  try { new Intl.DateTimeFormat('en',{timeZone:c.timeZone}) } catch { throw new PlanningError('INVALID_TIMEZONE','目的地时区不正确') }
  if(c.dateRange) datesBetween(c.dateRange.startDate,c.dateRange.endDate);
  for(const key of ['origin','destination']) if(c[key]!=null) assert(typeof c[key].id==='string' && Number.isFinite(c[key].lat) && Math.abs(c[key].lat)<=90 && Number.isFinite(c[key].lng) && Math.abs(c[key].lng)<=180,'INVALID_LOCATION','出发/返回地点坐标不正确');
  return c
}
export const active = r => r.state !== 'superseded' && r.state !== 'unknown';
export function applicable(r,date,poiId) { return active(r) && (r.scope.type==='trip' || r.scope.type==='day'&&r.scope.targetId===date || r.scope.type==='poi'&&r.scope.targetId===poiId || r.scope.type==='event') }
export function pick(reqs,key,date,poiId) { return reqs.filter(r=>r.key===key&&applicable(r,date,poiId)).at(-1)?.value }
