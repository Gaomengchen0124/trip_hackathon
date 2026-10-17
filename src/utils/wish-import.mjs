export const workKey = value => String(value ?? '').trim().replace(/[《》\s]/g,'').toLowerCase()
export function newCityLine(ipId,name,city) {
  return {status:'draft',_bounds:{lng:[-180,180],lat:[-90,90]},_expected:{ipStops:[6,12],cityStops:[10,20],maxTierS:3},line:{lineId:`${ipId}-${city}`,ipId,title:`${name}·${city}`,city,cover:'',recommendDays:2},clusters:[],ipStops:[],cityStops:[]}
}
export function wishSnapshot(row) {
  return {id:row.id,ip:row.ip,city:row.city,points:row.points ?? [],scene:row.scene ?? '',styles:row.styles ?? [],clues:row.clues ?? '',createdAt:row.createdAt}
}
export function mergeWishPlans(doc, plans, wishes, existingLinks = []) {
  const result = structuredClone(doc), links = []
  const lookup = new Map(wishes.map(w=>[w.id,w]))
  for (const plan of plans) {
    const wish = lookup.get(plan.wishId)
    if (!wish) throw new Error('心愿不存在，请刷新后重试')
    const cityKey = String(plan.cityKey ?? '').trim()
    if (!/^[\p{L}\p{N}· -]{1,30}$/u.test(cityKey) || ['__proto__','constructor','prototype'].includes(cityKey)) throw new Error('请为每条心愿确认目标城市线（不能包含 / 等分隔符）')
    const previous=links.find(l=>l.wishId===wish.id&&l.cityKey===cityKey)??existingLinks.find(l=>l.wishId===wish.id&&l.cityKey===cityKey)
    const line = result.lines[cityKey] ?? (result.lines[cityKey] = newCityLine(result.ip.ipId,result.ip.name,cityKey))
    const requested = Array.isArray(plan.points) ? plan.points : []
    if (requested.some(name=>!wish.points.includes(name))) throw new Error('导入点位必须来自所选心愿')
    const poiIds = [...(previous?.poiIds??[])]
    for (const name of [...new Set(requested)]) {
      const existing = [...line.ipStops,...line.cityStops].find(p=>workKey(p.name)===workKey(name))
      if (existing) { poiIds.push(existing.poiId); continue }
      const prefix = `${line.line.lineId}-ip-`
      let seq = line.ipStops.length+1
      const used = new Set([...line.ipStops,...line.cityStops].map(p=>p.poiId))
      while (used.has(`${prefix}${String(seq).padStart(2,'0')}`)) seq++
      const poiId = `${prefix}${String(seq).padStart(2,'0')}`
      line.ipStops.push({poiId,lineId:line.line.lineId,type:'ip',name,alias:'',lng:null,lat:null,cluster:'',tier:'',durationNormal:60,durationRush:30,intro:'',quotes:[],realPhoto:'',photos:[],photoCredit:'',tips:'',skipNote:''})
      poiIds.push(poiId)
    }
    const mergedIds=[...new Set(poiIds)]
    const samePoints=previous&&mergedIds.length===previous.poiIds.length&&mergedIds.every(id=>previous.poiIds.includes(id))
    const link={wishId:wish.id,ipId:result.ip.ipId,cityKey,poiIds:mergedIds,source:wishSnapshot(wish),createdAt:previous?.createdAt??Date.now(),completedAt:samePoints?previous.completedAt:null}
    const index=links.findIndex(l=>l.wishId===wish.id&&l.cityKey===cityKey)
    if(index>=0)links[index]=link;else links.push(link)
  }
  return {doc:result,links}
}
