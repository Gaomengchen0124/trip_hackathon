import {ticketPolicy} from '../../src/planning/ticket-policy.mjs'
import {TripClient} from '../../client(1)/trip-mcp-client/src/trip-client.js'
import {assert,PlanningError} from '../../src/planning/core.mjs'
const supportedHost=host=>['ctrip.com','trip.com'].some(d=>host===d||host.endsWith('.'+d));
export function safeTripLink(value) {try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&supportedHost(u.hostname)?u.href:null}catch{return null}}
function link(record) {
  const groups=[record.urlInfo,record.urlInfoDto,record.linkUrls,...(Array.isArray(record.linkUrls)?record.linkUrls:[])].filter(Boolean);
  for(const g of groups)for(const key of ['h5Url','pcUrl','ctripH5','ctripPc','tripH5','tripPc']){const u=safeTripLink(g[key]);if(u)return u}return null
}
export function unpackTripResult(result) {
  if(result?.structuredContent!=null)return result.structuredContent;
  const blocks=result?.content?.filter(c=>c.type==='text')||[];
  assert(blocks.length===1,'TRIP_PROTOCOL','携程返回格式暂不支持，请稍后重试',502);
  try{return JSON.parse(blocks[0].text)}catch{if(/查询无结果|无结果/.test(blocks[0].text))return [];throw new PlanningError('TRIP_PROTOCOL','携程未返回可解析的查询结果',502)}
}
const normalized = value => String(value || '').normalize('NFKC').replace(/[\s·・（）()，,。.-]/g,'').toLowerCase();
function matches(record, city, poi) {
  const names=[poi.name,poi.ticketQueryName,...(Array.isArray(poi.ticketAliases)?poi.ticketAliases:[])].filter(Boolean).map(normalized);
  const info=record.basicInfo||{};
  return (!poi.ticketProductIds?.length||poi.ticketProductIds.map(String).includes(String(record.productID??info.productID))) && names.includes(normalized(info.name)) && Boolean(info.cityName) && normalized(info.cityName).replace(/市$/,'')===normalized(city).replace(/市$/,'');
}
const price = value => Number.isFinite(value)&&value>=0?value:null;
export function createTripQueries({token=process.env.TRIP_MCP_TOKEN,tokenKey=process.env.TRIP_MCP_TOKEN_KEY,clientFactory=options=>new TripClient(options)}={}) {
  const conflicting=Boolean(token?.trim()&&tokenKey?.trim());
  const configured=Boolean(token?.trim()||tokenKey?.trim())&&!conflicting;
  let client;
  if(configured)client=clientFactory({...token?.trim()?{token}:{tokenKey},timeoutMs:15000});
  return {configured,async query({kind,city,poi}) {
    assert(kind==='tickets','INVALID_QUERY','仅开放携程门票查询');
    assert(poi&&typeof poi.name==='string'&&typeof city==='string'&&city.trim(),'INVALID_QUERY','缺少景点或城市');
    const policy=ticketPolicy(poi);
    if(!policy.queryEnabled)return {kind,source:'local_catalogue',policy,items:[],queriedAt:null,notice:'本地门票信息仅供参考，预约及开放政策需另行核实。'};
    assert(!conflicting,'TRIP_CONFIGURATION','携程鉴权只能配置一种方式，行程规划仍可使用',503);
    assert(configured,'TRIP_NOT_CONFIGURED','携程查询暂未配置，行程规划仍可使用',503);
    let raw;
    try{raw=await client.queryTicket({cityName:city.replace(/市$/,''),scenicSpotName:policy.queryName,resourceSize:10})}catch{throw new PlanningError('TRIP_UNAVAILABLE','携程查询暂不可用，请检查渠道配置或稍后重试',502,true)}
    const list=unpackTripResult(raw);
    assert(Array.isArray(list),'TRIP_PROTOCOL','携程查询结果结构尚未匹配，未展示猜测数据',502);
    const items=list.slice(0,10).filter(r=>r&&typeof r.basicInfo?.name==='string').map(r=>{
      const info=r.basicInfo,matched=matches(r,city,poi),available=typeof info.available==='boolean'?info.available:null;
      const resources=(Array.isArray(r.resourceInfoList)?r.resourceInfoList:[]).filter(v=>v&&typeof v.name==='string').map(v=>{
        const url=link({urlInfoDto:v.urlInfoDto}),isBooking=typeof v.isBooking==='boolean'?v.isBooking:null;
        const scopeMatched=!poi.ticketResourceTerms?.length||poi.ticketResourceTerms.some(term=>v.name.includes(term));
        const canBook=matched&&scopeMatched&&available===true&&isBooking===true&&Boolean(url);
        return {id:String(v.resourceId??''),name:v.name,price:price(v.price),ctripPrice:price(v.ctripPrice),marketPrice:price(v.marketPrice),isBooking,url:canBook?url:null,canBook,
          disabledReason:canBook?null:!matched?'景点匹配待确认':!scopeMatched?'票种不属于本次游览范围':available!==true?'景点可订状态未确认':isBooking!==true?'票种不可订或状态未知':'缺少有效购买链接'};
      });
      return {name:info.name,id:String(r.productID??info.productID??''),price:price(info.price),currency:info.currency||null,
        url:matched?link(r):null,available,matchStatus:matched?'matched':'unconfirmed',canBook:resources.some(v=>v.canBook),resources,
        address:info.address||'',openDescription:r.ticketExtendInfo?.openTimeInfo?.unFormatOpenTime||null,latestEntry:r.ticketExtendInfo?.openTimeInfo?.latestEntryTime||null};
    });
    return {kind,source:'ctrip_mcp',policy,queriedAt:new Date().toISOString(),items,notice:'起价及可订状态为查询时参考，未校验出行日期；具体日期、票种与最终价格以携程页面为准。'};
  }}
}
