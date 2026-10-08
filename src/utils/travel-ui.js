// UI validation only. Scheduling, capacity and recommendation ranking remain in api.plan().
export const SLOTS = ['上午', '中午', '晚上']
export const HOURS = [6, 8, 10]
export const TIER_LABELS = { S: '灵魂点位', A: '重要点位', B: '可选点位' }

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}
export function validateTimeRange(range, hours) {
  if (!validDate(range?.startDate) || !validDate(range?.endDate))
    return '请选择有效的开始和结束日期'
  if (!SLOTS.includes(range.startSlot) || !SLOTS.includes(range.endSlot))
    return '请选择开始和结束时段'
  if (
    range.endDate < range.startDate ||
    (range.endDate === range.startDate &&
      SLOTS.indexOf(range.endSlot) < SLOTS.indexOf(range.startSlot))
  )
    return '结束时间不能早于开始时间'
  if (!HOURS.includes(hours)) return '每天游玩时长请选择 6、8 或 10 小时'
  return ''
}
// 定稿规则：IP 打卡点和城市景点"至少勾一个"即可，不要求两类都选。
export function validateSelection(pois, ids) {
  const known = new Set(pois.map((p) => p.poiId))
  return (ids || []).some((id) => known.has(id)) ? '' : '至少要保留一个点位'
}
export function applyTradeoff(ids, picked, status, pois) {
  const known = new Set(pois.map((p) => p.poiId))
  const changes = new Set(picked.filter((id) => known.has(id)))
  return status === 'overload'
    ? ids.filter((id) => !changes.has(id))
    : [...new Set([...ids, ...changes])]
}
export function formatMinutes(value) {
  const min = Number(value)
  if (!Number.isFinite(min) || min < 0) return '时长待补充'
  const h = Math.floor(min / 60),
    m = min % 60
  return h ? `${h} 小时${m ? ` ${m} 分钟` : ''}` : `${m} 分钟`
}
// public/img/foo.jpg is referenced as img/foo.jpg in existing mock data.
// Resolve against Vite's base, not the current /customize/ or /poi/ route.
export function assetUrl(value, base = '/') {
  if (typeof value !== 'string' || !value.trim()) return ''
  const src = value.trim()
  if (/^https?:\/\//i.test(src)) return src
  if (
    /^[a-z][a-z\d+.-]*:/i.test(src) ||
    src.startsWith('//') ||
    src.includes('\\')
  )
    return ''
  if (src.startsWith('/')) return src
  return `${base.replace(/\/?$/, '/')}${src.replace(/^\.\//, '')}`
}

// 一个点位可能有多张实拍图：photos[0] 即封面，老数据只有 realPhoto 时退回单图。
export function poiPhotos(poi) {
  const list = Array.isArray(poi?.photos) ? poi.photos.filter(Boolean) : []
  if (list.length) return list
  return poi?.realPhoto ? [poi.realPhoto] : []
}

export function poiCover(poi) {
  return poiPhotos(poi)[0] || ''
}
