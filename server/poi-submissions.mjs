import { createPlaceSearch, SearchError } from './place-search.mjs'
import { mkdir, readFile, writeFile, rename, readdir, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { randomUUID, timingSafeEqual } from 'node:crypto'

class InputError extends Error {}
const invalid = message => {throw new InputError(message)}
const text = (body,key,max,required=false) => {const v=body[key]??'';if(typeof v!=='string'||v.length>max||(required&&!v.trim()))invalid(`${key} 格式错误`);return v.trim()}
export function validateSubmission(body,lines){
 const lineId=text(body,'lineId',100,true),doc=lines.get(lineId);if(!doc)invalid('路线不存在')
 const requestId=text(body,'requestId',80,true);if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))invalid('请求编号无效')
 if(!['ip','classic'].includes(body.type))invalid('点位类型无效')
 const place=body.place
 if(!place||typeof place.lat!=='number'||typeof place.lng!=='number'||!Number.isFinite(place.lat)||!Number.isFinite(place.lng)||Math.abs(place.lat)>85||Math.abs(place.lng)>180)invalid('请选择地图位置')
 const name=text(place,'name',100,true),address=text(place,'address',300,true)
 const existing=[...(doc.ipStops||[]),...(doc.cityStops||[])]
 if(existing.some(p=>p.name===name||(Math.abs(p.lat-place.lat)<.00035&&Math.abs(p.lng-place.lng)<.00035)))invalid('该点位已收录')
 const intro=text(body,'intro',300,true);if(intro.length<20)invalid('点位介绍至少 20 字')
 if(body.confirmed!==true)invalid('请确认照片要求及使用授权')
 if(!Array.isArray(body.photos)||!body.photos.length||body.photos.length>5)invalid('请上传 1–5 张照片')
 const images=body.photos.map(photo=>{
  if(typeof photo!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo))invalid('照片格式无效')
  const buffer=Buffer.from(photo.split(',')[1],'base64')
  if(buffer.length>3*1024*1024||buffer.length<100||buffer[0]!==255||buffer[1]!==216||buffer[buffer.length-2]!==255||buffer[buffer.length-1]!==217)invalid('照片无效或过大')
  return buffer
 })
 const scene=body.type==='ip'?text(body,'scene',1500,true):''
 if(body.type==='ip'&&scene.length<10)invalid('对应情节至少 10 字')
 if(body.type==='ip'&&(!['故事发生地','取景地','现实原型','其他关联'].includes(body.relation)||!['原著','影视改编','其他'].includes(body.edition)))invalid('作品关联类型无效')
 return { row:{requestId,lineId,type:body.type,place:{name,address,lat:place.lat,lng:place.lng,source:['manual','photon','geoapify'].includes(place.source)?place.source:'search',coordinateSystem:'WGS84',approximate:place.approximate===true,precision:text(place,'precision',30)},intro,locationDetail:text(body,'locationDetail',300),tips:text(body,'tips',500),alias:body.type==='ip'?text(body,'alias',100):'',scene,relation:body.type==='ip'?body.relation:'',edition:body.type==='ip'?body.edition:'',chapter:body.type==='ip'?text(body,'chapter',100):'',excerpt:body.type==='ip'?text(body,'excerpt',2000):'',source:body.type==='ip'?text(body,'source',500):'',photoConsent:true},images }
}
async function bodyJSON(req,max){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)invalid('内容过大');chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{invalid('JSON 格式错误')}}
export async function createPoiHandler({ directory=resolve('var/poi-submissions'),dataDirectory=resolve('data/lines'),adminToken=process.env.WISH_ADMIN_TOKEN,allowedOrigins=[],photonUrl=process.env.PHOTON_BASE_URL,fetchImpl=fetch,cookieAdmin=null }={}){
 await mkdir(directory,{recursive:true,mode:0o700})
 const lines=new Map()
 for(const f of await readdir(dataDirectory)){if(!f.endsWith('.json'))continue;const d=JSON.parse(await readFile(join(dataDirectory,f),'utf8'));if(d.line?.lineId)lines.set(d.line.lineId,d)}
 const records=new Map()
 for(const f of await readdir(directory)){if(!f.endsWith('.json'))continue;const row=JSON.parse(await readFile(join(directory,f),'utf8'));records.set(row.requestId,row)}
 let queue=Promise.resolve()
 const limits=new Map()
 const places=createPlaceSearch({photonUrl,fetchImpl})
 function admin(req){const token=req.headers.authorization||'',expected=`Bearer ${adminToken}`;return !!adminToken&&Buffer.byteLength(token)===Buffer.byteLength(expected)&&timingSafeEqual(Buffer.from(token),Buffer.from(expected))}
 async function isAdmin(req){if(admin(req))return true;if(cookieAdmin)try{return !!await cookieAdmin(req)}catch{return false}return false}
 function rate(req){const now=Date.now(),ip=req.socket.remoteAddress;for(const [k,v]of limits)if(now-v.start>60000)limits.delete(k);const v=limits.get(ip)||{start:now,count:0};limits.set(ip,v);return ++v.count<=120}
 const save=async row=>{const file=join(directory,`${row.id}.json`);await writeFile(file+'.tmp',JSON.stringify(row),{mode:0o600,flush:true});await rename(file+'.tmp',file)}
 return async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),path=url.pathname
 if(!path.startsWith('/api/poi-submissions')&&!path.startsWith('/api/places'))return false
 const reply=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));return true}
 try{
 if(!rate(req))return reply(429,{error:'操作频繁，请稍后重试'})
 if(req.method==='POST'||req.method==='PATCH'){
 const origin=req.headers.origin
 if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`&&!allowedOrigins.includes(origin))return reply(403,{error:'来源无效'})
 if(!req.headers['content-type']?.includes('application/json'))return reply(415,{error:'请使用 JSON'})
 }
 if((path==='/api/places'||path==='/api/places/reverse')&&req.method==='GET'){
 const doc=lines.get(url.searchParams.get('lineId'))
 if(!doc)return reply(400,{error:'路线不存在'})
 const city=(url.searchParams.get('city')||doc.line.city).trim()
 if(!city||city.length>80)return reply(400,{error:'请选择城市'})
 let data
 if(path.endsWith('/reverse')){
 const rawLat=url.searchParams.get('lat'),rawLng=url.searchParams.get('lng'),lat=Number(rawLat),lng=Number(rawLng)
 if(!rawLat||!rawLng||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180)return reply(400,{error:'位置无效'})
 data=await places.reverse({lat,lng,city})
 }else{
 const q=(url.searchParams.get('q')||'').trim()
 if(!q||q.length>100)return reply(400,{error:'请输入地点名称或地址'})
 data=await places.search({q,city})
 const existing=[...(doc.ipStops||[]),...(doc.cityStops||[])]
 data={...data,results:data.results.map(p=>({...p,existing:existing.some(v=>v.name===p.name||(Math.abs(v.lat-p.lat)<.00035&&Math.abs(v.lng-p.lng)<.00035))}))}
 }
 return reply(200,data)
 }
 if(path==='/api/poi-submissions'&&req.method==='POST'){
 const value=await bodyJSON(req,22*1024*1024)
 const {row,images}=validateSubmission(value,lines)
 const task=queue.then(async()=>{
  const old=records.get(row.requestId);if(old)return old
  const record={...row,id:`P-${randomUUID()}`,createdAt:new Date().toISOString(),status:'待审核',photoCount:images.length}
  const folder=join(directory,record.id);await mkdir(folder,{mode:0o700})
  try{for(let i=0;i<images.length;i++)await writeFile(join(folder,`${i}.jpg`),images[i],{mode:0o600});await save(record)}catch(e){await rm(folder,{recursive:true,force:true});throw e}
  records.set(record.requestId,record);return record
 });queue=task.catch(()=>{});const result=await task;return reply(201,{id:result.id,status:result.status})
 }
 if(!await isAdmin(req))return reply(401,{error:'请填写有效的团队审核密钥'})
 if(path==='/api/poi-submissions'&&req.method==='GET')return reply(200,[...records.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)))
 const match=path.match(/^\/api\/poi-submissions\/(P-[a-f0-9-]+)(?:\/photos\/(\d))?$/)
 if(!match)return reply(404,{error:'not found'})
 const record=[...records.values()].find(r=>r.id===match[1]);if(!record)return reply(404,{error:'not found'})
 if(match[2]!==undefined&&req.method==='GET'){
 const index=Number(match[2]);if(index>=record.photoCount)return reply(404,{error:'not found'})
 const bytes=await readFile(join(directory,record.id,`${index}.jpg`));res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);return true
 }
 if(req.method==='PATCH'&&match[2]===undefined){
 const body=await bodyJSON(req,4096);if(!['待审核','待收录','需补充','不收录'].includes(body.status))return reply(400,{error:'状态无效'})
 const reviewNote=text(body,'reviewNote',1000)
 const task=queue.then(async()=>{const current=records.get(record.requestId);const updated={...current,status:body.status,reviewNote,reviewedAt:new Date().toISOString()};await save(updated);records.set(updated.requestId,updated);return updated});queue=task.catch(()=>{});return reply(200,await task)
 }
 return reply(405,{error:'method not allowed'})
 }catch(e){return reply(e instanceof InputError?400:e instanceof SearchError?e.code:503,{error:e instanceof InputError||e instanceof SearchError?e.message:'服务暂不可用，内容已保留，请稍后重试'})}
 }
}
