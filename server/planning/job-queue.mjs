import {assert,PlanningError} from '../../src/planning/core.mjs'
// One active job per owner, bounded global concurrency, and latest request per panel.
export function createPlanningQueue({concurrency=2,maxQueued=64,cacheTtlMs=120000,now=Date.now}={}){
 const entries=new Map(),cache=new Map(),pending=[],activeOwners=new Set();let active=0;
 const cancelled=()=>new PlanningError('JOB_CANCELLED','已停止过期核算，按最新条件继续',409,true);
 function remember(entry){
  if(!entry.cacheable||entry.job.state!=='succeeded')return;
  if(cache.size>=100)cache.delete(cache.keys().next().value);
  cache.set(entry.cacheKey,{expires:now()+cacheTtlMs,result:structuredClone(entry.job.result)});
 }
 function cancelEntry(entry){
  if(!['queued','running'].includes(entry.job.state))return;
  entry.ctrl.abort(cancelled());entry.job.state='cancelled';entry.job.error={code:'JOB_CANCELLED',message:'已停止过期核算',retryable:true};entry.job.result=null;entry.persist();
  const index=pending.indexOf(entry);if(index>=0){pending.splice(index,1);entries.delete(entry.job.id);}
 }
 function pump(){
  while(active<concurrency){const index=pending.findIndex(e=>!activeOwners.has(e.owner));if(index<0)return;
   const entry=pending.splice(index,1)[0];if(entry.ctrl.signal.aborted)continue;
   active++;activeOwners.add(entry.owner);entry.job.state='running';entry.job.phase='fetching';entry.persist();
   entry.task=Promise.resolve().then(()=>entry.run(entry.ctrl.signal,entry.job)).catch(e=>{
    if(entry.ctrl.signal.aborted)return;entry.job.state='failed';entry.job.error={code:e.code||'PLANNING_FAILED',message:e.code?e.message:'规划失败，请重试',retryable:true};entry.persist();
   }).finally(()=>{remember(entry);entries.delete(entry.job.id);active--;activeOwners.delete(entry.owner);pump();});
  }
 }
 return {
  submit({owner,lane,fingerprint,cacheable=false,createJob,persist,run}){
   for(const [key,value]of cache)if(value.expires<=now())cache.delete(key);
   const cacheKey=owner+':'+fingerprint;
   const existing=[...entries.values()].find(e=>e.owner===owner&&e.lane===lane&&e.fingerprint===fingerprint&&['queued','running'].includes(e.job.state));
   if(existing)return existing.job;
   const superseded=[...entries.values()].filter(e=>e.owner===owner&&e.lane===lane&&['queued','running'].includes(e.job.state));
   const queuedAfter=pending.length-superseded.filter(e=>pending.includes(e)).length;
   assert(queuedAfter<maxQueued,'QUEUE_FULL','当前等待任务较多，请稍后重试',503);
   for(const entry of superseded)cancelEntry(entry);
   const job=createJob(),hit=cacheable&&cache.get(cacheKey);
   if(hit){job.state='succeeded';job.phase='complete';job.result=structuredClone(hit.result);job.cached=true;persist(job);return job;}
   job.state='queued';job.phase='queued';persist(job);
   const entry={owner,lane,fingerprint,cacheKey,cacheable,job,run,ctrl:new AbortController(),persist:()=>persist(job)};
   entries.set(job.id,entry);pending.push(entry);queueMicrotask(pump);return job;
  },
  cancel(owner,id){const entry=entries.get(id);if(entry&&entry.owner===owner)cancelEntry(entry);pump();},
  async settle(){while(entries.size){pump();const tasks=[...entries.values()].map(e=>e.task).filter(Boolean);if(tasks.length)await Promise.allSettled(tasks);else await Promise.resolve();}},
  stats(){return {active,queued:pending.length,concurrency};}
 }
}
