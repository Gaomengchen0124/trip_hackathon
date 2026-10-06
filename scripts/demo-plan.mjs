import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' })
const mock = await server.ssrLoadModule('/src/api/mock/index.js')
const { pois } = mock.getLineDetail('fanhua-shanghai')
const name = (id) => pois.find((p) => p.poiId === id)?.name || id

const show = (title, r) => {
  console.log(`\n${'━'.repeat(58)}\n${title}\n${'━'.repeat(58)}`)
  console.log(`状态 ${r.status}  利用率 ${(r.usage * 100).toFixed(0)}%  ${r.days.length} 天 / 建议 ${r.daysNeeded} 天`)
  for (const d of r.days) {
    console.log(`\n  Day ${d.day}  ${d.date}   用掉 ${Math.round(d.usedMin/6)/10}h / 可用 ${Math.round(d.availableMin/6)/10}h`)
    for (const it of d.items) {
      console.log(`    ${it.arrive}–${it.leave}  D${d.day}-${it.order}  ${name(it.poiId)}${it.mode === 'rush' ? '（压缩打卡）' : ''}`)
    }
  }
  if (r.message) console.log(`\n  ⚠️ ${r.message}`)
  if (r.suggestions.length) {
    console.log(`\n  建议（${r.suggestions[0].kind === 'drop' ? '舍弃' : '追加'}）：`)
    for (const s of r.suggestions.slice(0, 6)) {
      console.log(`    ${s.mustDrop ? '【必砍】' : '　　　'}${s.name}  ${s.reason}`)
    }
  }
}

const TR2 = { startDate: '2026-11-01', startSlot: '上午', endDate: '2026-11-02', endSlot: '晚上' }
const ONE = { startDate: '2026-11-01', startSlot: '上午', endDate: '2026-11-01', endSlot: '晚上' }

show('场景 A：2 天 · 选 6 个点（3 个原著点 + 3 个城市景点）',
  mock.plan({ lineId: 'fanhua-shanghai', timeRange: TR2, hoursPerDay: 8,
    poiIds: ['sh-ip-01','sh-ip-06','sh-ip-07','sh-sp-01','sh-sp-04','sh-sp-07'] }))

show('场景 B：3 天 · 全选 23 个点',
  mock.plan({ lineId: 'fanhua-shanghai', timeRange: { ...TR2, endDate: '2026-11-03' }, hoursPerDay: 8,
    poiIds: pois.map((p) => p.poiId) }))

show('场景 C：1 天 · 全选 23 个点（触发取舍）',
  mock.plan({ lineId: 'fanhua-shanghai', timeRange: ONE, hoursPerDay: 8,
    poiIds: pois.map((p) => p.poiId) }))

await server.close()
