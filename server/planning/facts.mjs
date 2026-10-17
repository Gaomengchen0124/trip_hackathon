import { ticketPolicy } from '../../src/planning/ticket-policy.mjs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { haversineKm } from '../../src/planner.mjs'
import { assert, clock } from '../../src/planning/core.mjs'
export async function loadLine(lineId) {
  assert(/^[a-z0-9-]{1,80}$/.test(lineId),'UNKNOWN_LINE','无效线路');
  try { const d=JSON.parse(await readFile(new URL(`../../data/lines/${lineId}.json`,import.meta.url),'utf8')); return {...d,timeZone:d.line.timeZone||(lineId.endsWith('-london')?'Europe/London':lineId.endsWith('-japan')?'Asia/Tokyo':'Asia/Shanghai'),pois:[...(d.ipStops||[]),...(d.cityStops||[])].map(p=>({...p,ticketPolicy:ticketPolicy(p)}))} }
  catch { assert(false,'UNKNOWN_LINE','线路不存在',404) }
}
export function openingFor(p,date) {
  if(p.openingByDate?.[date])return {...p.openingByDate[date],certainty:p.openingVerified?'observed':'unknown'};
  const text=p.openHours||'';
  const day=new Date(date+'T12:00:00Z').getUTCDay();
  const closed=/周([一二三四五六日天])闭馆/.exec(text);
  if(closed&&'日一二三四五六'.indexOf(closed[1].replace('天','日'))===day)return {windows:[],lastEntry:null,certainty:'unknown',raw:text};
  const windows=[...text.matchAll(/(\d{1,2}:\d{2})\s*[-–~至]\s*(\d{1,2}:\d{2})/g)].map(m=>[clock(m[1].padStart(5,'0')),clock(m[2].padStart(5,'0'))]);
  if(text==='全天')windows.push([0,1439]);
  return {windows:windows.length?windows:null,lastEntry:null,certainty:'unknown',raw:text||null}
}
export function createFactTools({travelProvider,poiProvider}={}) {
  return {
    async poiFacts(pois,dates,{signal}={}) {
      const facts=[];const points={};
      for(const p of pois) {
        assert(Number.isFinite(p.lat)&&Number.isFinite(p.lng),'INVALID_POI','点位坐标缺失');
        points[p.poiId]={...p,opening:{}};
        const durationId=randomUUID();
        facts.push({id:durationId,kind:'duration',value:{normal:p.durationNormal,quick:p.durationRush??null,deep:p.durationDeep??null,visitPolicy:p.visitPolicy||null},source:'catalogue',provider:'local_catalogue',fetchedAt:null,validFor:{poiId:p.poiId},certainty:'estimated'});
        points[p.poiId].durationFactId=durationId;
        for(const date of dates) {
          const provider=poiProvider?await poiProvider(p,date,{signal}):null;
          const o=provider||openingFor(p,date);
          assert(o.windows===null||Array.isArray(o.windows)&&o.windows.every(w=>Array.isArray(w)&&w.length===2&&w.every(Number.isInteger)&&w[0]>=0&&w[1]<=1440&&w[0]<w[1]),'FACT_PROTOCOL','营业时间数据不正确',502);
          const id=randomUUID();facts.push({id,kind:'opening',value:o,source:provider?'provider':'catalogue_unverified',provider:provider?.provider||'local_catalogue',fetchedAt:provider?.fetchedAt||null,validFor:{date,poiId:p.poiId},certainty:o.certainty||'unknown'});
          points[p.poiId].opening[date]={...o,factId:id};
        }
      }
      return {points,facts}
    },
    async travel(from,to,{date,departureMinute,mode='mixed',slow=false,signal}={}) {
      if(!from||!to)return {minutes:null,walkMinutes:null,certainty:'unknown',fact:null};
      const raw=travelProvider?await travelProvider(from,to,{date,departureMinute,mode,slow,signal}):null;
      const km=haversineKm(from,to)*1.35;
      const speed=mode==='walk'?(slow?2.5:4):mode==='bike'?12:mode==='transit'?18:22;
      const overhead=mode==='walk'||mode==='bike'?0:mode==='transit'?15:mode==='taxi'?8:12;
      const minutes=raw?.minutes??Math.max(mode==='mixed'||mode==='transit'?15:5,Math.ceil((km/speed*60+overhead)/5)*5);
      assert(Number.isInteger(minutes)&&minutes>=0&&minutes<=1440,'FACT_PROTOCOL','交通时长不正确',502);
      const walkMinutes=raw?.walkMinutes??(mode==='walk'?minutes:mode==='bike'?0:Math.min(15,Math.ceil(minutes/4)));
      assert(Number.isInteger(walkMinutes)&&walkMinutes>=0&&walkMinutes<=minutes,'FACT_PROTOCOL','步行时长不正确',502);
      const fact={id:randomUUID(),kind:'travel',value:{minutes,walkMinutes,mode:raw?.mode||mode},source:raw?'provider':'distance_estimate',provider:raw?.provider||'haversine_policy_v2',fetchedAt:raw?.fetchedAt||null,validFor:{date,fromId:from.poiId||from.id,toId:to.poiId||to.id,departureMinute},certainty:raw?.certainty||'estimated'};
      return {minutes,walkMinutes,certainty:fact.certainty,fact,mode:fact.value.mode}
    }
  }
}
