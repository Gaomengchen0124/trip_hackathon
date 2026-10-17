// Each proposal is checked as a whole. A failed or interrupted trial never authorizes generation.
export async function removalProposal({ids,ranked,protectedIds=[],trial,signal,allowEmpty=false}) {
  signal?.throwIfAborted();
  const original=await trial(ids);signal?.throwIfAborted();
  if(original.feasible)return {ids:[],result:original,feasible:true};
  const removed=[];
  for(const c of ranked){
    if(protectedIds.includes(c.poiId)||!ids.includes(c.poiId)||removed.includes(c.poiId))continue;
    if(ids.length-removed.length<=(allowEmpty?0:1))break;
    removed.push(c.poiId);
    const result=await trial(ids.filter(id=>!removed.includes(id)));signal?.throwIfAborted();
    if(result.feasible)return {ids:removed,result,feasible:true};
  }
  return {ids:[],result:original,feasible:false};
}
export function endSlack(day){
  const ends=(day.items||[]).map(i=>Date.parse(i.endAt)).filter(Number.isFinite);
  return ends.length?(Date.parse(day.endAt)-Math.max(...ends))/60000:Infinity;
}
export function additionFits(result,baseIds,buffer=15){
  if(!result.feasible||!result.days)return false;
  return result.days.every(day=>!day.items?.some(i=>i.type==='visit'&&!baseIds.includes(i.poiId))||endSlack(day)>=buffer);
}
export async function additionProposal({ids,ranked,rejectedIds=[],trial,signal}){
  const base=await trial(ids);signal?.throwIfAborted();
  if(!base.feasible)return {ids:[],result:base,feasible:false,baseFeasible:false};
  const added=[];let result=base;
  for(const c of ranked){
    if(ids.includes(c.poiId)||rejectedIds.includes(c.poiId)||added.includes(c.poiId)||ids.length+added.length>=30)continue;
    const next=await trial([...ids,...added,c.poiId]);signal?.throwIfAborted();
    if(additionFits(next,ids)){added.push(c.poiId);result=next;}
  }
  return {ids:added,result,feasible:true,baseFeasible:true};
}
