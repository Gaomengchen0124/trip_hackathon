// Default: readiness only. --generate explicitly makes paid provider requests.
import { randomUUID } from 'node:crypto'
const base=process.env.PLANNING_CHECK_BASE||'http://127.0.0.1:8001';
let cookie='';
async function request(path,body) {
  const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:new URL(base).origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify({idempotencyKey:randomUUID(),...body}):undefined,signal:AbortSignal.timeout(65000)});
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const data=await r.json();
  if(!r.ok)throw new Error(`${data.error?.code}: ${data.error?.message}`);return data.data
}
try {
  const status=await request('/api/planning/status');console.log(JSON.stringify(status,null,2));
  if(!status.configured){console.log('请在 server/.env.local 填写 DEEPSEEK_API_KEY 并重启服务。');process.exitCode=2}
  else if(process.argv.includes('--generate')) {
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date(Date.now()+7*86400000));
    const s=await request('/api/planning/sessions',{context:{lineId:'fanhua-shanghai',selectedPoiIds:['sh-ip-01','sh-sp-01'],dateRange:{startDate:date,endDate:date},timeZone:'Asia/Shanghai'},text:'想轻松一点，公共交通优先。',action:'generate'});
    let job=await request('/api/itineraries',{planningSessionId:s.planningSessionId,intakeRevision:s.intakeRevision});
    while(['queued','running'].includes(job.state)){await new Promise(r=>setTimeout(r,1000));job=await request('/api/planning/jobs/'+job.id)}
    if(job.state!=='succeeded')throw new Error(`${job.error?.code}: ${job.error?.message}`);
    console.log(JSON.stringify({jobId:job.id,kind:job.result.kind,itineraryId:job.result.itinerary?.id,validation:job.result.itinerary?.validation.status,conflicts:job.result.conflicts},null,2));
  }
} catch(e){console.error(e.message);process.exitCode=1}
