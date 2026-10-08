// ============================================================
// mock 数据层
//
// ⚠️ 内容不再内联在本文件里。内容组的生产源是 data/lines/*.json，
//    本文件只做三件事：
//      1. 把 data/lines/*.json 读进来
//      2. 翻成 contract.md 里定义的形状（Line / Column / PlanResult）
//      3. 调真引擎 src/engine/planner.mjs 出行程
//
//    改内容 → 改 data/lines/*.json（或跑 npm run data:gen 重新生成空模板）
//    改算法 → 改 src/engine/planner.mjs
//    改契约 → 先改 contract.md，再改本文件
// ============================================================
import * as catalog from '../../engine/catalog.mjs'
import { runPlan } from '../../engine/plan-result.mjs'

// ------------------------------------------------------------
// 1. 装载
// ------------------------------------------------------------
const FILES = import.meta.glob('../../../data/lines/*.json', { eager: true, import: 'default' })

const LOADED = Object.values(FILES)
const INDEX = LOADED.find((d) => d?._primary && Array.isArray(d?.lines))
const DOCS = LOADED.filter((d) => d?.line?.lineId)
const BY_ID = Object.fromEntries(DOCS.map((d) => [d.line.lineId, d]))

if (!INDEX) console.warn('[mock] 没找到 data/lines/index.json，跑一下 npm run data:gen')

/** 首页顺序：繁花优先，龙族在后 */
const orderedLines = () => [...(INDEX?.lines ?? [])].sort((a, b) => a.priority - b.priority)

/** 契约里的 Line（这里多带了 aliases / tags，是超集，页面可忽略） */
function toLine(lineId) {
  const doc = BY_ID[lineId]
  const meta = (INDEX?.lines ?? []).find((l) => l.lineId === lineId) ?? {}
  return {
    lineId,
    ipId: doc.line.ipId,
    title: doc.line.title,
    city: doc.line.city,
    cover: doc.line.cover,
    recommendDays: doc.line.recommendDays,
    aliases: meta.aliases ?? [],
    tags: meta.tags ?? {},
  }
}

// 给调试用的导出（页面不依赖）
export const ips = DOCS.map((d) => d.ip)
export const lines = orderedLines().map((l) => toLine(l.lineId))
export const pois = DOCS.flatMap((d) => [...d.ipStops, ...d.cityStops])
export const readiness = Object.fromEntries(
  DOCS.map((d) => [d.line.lineId, catalog.lineReadiness(d)])
)

// ------------------------------------------------------------
// 2. 端点 1：搜索联想 → Line[]
//    匹配范围：线路名 / 人物 / 地名 / 城市 / POI 名
// ------------------------------------------------------------
export function search(keyword) {
  return catalog
    .searchLines(keyword, { lines: orderedLines() }, BY_ID)
    .map((hit) => toLine(hit.lineId))
}

// ------------------------------------------------------------
// 3. 端点 2：首页栏目卡片墙（只按城市）
//    同一城市的线路归到一组，一组里可以有多条线；每条线只出现一次
// ------------------------------------------------------------
export function listColumns() {
  const groups = new Map()
  for (const l of orderedLines()) {
    const city = l.city || '其他'
    if (!groups.has(city)) groups.set(city, { label: city, lines: [] })
    groups.get(city).lines.push(toLine(l.lineId))
  }
  return { city: [...groups.values()] }
}

// ------------------------------------------------------------
// 4. 端点 3：路线详情
// ------------------------------------------------------------
export function getLineDetail(lineId) {
  const doc = BY_ID[lineId]
  if (!doc) throw new Error(`路线不存在: ${lineId}`)
  return {
    line: toLine(lineId),
    ip: doc.ip,
    pois: [...doc.ipStops, ...doc.cityStops],
  }
}

// ------------------------------------------------------------
// 5. 端点 4：行程规划 —— 直接调真引擎，不是假算法
// ------------------------------------------------------------
export function plan({ lineId, poiIds = [], timeRange, hoursPerDay = 8, protectedIds = [] }) {
  const doc = BY_ID[lineId]
  if (!doc) throw new Error(`路线不存在: ${lineId}`)
  if (!timeRange?.startDate || !timeRange?.endDate) throw new Error('还没选日期区间')

  const { pois: picked, allPois } = catalog.toPlanInput(doc, { poiIds })
  return runPlan({ pois: picked, allPois, timeRange, hoursPerDay, protectedIds })
}
