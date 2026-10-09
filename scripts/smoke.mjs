// 端到端冒烟测试：用 Vite 真加载 src/api/mock/index.js，走一遍页面会走的调用。
// 用法：npm run smoke
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'silent',
})

let failed = 0
const check = (label, cond, extra = '') => {
  console.log(`  ${cond ? '✅' : '❌'} ${label}${extra ? '  ' + extra : ''}`)
  if (!cond) failed++
}
const fmtH = (min) => `${Math.round(min / 6) / 10}h`

try {
  const mock = await server.ssrLoadModule('/src/api/mock/index.js')

  console.log('\n【数据装载】')
  const index = JSON.parse(readFileSync('data/lines/index.json', 'utf8'))
  check(`首页目录 ${index.lines.length} 条线全部装载`, mock.lines.length === index.lines.length,
    mock.lines.map((l) => l.title).join('、'))
  check('繁花排第一（主推）', mock.lines[0].lineId === 'fanhua-shanghai')
  const totalPois = mock.lines.reduce((n, l) => n + mock.getLineDetail(l.lineId).pois.length, 0)
  check('点位总数 = 各线之和', mock.pois.length === totalPois, `${mock.pois.length} 个`)

  console.log('\n【端点 2 · 首页栏目（按城市）】')
  const cols = mock.listColumns()
  check('只保留城市栏', Object.keys(cols).join() === 'city', Object.keys(cols).join(' / '))
  check('城市栏有内容', cols.city.length > 0, `${cols.city.length} 个城市`)
  const groupOf = (lineId) =>
    cols.city.find((g) => g.lines.some((l) => l.lineId === lineId))?.label
  check('北京三条线归到同一组', ['woyuditan-beijing', 'santi-beijing', 'longzu-beijing']
    .every((id) => groupOf(id) === '北京'),
    ['woyuditan-beijing', 'santi-beijing', 'longzu-beijing'].map(groupOf).join(' / '))
  check('同一城市只出现一组',
    new Set(cols.city.map((g) => g.label)).size === cols.city.length)
  const ids = cols.city.flatMap((g) => g.lines.map((l) => l.lineId))
  check('每条线只出现一次', new Set(ids).size === ids.length,
    `${ids.length} 张卡 / ${new Set(ids).size} 条线`)

  console.log('\n【端点 1 · 搜索】')
  check('搜「繁花」命中主线', mock.search('繁花')[0]?.lineId === 'fanhua-shanghai')
  check('搜「黄河路」命中（地名标签）', mock.search('黄河路').length === 1)
  check('搜「汪小姐」命中（人物标签）', mock.search('汪小姐').length === 1)
  check('搜「龙族」命中两条', mock.search('龙族').length === 2)
  check('搜「原神」返回空（页面显示"暂未收录"）', mock.search('原神').length === 0)
  check('搜「东方明珠」命中（上海两条线共享的城市景点）', mock.search('东方明珠').length === 2)
  check('搜「曹杨新村」命中（IP 点名）', mock.search('曹杨新村').length === 1)
  check('搜「哈利波特」命中伦敦线', mock.search('哈利波特')[0]?.lineId === 'harrypotter-london')
  check('搜「地坛」命中北京文学线', mock.search('地坛')[0]?.lineId === 'woyuditan-beijing')

  console.log('\n【端点 3 · 路线详情】')
  const detail = mock.getLineDetail('fanhua-shanghai')
  check('返回 8 个 IP 点 + 19 个城市景点', detail.pois.length === 27)
  check('IP 点带 tier', detail.pois.filter((p) => p.type === 'ip').every((p) => p.tier))
  check('城市景点带 popularity', detail.pois.filter((p) => p.type === 'classic').every((p) => p.popularity))
  const pending = detail.pois.filter((p) => p.name.includes('【') || p.cluster.includes('【')).length
  check('繁花 27 个点位已全部填写（无占位）', pending === 0, `剩余占位 ${pending}`)
  check('每个 IP 点都有带出处的原著引文',
    detail.pois.filter((p) => p.type === 'ip').every((p) => p.quotes?.length && p.quotes.every((q) => q.source && q.full)))

  const idOf = (name) => detail.pois.find((p) => p.name.includes(name))?.poiId
  const TR = { startDate: '2026-11-01', startSlot: '上午', endDate: '2026-11-02', endSlot: '晚上' }
  const ONE_DAY = { startDate: '2026-11-01', startSlot: '上午', endDate: '2026-11-01', endSlot: '晚上' }

  console.log('\n【端点 4 · 规划】')
  const near = ['sh-ip-01', 'sh-ip-02', 'sh-sp-01', 'sh-sp-03']
  const r1 = await mock.plan({ lineId: 'fanhua-shanghai', poiIds: near, timeRange: ONE_DAY, hoursPerDay: 8 })
  check('1 天装 4 个近点（6h / 8h）→ ok', r1.status === 'ok', `利用率 ${(r1.usage * 100).toFixed(0)}%`)
  check('返回了 arrive / leave 时间轴', r1.days[0]?.items[0]?.arrive?.includes(':'),
    `${r1.days[0]?.items[0]?.arrive}–${r1.days[0]?.items[0]?.leave}`)
  check('每天带可用/已用分钟', r1.days[0]?.availableMin > 0 && r1.days[0]?.usedMin > 0)

  const r2 = await mock.plan({ lineId: 'fanhua-shanghai', poiIds: detail.pois.map((p) => p.poiId), timeRange: { ...TR, endDate: '2026-11-01' }, hoursPerDay: 8 })
  check('1 天塞 27 个点 → overload', r2.status === 'overload', r2.message || '')
  check('给出舍弃建议并标出必砍', r2.suggestions.some((s) => s.mustDrop))
  check('孤点效应生效（远的点省得最多）',
    (r2.suggestions[0]?.savesMinutes ?? 0) > 0,
    r2.suggestions[0] ? `${r2.suggestions[0].name}: ${r2.suggestions[0].reason}` : '')

  const r3 = await mock.plan({ lineId: 'fanhua-shanghai', poiIds: ['sh-sp-01', 'sh-sp-02'], timeRange: { ...TR, endDate: '2026-11-01' }, hoursPerDay: 8 })
  check('1 天只勾 2 个点 → under70', r3.status === 'under70', `利用率 ${(r3.usage * 100).toFixed(0)}%`)
  check('追加建议非空', r3.suggestions.length > 0)

  console.log('\n【S4 协商后重算】')
  const kept = detail.pois.map((p) => p.poiId).filter((id) => !r2.suggestions.filter((s) => s.mustDrop).map((s) => s.poiId).includes(id))
  const r4 = await mock.plan({ lineId: 'fanhua-shanghai', poiIds: kept, timeRange: { ...TR, endDate: '2026-11-02' }, hoursPerDay: 10 })
  check('砍掉必砍点后重算 → ok 或 under70', r4.status !== 'overload',
    `剩 ${kept.length} 个点 · 利用率 ${(r4.usage * 100).toFixed(0)}% · 需 ${r4.daysNeeded} 天`)
  check('总用时与可用时间自洽', r4.totalMin <= r4.totalAvailableMin,
    `${fmtH(r4.totalMin)} / ${fmtH(r4.totalAvailableMin)}`)
} finally {
  await server.close()
}

console.log('\n' + (failed ? `❌ ${failed} 项没过` : '✅ 冒烟测试全过') + '\n')
process.exit(failed ? 1 : 0)
