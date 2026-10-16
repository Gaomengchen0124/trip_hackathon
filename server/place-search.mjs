const str=v=>typeof v==='string'?v:''
export class SearchError extends Error{constructor(message,code=503){super(message);this.code=code}}
const centers={'上海':[121.47,31.23],'北京':[116.40,39.90],'杭州':[120.15,30.27],'天津':[117.20,39.13],'厦门':[118.09,24.48],'大理':[100.16,25.69],'伦敦':[-.12,51.51],'东京及近郊':[139.76,35.68],'东京':[139.76,35.68]}
export function createPlaceSearch({photonUrl=process.env.PHOTON_BASE_URL||'https://photon.komoot.io',fetchImpl=fetch,minIntervalMs=1000}={}){
 const cache=new Map(),inflight=new Map();let queue=Promise.resolve(),last=0
 async function request(path,params){
 const task=queue.then(async()=>{
  const wait=Math.max(0,last+minIntervalMs-Date.now());if(wait)await new Promise(r=>setTimeout(r,wait));last=Date.now()
  const url=new URL(path,photonUrl);url.search=new URLSearchParams(params).toString()
  const res=await fetchImpl(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'PilgrimageTravel/0.1 (local route contributions)','Accept':'application/json'}})
  if(!res.ok)throw new SearchError('地址搜索暂不可用，请稍后重试')
  return res.json()
 });queue=task.catch(()=>{});return task
 }
 async function cached(key,run){const old=cache.get(key);if(old&&Date.now()-old.time<300000)return old.value;if(inflight.has(key))return inflight.get(key);const task=run().then(value=>{if(cache.size>300)cache.clear();cache.set(key,{time:Date.now(),value});return value}).finally(()=>inflight.delete(key));inflight.set(key,task);return task}
 function results(data){return(data.features||[]).map(f=>{
 const p=f.properties||{},c=f.geometry?.coordinates;if(!Array.isArray(c)||!Number.isFinite(c[0])||!Number.isFinite(c[1])||Math.abs(c[0])>180||Math.abs(c[1])>85)return null
 const street=[str(p.street),str(p.housenumber)].filter(Boolean).join(' ')
 const address=[...new Set([p.state,p.city,p.district,p.locality,street||p.name].filter(v=>typeof v==='string'&&v.trim()))].join(' · ')
 if(!address)return null
 return {id:`${p.osm_type||''}${p.osm_id||''}`,name:str(p.name)||street||address,address,lat:c[1],lng:c[0],source:'photon',coordinateSystem:'WGS84',precision:p.type==='street'?'道路':p.housenumber?'门牌号':'地点',houseNumber:str(p.housenumber),street:str(p.street)}
 }).filter(Boolean)}
 const notice='地址信息 © OpenStreetMap contributors · Photon'
 return {
 async search({q,city}){return cached(`search:${city}:${q}`,async()=>{
 const center=centers[city],params={q:`${city==='东京及近郊'?'东京':city} ${q}`,limit:'8'}
 if(center){params.lon=String(center[0]);params.lat=String(center[1]);params.bbox=[center[0]-1,center[1]-.7,center[0]+1,center[1]+.7].join(',')}
 let found=results(await request('/api/',params)),approximate=false
 const numbered=q.match(/^(.+?(?:路|街|道|巷|弄))\s*(\d+[\d-]*)(?:号|弄|楼)?.*$/)
 if(numbered){
  const exact=found.filter(p=>p.houseNumber===numbered[2]||p.name.includes(q))
  if(exact.length)found=exact
  else{approximate=true;found=results(await request('/api/',{...params,q:`${city} ${numbered[1]}`})).filter(p=>p.precision==='道路'&&(p.name===numbered[1]||p.street===numbered[1])).map(p=>({...p,approximate:true}))}
 }
 found=found.filter((p,i,a)=>a.findIndex(v=>v.id===p.id)===i)
 return {results:found,notice,approximate,message:approximate?'未匹配到该门牌，下方为相关道路。请在地图上确认位置，并补充具体门牌。':'',available:true}
 })},
 async reverse({lat,lng,city}){return cached(`reverse:${city}:${lat.toFixed(5)}:${lng.toFixed(5)}`,async()=>{
 const items=results(await request('/reverse',{lat:String(lat),lon:String(lng),limit:'5',radius:'.5'}))
 if(!items.length)throw new SearchError('未能识别此处地址，请重新选点',404)
 const first=items[0]
 // 最近地点仅作位置参考，坐标始终保留用户选中的地图中心。
 return {place:{...first,name:first.address,lat,lng,approximate:true,precision:'附近地址'},nearby:items,notice,message:'附近地址仅供参考，可在具体位置中补充门牌和入口。'}
 })}
 }
}
