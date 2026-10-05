// ========== IP（作品） ==========
export const ips = [
  {
    ipId: 'fanhua',
    name: '繁花',
    author: '金宇澄',
    kind: 'novel', // novel 小说 / film 影视 / poetry 诗词 / history 史传
    cover: 'img/fanhua-cover.jpg', // 【待填】封面图
    aliases: ['繁花', '阿宝', '汪小姐', '黄河路', '宝总'],
  },
]

// ========== Line（作品·城市） ==========
export const lines = [
  {
    lineId: 'fanhua-shanghai',
    ipId: 'fanhua',
    title: '繁花·上海',
    city: '上海',
    cover: 'img/fanhua-shanghai.jpg', // 【待填】
    recommendDays: 2,
  },
]

// ========== POI（景点 / 打卡点） ==========
// ⚠️ 坐标为占位近似值，内容组核对后修正
// ⚠️ quotes 全部为空数组：引文必须逐字来自原著/剧集并标注出处，写不出来就留空，绝不编造（红线）
const TIER = { S: 0, A: 1, B: 2 }

export const pois = [
  { poiId: 'sh-01', lineId: 'fanhua-shanghai', type: 'ip', name: '黄河路', lng: 121.4692, lat: 31.2367, cluster: '黄浦·人民广场', tier: 'S', durationNormal: 120, durationRush: 60, intro: '【待核对】', quotes: [], realPhoto: 'img/sh-01.jpg', skipNote: '【待填】放弃理由' },
  { poiId: 'sh-02', lineId: 'fanhua-shanghai', type: 'ip', name: '南京路步行街', lng: 121.4757, lat: 31.2388, cluster: '黄浦·外滩', tier: 'A', durationNormal: 90, durationRush: 40, intro: '【待核对】', quotes: [], realPhoto: 'img/sh-02.jpg', skipNote: '【待填】' },
  { poiId: 'sh-03', lineId: 'fanhua-shanghai', type: 'ip', name: '外白渡桥', lng: 121.4901, lat: 31.2409, cluster: '黄浦·外滩', tier: 'S', durationNormal: 45, durationRush: 20, intro: '【待核对】', quotes: [], realPhoto: 'img/sh-03.jpg', skipNote: '【待填】' },
  { poiId: 'sh-04', lineId: 'fanhua-shanghai', type: 'ip', name: '和平饭店', lng: 121.4906, lat: 31.2410, cluster: '黄浦·外滩', tier: 'A', durationNormal: 60, durationRush: 30, intro: '【待核对】', quotes: [], realPhoto: 'img/sh-04.jpg', skipNote: '【待填】' },
  { poiId: 'sh-05', lineId: 'fanhua-shanghai', type: 'ip', name: '进贤路', lng: 121.4613, lat: 31.2156, cluster: '静安', tier: 'B', durationNormal: 60, durationRush: 30, intro: '【待核对】', quotes: [], realPhoto: 'img/sh-05.jpg', skipNote: '【待填】' },
  { poiId: 'sh-06', lineId: 'fanhua-shanghai', type: 'ip', name: '国泰电影院', lng: 121.4586, lat: 31.2186, cluster: '静安·淮海路', tier: 'B', durationNormal: 45, durationRush: 20, intro: '【待核对】', quotes: [], realPhoto: 'img/sh-06.jpg', skipNote: '【待填】' },
  { poiId: 'sh-07', lineId: 'fanhua-shanghai', type: 'ip', name: '思南公馆', lng: 121.4690, lat: 31.2086, cluster: '黄浦·思南路', tier: 'A', durationNormal: 90, durationRush: 40, intro: '【待核对】', quotes: [], realPhoto: 'img/sh-07.jpg', skipNote: '【待填】' },
  { poiId: 'sh-08', lineId: 'fanhua-shanghai', type: 'ip', name: '复兴公园', lng: 121.4718, lat: 31.2097, cluster: '黄浦·思南路', tier: 'B', durationNormal: 60, durationRush: 30, intro: '【待核对】', quotes: [], realPhoto: 'img/sh-08.jpg', skipNote: '【待填】' },
  // —— 城市著名景点（classic，数组顺序即知名度排序）——
  { poiId: 'sh-c1', lineId: 'fanhua-shanghai', type: 'classic', name: '外滩', lng: 121.4900, lat: 31.2395, cluster: '黄浦·外滩', durationNormal: 90, durationRush: 40, intro: '【待核对】', quotes: [], realPhoto: 'img/sh-c1.jpg' },
  { poiId: 'sh-c2', lineId: 'fanhua-shanghai', type: 'classic', name: '豫园', lng: 121.4920, lat: 31.2270, cluster: '黄浦·城隍庙', durationNormal: 120, durationRush: 60, intro: '【待核对】', quotes: [], realPhoto: 'img/sh-c2.jpg' },
  { poiId: 'sh-c3', lineId: 'fanhua-shanghai', type: 'classic', name: '田子坊', lng: 121.4660, lat: 31.2090, cluster: '黄浦·思南路', durationNormal: 90, durationRush: 40, intro: '【待核对】', quotes: [], realPhoto: 'img/sh-c3.jpg' },
  { poiId: 'sh-c4', lineId: 'fanhua-shanghai', type: 'classic', name: '武康大楼', lng: 121.4400, lat: 31.2060, cluster: '徐汇·武康路', durationNormal: 30, durationRush: 15, intro: '【待核对】', quotes: [], realPhoto: 'img/sh-c4.jpg' },
]

// ========== 以下为查询逻辑（mock 实现） ==========

export function search(keyword) {
  const kw = (keyword || '').trim()
  if (!kw) return []
  const ip = ips.find((i) => i.aliases.includes(kw) || i.name.includes(kw))
  const matched = lines.filter(
    (l) => l.title.includes(kw) || l.city.includes(kw) || (ip && l.ipId === ip.ipId)
  )
  // 地名：命中 POI 名时，返回其所属路线
  const byPoi = pois.filter((p) => p.name.includes(kw)).map((p) => p.lineId)
  return lines.filter((l) => matched.includes(l) || byPoi.includes(l.lineId))
}

export function listColumns() {
  // 栏目：城市 / 人物 / 地名。同一张卡片可出现在多个栏目（只是分组方式不同）
  const l = lines[0]
  return {
    city: [{ label: '上海', lines: [l] }],
    figure: [{ label: '阿宝', lines: [l] }, { label: '汪小姐', lines: [l] }],
    place: [{ label: '黄河路', lines: [l] }, { label: '进贤路', lines: [l] }],
  }
}

export function getLineDetail(lineId) {
  const line = lines.find((l) => l.lineId === lineId)
  if (!line) throw new Error(`路线不存在: ${lineId}`)
  const ip = ips.find((i) => i.ipId === line.ipId)
  return { line, ip, pois: pois.filter((p) => p.lineId === lineId) }
}

/**
 * ⚠️ 假规划引擎，仅占位跑通页面流程。
 * 真引擎（片区聚类 / 时段折算 / 穷举排序 / 孤点效应）由前端引擎同学实现，
 * 对齐后把本函数替换为真实算法或后端接口，返回结构见 contract.md。
 */
export function plan({ poiIds, hoursPerDay }) {
  const checked = pois.filter((p) => poiIds.includes(p.poiId))
  const totalMin = checked.reduce((s, p) => s + p.durationNormal, 0)
  const capacityMin = 2 * hoursPerDay * 60 // mock 固定按 2 天容量算，TODO 接真引擎

  // 贪心按天切分（仅演示用）
  const days = []
  let cur = { day: 1, items: [] }
  let used = 0
  checked.forEach((p, idx) => {
    if (used + p.durationNormal > hoursPerDay * 60 && cur.items.length) {
      days.push(cur)
      cur = { day: days.length + 1, items: [] }
      used = 0
    }
    cur.items.push({ poiId: p.poiId, order: cur.items.length + 1, duration: p.durationNormal })
    used += p.durationNormal
  })
  if (cur.items.length) days.push(cur)

  let status = 'ok'
  let suggestions = []
  if (totalMin > capacityMin) {
    // 装不下：按 tier 从低到高建议舍弃（真引擎应叠加孤点效应）
    status = 'overload'
    suggestions = [...checked]
      .filter((p) => p.type === 'ip')
      .sort((a, b) => (TIER[a.tier] ?? 9) - (TIER[b.tier] ?? 9))
      .slice(0, 2)
      .map((p) => ({ poiId: p.poiId, reason: p.skipNote || `建议舍弃「${p.name}」` }))
  } else if (totalMin < capacityMin * 0.7) {
    // 用得太少：建议追加未勾选的点
    status = 'under70'
    suggestions = pois
      .filter((p) => !poiIds.includes(p.poiId))
      .slice(0, 3)
      .map((p) => ({ poiId: p.poiId, reason: `建议追加「${p.name}」` }))
  }

  return { days, status, suggestions, totalMin }
}
