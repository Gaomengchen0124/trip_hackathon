// 点位必填项检查 —— 对应《填写模板.md》点位卡的必填项，返回缺失字段的中文名列表
const blank = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim())

export function poiMissingFields(poi) {
  const missing = []
  if (blank(poi.name)) missing.push('地名')
  if (poi.lng == null || poi.lat == null) missing.push('地图位置')
  if (blank(poi.cluster)) missing.push('片区')
  if (poi.type === 'ip') {
    if (blank(poi.tier)) missing.push('重要度')
  } else {
    if (!(poi.popularity >= 1 && poi.popularity <= 5)) missing.push('知名度')
  }
  if (!(poi.durationNormal > 0)) missing.push('正常时长')
  if (!(poi.durationRush > 0)) missing.push('快速打卡时长')
  if (blank(poi.intro)) missing.push('介绍')
  if (blank(poi.realPhoto)) missing.push('照片')
  if (blank(poi.photoCredit)) missing.push('图片来源/授权')
  if (poi.type === 'ip') {
    const okQuotes = (poi.quotes ?? []).filter((q) => !blank(q.full) && !blank(q.source))
    if (!okQuotes.length) missing.push('引文（原文+出处）')
  }
  return missing
}
