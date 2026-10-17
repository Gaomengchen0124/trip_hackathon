// 服务端 IP 文档校验 —— 每条城市线跑 data/line-rules.mjs 的纯函数规则，外加 IP 级检查。
// 草稿模式剔除 S08（必填字段）/ S09（【】占位）/ C01（坐标空）：草稿允许未完成，上架必须完整。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { validateLineDoc } from '../data/line-rules.mjs'

const DRAFT_EXEMPT = new Set(['S03', 'S08', 'S09', 'C01', 'C02', 'C03', 'IP03', 'IP04'])
const PLACEHOLDER_CREDIT = /占位|待替换|待补/
const PLACEHOLDER = /【[^】]*】/
const scanPlaceholder = (v) => typeof v === 'string' && PLACEHOLDER.test(v)

export function createContentValidator({ uploadsDir = 'var/content-uploads', publicDir = 'public' } = {}) {
  const fileChecker = (f) => {
    if (/^https?:\/\//i.test(f)) return true
    if (f.startsWith('/api/content/img/')) return existsSync(join(uploadsDir, f.split('/').pop()))
    return [join(publicDir, f), join(publicDir, 'img', f.split('/').pop()), join(uploadsDir, f.split('/').pop())].some((c) => existsSync(c))
  }
  function validateIp(doc, { draft = false, cityKeys = null } = {}) {
    const issues = []
    const push = (issue) => { if (!(draft && DRAFT_EXEMPT.has(issue.ruleId))) issues.push(issue) }
    if (!doc || typeof doc !== 'object') return [{ level: 'error', ruleId: 'IP01', msg: '文档格式不正确' }]
    if (!doc.ip || typeof doc.ip.name !== 'string' || !doc.ip.name.trim()) push({ level: 'error', ruleId: 'IP01', msg: '作品名为空' })
    // IP 级占位符残留（作品名/作者）；草稿豁免，上架必须清空
    if (scanPlaceholder(doc.ip?.name) || scanPlaceholder(doc.ip?.author)) push({ level: 'error', ruleId: 'IP03', msg: 'IP 信息残留【】占位符' })
    const lines = doc.lines ?? {}
    if (!Object.keys(lines).length) push({ level: 'error', ruleId: 'IP02', msg: '至少需要一条城市线' })
    for (const [cityKey, line] of Object.entries(lines)) {
      if (cityKeys && !cityKeys.has(cityKey)) continue   // 分线上架：只校验选中的线
      if(!draft && !(line.ipStops??[]).length)push({level:'error',ruleId:'IP05',msg:'请至少添加一个与作品相关的 IP 点位',where:`[${cityKey}]`})
      if(!draft)for(const p of line.ipStops??[])if(!(p.quotes??[]).some(q=>q.full?.trim()&&q.source?.trim()))push({level:'error',ruleId:'IP06',msg:'请补充经核实的引文原文和出处',where:`[${cityKey}] ${p.poiId}`})
      if (scanPlaceholder(line?.line?.title) || (line?.clusters ?? []).some(scanPlaceholder)) {
        push({ level: 'error', ruleId: 'IP03', msg: '线路信息残留【】占位符', where: `[${cityKey}]` })
      }
      const lineDoc = { _bounds: line._bounds, _expected: line._expected, ip: doc.ip ?? {}, line: line.line ?? {}, clusters: line.clusters ?? [], ipStops: line.ipStops ?? [], cityStops: line.cityStops ?? [] }
      const errors = validateLineDoc(lineDoc, draft ? null : fileChecker)
        .filter((i) => i.level === 'error')
        .filter((i) => !(draft && DRAFT_EXEMPT.has(i.ruleId)))
      for (const e of errors) issues.push({ ...e, where: `[${cityKey}]${e.where ? ' ' + e.where : ''}` })
      // IP04：占位图/待替换授权不算完成（上架强制，草稿豁免）
      for (const p of [...(line.ipStops ?? []), ...(line.cityStops ?? [])]) {
        if (typeof p.photoCredit === 'string' && PLACEHOLDER_CREDIT.test(p.photoCredit)) {
          push({ level: 'error', ruleId: 'IP04', msg: `图片来源含「占位/待替换/待补」，请替换真实照片`, where: `[${cityKey}] ${p.poiId}` })
        }
      }
    }
    return issues
  }
  return {
    /** 保存草稿：宽松（允许空字段/占位符/未选坐标/越界/非法片区） */
    validateDraft(doc) { return validateIp(doc, { draft: true }) },
    /** 上架：全量 error 规则 + C11 图片检查；cityKeys 只校验选中的城市线 */
    validatePublish(doc, cityKeys = null) { return validateIp(doc, { draft: false, cityKeys: cityKeys ? new Set(cityKeys) : null }) },
  }
}
