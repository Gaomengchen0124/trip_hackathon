// 引擎 → 契约 的映射层。
// 唯一职责：把 planner.mjs 的原始返回，翻成 contract.md 里定义的 PlanResult。
// 页面只认 PlanResult，永远不直接碰 planner 的输出。
import { DEFAULTS, plan as rawPlan } from './planner.mjs'

export const ADD_THRESHOLD = DEFAULTS.addThreshold

/**
 * 跑一次规划，直接返回 PlanResult。
 *
 * @param {Object}   p
 * @param {POI[]}    p.pois         用户勾选的点位
 * @param {POI[]}    p.allPois      这条线的全部候选点（用于"建议追加"）
 * @param {Object}   p.timeRange    { startDate, startSlot, endDate, endSlot }
 * @param {6|8|10}   p.hoursPerDay
 * @param {string[]} p.protectedIds 用户明确不想砍的点（抽屉里标了保留的）
 */
export function runPlan({ pois, allPois = [], timeRange, hoursPerDay = 8, protectedIds = [] }) {
  if (!pois?.length) {
    return {
      status: 'ok',
      message: '还没选点位',
      impossible: false,
      usage: 0,
      shortage: 0,
      totalMin: 0,
      totalAvailableMin: 0,
      daysNeeded: 0,
      compressed: false,
      days: [],
      suggestions: [],
    }
  }

  const raw = rawPlan({
    pois,
    allPois,
    dayHours: hoursPerDay,
    startDate: timeRange.startDate,
    startSlot: timeRange.startSlot,
    endDate: timeRange.endDate,
    endSlot: timeRange.endSlot,
    protectedIds,
  })

  return toPlanResult(raw)
}

/** 原始结果 → PlanResult */
export function toPlanResult(raw) {
  // 判定顺序：装不下 > 排得下但太宽松 > 正常
  // 注意：under70 也要把 days 返回，用户可以先看行程再决定加不加点
  let status = 'ok'
  if (raw.overload) status = 'overload'
  else if (raw.usage < ADD_THRESHOLD) status = 'under70'

  const kind = raw.suggestion?.kind

  return {
    status,

    // ---- 给人看的 ----
    message: raw.message ?? null,

    // ---- 时间账 ----
    totalMin: raw.totalUsed ?? 0,
    totalAvailableMin: raw.totalAvailable ?? 0,
    usage: Number((raw.usage ?? 0).toFixed(4)),
    shortage: raw.shortage ?? 0,
    daysNeeded: raw.daysNeeded ?? 0,

    // ---- 档位 ----
    impossible: !!raw.impossible,
    compressed: !!raw.compressed,
    degraded: raw.degraded ?? [],

    // ---- 行程 ----
    days: (raw.days ?? []).map((d, i) => ({
      day: i + 1,
      date: d.date,
      availableMin: d.available,
      usedMin: d.used,
      idleMin: d.idle ?? Math.max(0, d.available - d.used),
      items: (d.stops ?? []).map((s, j) => ({
        poiId: s.poiId,
        order: j + 1,
        duration: s.stayMinutes,
        arrive: s.arrive,
        leave: s.leave,
        legMinutes: s.legMinutes,
        mode: s.mode,
      })),
    })),

    // ---- 取舍建议 ----
    // kind = 'drop' → 带 mustDrop / savesMinutes（放弃能省多少，含孤点往返）
    // kind = 'add'  → 带 addsMinutes（加上要多花多少），mustDrop 恒为 false
    suggestions: (raw.suggestion?.items ?? []).map((it) => ({
      poiId: it.poiId,
      name: it.name,
      reason: it.reason,
      mustDrop: kind === 'drop' ? !!it.mustDrop : false,
      kind: kind ?? 'add',
      savesMinutes: kind === 'drop' ? it.savesMinutes : 0,
      addsMinutes: kind === 'add' ? it.addsMinutes : 0,
      isolated: !!it.isolated,
      fits: it.fits ?? true,
    })),
  }
}
