import { randomUUID } from 'node:crypto'
import { assert, clock, validDate } from './core.mjs'
const KEYS = ['interests','party','pace','mobility','rest','wake','departure','dayEnd','transport','shopping','meals','budget','queue','freeTime','poiDepth','mustVisit','exclude','fixedEvent','scheduleLock'];
const oneOf=(v,a)=>a.includes(v);
export function validateValue(key,v) {
  switch(key) {
    case 'interests': assert(v&&Array.isArray(v.tags)&&v.tags.length<=10&&v.tags.every(x=>typeof x==='string'&&x.length<=100),'INVALID_REQUIREMENT','体验偏好不正确');return;
    case 'wake': case 'departure': case 'dayEnd': clock(v); return;
    case 'pace': assert(oneOf(v,['more_places','balanced','fewer_deeper']),'INVALID_REQUIREMENT','无效节奏'); return;
    case 'transport': assert(v && oneOf(v.mode,['transit','taxi','walk','bike','mixed']),'INVALID_REQUIREMENT','无效交通方式'); return;
    case 'poiDepth': assert(v&&typeof v.poiId==='string'&&oneOf(v.depth,['deep','normal','quick']),'INVALID_REQUIREMENT','无效游览深度'); return;
    case 'mustVisit': case 'exclude': assert(Array.isArray(v)&&v.every(x=>typeof x==='string')&&v.length<=30,'INVALID_REQUIREMENT','无效点位列表'); return;
    case 'rest': assert(v&&(v.intervalMinutes!=null||v.durationMinutes!=null)&&(v.intervalMinutes==null||Number.isInteger(v.intervalMinutes)&&v.intervalMinutes>=20&&v.intervalMinutes<=300)&&(v.durationMinutes==null||Number.isInteger(v.durationMinutes)&&v.durationMinutes>=5&&v.durationMinutes<=120),'INVALID_REQUIREMENT','无效休息参数'); return;
    case 'mobility': assert(v&&['dailyStepsMin','dailyStepsMax'].every(k=>v[k]==null||Number.isInteger(v[k])&&v[k]>=0&&v[k]<=100000)&&['lessWalking','slowerWalking','frequentBreaks'].every(k=>v[k]===undefined||typeof v[k]==='boolean')&&(v.walkingLevel==null||oneOf(v.walkingLevel,['low','moderate','high']))&&['maxLegWalkMinutes','maxDailyWalkMinutes'].every(k=>v[k]==null||Number.isInteger(v[k])&&v[k]>0&&v[k]<=720),'INVALID_REQUIREMENT','无效步行偏好'); return;
    case 'fixedEvent':
      assert(v&&typeof v.type==='string'&&(v.date==null||validDate(v.date))&&(v.startTime==null||typeof v.startTime==='string')&&(v.endTime==null||typeof v.endTime==='string'),'INVALID_REQUIREMENT','固定活动格式不正确');
      if(v.startTime)clock(v.startTime); if(v.endTime)clock(v.endTime);
      if(v.startTime&&v.endTime)assert(clock(v.endTime)>clock(v.startTime),'INVALID_REQUIREMENT','固定活动结束时间须晚于开始时间');
      for(const k of ['poiId','location','bookingState','period'])assert(v[k]==null||typeof v[k]==='string'&&v[k].length<=200,'INVALID_REQUIREMENT','活动信息不正确');
      return;
    case 'scheduleLock': assert(v&&Array.isArray(v.lockedDates)&&v.lockedDates.every(validDate)&&Array.isArray(v.lockedItemIds)&&v.lockedItemIds.every(x=>typeof x==='string')&&Number.isInteger(v.baselineVersion),'INVALID_REQUIREMENT','无效锁定'); return;
    case 'party': assert(v&&typeof v==='object'&&(v.count==null||Number.isInteger(v.count)&&v.count>0&&v.count<=50)&&(!v.companions||Array.isArray(v.companions)&&v.companions.every(x=>oneOf(x,['solo','friends','couple','children','elders','other'])))&&(!v.ageBands||Array.isArray(v.ageBands)&&v.ageBands.every(x=>oneOf(x,['0_2','3_6','7_12','13_plus','unspecified']))),'INVALID_REQUIREMENT','同行人数不正确');return;
    case 'shopping': assert(oneOf(v,['none','on_the_way','dedicated','unsure']),'INVALID_REQUIREMENT','购物偏好不正确'); return;
    case 'queue': assert(oneOf(v,['avoid','selected_highlights','accept','unsure']),'INVALID_REQUIREMENT','排队偏好不正确');return;
    case 'freeTime': assert(oneOf(v,['structured','some_free','flexible']),'INVALID_REQUIREMENT','留白偏好不正确');return;
    case 'meals':
      assert(v&&typeof v==='object'&&JSON.stringify(v).length<1000&&(v.preference==null||oneOf(v.preference,['simple','local','dedicated']))&&(v.durationMinutes==null||Number.isInteger(v.durationMinutes)&&v.durationMinutes>=15&&v.durationMinutes<=120),'INVALID_REQUIREMENT','餐饮偏好不正确');
      if(v.lunchStart)clock(v.lunchStart);if(v.lunchEnd)clock(v.lunchEnd);
      if(v.lunchStart&&v.lunchEnd)assert(clock(v.lunchStart)<=clock(v.lunchEnd),'INVALID_REQUIREMENT','午餐开始时间窗不能倒序');return;
    case 'budget': assert(v&&typeof v==='object'&&(v.amountMinor==null||Number.isInteger(v.amountMinor)&&v.amountMinor>=0)&&(v.currency==null||typeof v.currency==='string'&&/^[A-Z]{3}$/.test(v.currency)),'INVALID_REQUIREMENT','预算不正确');return;
    default: assert(false,'INVALID_REQUIREMENT','未知需求维度')
  }
}
export function mergeProposals(existing, proposals, { text='', messageId, poiIds=[], dates=[] }={}) {
  assert(Array.isArray(proposals)&&proposals.length<=64,'MODEL_PROTOCOL','需求结构格式错误',502);
  const result=structuredClone(existing);
  for(let p of proposals) {
    assert(p&&typeof p==='object'&&!Array.isArray(p),'MODEL_PROTOCOL','模型需求必须为对象',502);
    assert(KEYS.includes(p.key)&&['hard','soft'].includes(p.strength)&&['trip','day','poi','event'].includes(p.scope?.type),'MODEL_PROTOCOL','模型需求字段错误',502);
    assert(typeof p.evidence?.quote==='string'&&p.evidence.quote.length>0&&text.includes(p.evidence.quote),'UNSUPPORTED_EVIDENCE','模型需求缺少用户原文依据',502);
    validateValue(p.key,p.value);
    if(p.scope.type==='day')assert(dates.includes(p.scope.targetId),'INVALID_SCOPE','需求日期不在旅行范围内');
    if(p.key==='fixedEvent'&&p.value.date&&dates.length)assert(dates.includes(p.value.date),'INVALID_SCOPE','固定活动日期不在旅行范围内');
    if(p.scope.type==='poi')assert(poiIds.includes(p.scope.targetId),'UNKNOWN_POI','需求点位未确认');
    const ids=['mustVisit','exclude'].includes(p.key)?p.value:p.key==='poiDepth'?[p.value.poiId]:p.key==='fixedEvent'&&p.value.poiId?[p.value.poiId]:[];
    assert(ids.every(id=>poiIds.includes(id)),'UNKNOWN_POI','需求引用未知点位');
    assert(p.key!=='scheduleLock','UNSUPPORTED_REQUIREMENT','请在生成行程后使用锁定日期功能');
    const same=result.filter(r=>r.key===p.key&&r.scope.type===p.scope.type&&r.scope.targetId===p.scope.targetId&&r.state!=='superseded'&&(p.key!=='poiDepth'||r.value.poiId===p.value.poiId)&&(!['fixedEvent','mustVisit','exclude'].includes(p.key)||r.id===p.replacesId));
    for(const old of same) {
      if(old.strength==='hard' && JSON.stringify(old.value)!==JSON.stringify(p.value)&&!['mustVisit','exclude'].includes(p.key)) {
        assert(typeof p.replacesId==='string'&&p.replacesId===old.id,'CONFLICTING_REQUIREMENTS','新需求与已有硬约束冲突，请明确替换');
      }
      old.state='superseded';
    }
    result.push({id:randomUUID(),key:p.key,value:p.value,strength:p.strength,scope:p.scope,source:'user_text',evidence:{messageId,answerId:null,quote:p.evidence.quote,factId:null},state:'confirmed'});
  }
  assert(result.length<=200,'TOO_MANY_REQUIREMENTS','需求过多，请新建规划');
  return result
}
