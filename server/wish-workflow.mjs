import {createHash} from 'node:crypto'
import {mergeWishPlans,workKey} from '../src/utils/wish-import.mjs'

const fail = (message,status=400) => {throw Object.assign(new Error(message),{status})}
export function createWishWorkflow({store,validator,fetchImpl,wishesBase,ensureIp}) {
  const request = async (req,path,body) => {
    const response = await fetchImpl(`${wishesBase}${path}`,{method:body?'PATCH':'GET',headers:{cookie:req.headers.cookie??'',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)})
    if (!response.ok) fail('心愿服务暂不可用或状态已改变，请刷新后重试',response.status===409?409:502)
    return response.json()
  }
  const sync = async (req,op) => {
    const pending=[]
    for (const item of op.pending) {
      if(!store.wishLinks().some(l=>l.wishId===item.id))continue
      try { await request(req,`/api/wishes/${item.id}/status`,{status:item.status,expectedStatus:item.expectedStatus,note:item.note}) }
      catch { pending.push(item) }
    }
    store.setWishPending(op.id,pending)
    return {ip:store.getIp(op.ipId),operationId:op.id,syncPending:pending.length>0}
  }
  const identify = body => {
    if (!body || !/^[a-zA-Z0-9-]{16,80}$/.test(body.operationId??'')) fail('缺少有效的操作编号')
    const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex')
    const previous = store.wishOperation(body.operationId)
    if (previous && previous.fingerprint!==fingerprint) fail('操作内容已改变，请重新确认导入',409)
    return {fingerprint,previous}
  }
  return {
    async import(req,body,actor) {
      const {fingerprint,previous}=identify(body)
      if (previous) return sync(req,previous)
      if (!Array.isArray(body.plans)||!body.plans.length||body.plans.length>50) fail('请选择 1–50 条心愿来源')
      const wishes=await request(req,'/api/wishes/export')
      const selected=body.plans.map(p=>wishes.find(w=>w.id===p.wishId))
      if (selected.some(w=>!w)) fail('有心愿已不存在，请重新选择',404)
      if (selected.some(w=>w.status==='已拒绝')) fail('请先重新打开已拒绝的心愿，再导入')
      if (new Set(selected.map(w=>workKey(w.ip))).size>1) fail('一次只能导入同一作品的心愿')
      let existing=null
      if (body.targetIpId) {
        const wasBundled=!store.getIp(body.targetIpId)
        existing=await ensureIp(body.targetIpId,actor)
        // 打包内容首次进入内容库后更新时间会变化；客户端提供 0 表示此次导入。
        if (body.expectedUpdatedAt!==existing.updatedAt && !(body.expectedUpdatedAt===0 && wasBundled)) fail('目标作品已经更新，请重新选择后核对',409)
      }
      const original=existing?.doc??body.doc
      if (!original?.ip?.name?.trim() || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(original?.ip?.ipId??'')) fail('请填写有效的作品名与 IP 编号')
      if(!['novel','film','tv','prose','poetry','history'].includes(original.ip.kind))fail('请选择作品类型')
      const names=[original.ip.name,...(Array.isArray(original.ip.aliases)?original.ip.aliases:[])].map(workKey)
      if(!names.includes(workKey(selected[0].ip))&&body.confirmDifferentWork!==true)fail('目标作品名与心愿不一致，请核对后明确确认')
      if (!existing && store.getIp(original.ip.ipId)) fail('IP 编号已存在，请关联已有 IP',409)
      const ipId=original.ip.ipId
      let merged
      try{merged=mergeWishPlans(original,body.plans,wishes,store.wishLinks(ipId))}catch(e){fail(e.message)}
      const {doc,links}=merged
      const issues=validator.validateDraft(doc)
      if (issues.length) throw Object.assign(new Error('导入数据未通过草稿校验'),{status:422,issues})
      const transitions=[...new Map(selected.filter(w=>w.status==='待整理').map(w=>[w.id,{id:w.id,status:'筹备中',expectedStatus:'待整理',note:`已关联作品「${doc.ip.name}」，等待整理核实`}])).values()]
      const op=store.commitWishImport({id:body.operationId,fingerprint,ipId,doc,links,transitions,actor,expectedUpdatedAt:existing?.updatedAt??null})
      return sync(req,op)
    },
    async complete(req,body,actor) {
      const {fingerprint,previous}=identify(body)
      if(previous)return sync(req,previous)
      if(!Array.isArray(body.keys)||!body.keys.length) fail('请选择要确认收录的心愿')
      const all=store.wishLinks(), links=all.filter(l=>l.ipId===body.ipId && body.keys.includes(`${l.wishId}|${l.cityKey}`))
      if(links.length!==body.keys.length)fail('关联记录已经改变，请刷新',409)
      for(const link of links){
        const published=store.publishedLine(link.ipId,link.cityKey)
        const ids=new Set([...(published?.doc.ipStops??[]),...(published?.doc.cityStops??[])].map(p=>p.poiId))
        if(!published||link.poiIds.some(id=>!ids.has(id))) fail('关联点位尚未上线，请先发布对应城市线')
      }
      const wishes=await request(req,'/api/wishes/export')
      const transitions=[]
      for(const wishId of new Set(links.map(l=>l.wishId))){
        const remaining=all.filter(l=>l.wishId===wishId).some(l=>!l.completedAt&&!links.some(x=>x.wishId===l.wishId&&x.ipId===l.ipId&&x.cityKey===l.cityKey))
        const wish=wishes.find(w=>w.id===wishId)
        if(!wish) fail('心愿不存在',404)
        if(!remaining&&wish.status!=='已收录') transitions.push({id:wishId,status:'已收录',expectedStatus:wish.status,note:body.note?.slice(0,1000)||'管理员已核对：关联的线上内容满足该心愿'})
      }
      return sync(req,store.completeWishLinks({id:body.operationId,fingerprint,ipId:body.ipId,links,transitions,actor}))
    },
    async retry(req,id){const op=store.wishOperation(id);if(!op)fail('操作不存在',404);return sync(req,op)},
    links(ipId){return store.wishLinks(ipId).map(link=>{
      const ip=store.getIp(link.ipId),published=store.publishedLine(link.ipId,link.cityKey)
      const ids=new Set([...(published?.doc.ipStops??[]),...(published?.doc.cityStops??[])].map(p=>p.poiId))
      return {...link,ipName:ip?.doc.ip.name??link.ipId,lineTitle:ip?.doc.lines[link.cityKey]?.line.title??link.cityKey,online:!!published,canComplete:!!published&&link.poiIds.every(id=>ids.has(id))}
    })}
  }
}
