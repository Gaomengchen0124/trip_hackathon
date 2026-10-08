import { createServer } from 'vite'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'silent',
})

const load = (p) => server.ssrLoadModule(p)
const { usePlanStore } = await load('/src/stores/plan.js')

const App = (await load('/src/App.vue')).default
const HomeView = (await load('/src/views/HomeView.vue')).default
const CustomizeView = (await load('/src/views/CustomizeView.vue')).default
const ResultView = (await load('/src/views/ResultView.vue')).default
const DetailView = (await load('/src/views/DetailView.vue')).default
const ColumnListView = (await load('/src/views/ColumnListView.vue')).default

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/column/:key', name: 'column', component: ColumnListView },
  { path: '/customize/:lineId', name: 'customize', component: CustomizeView },
  { path: '/result/:tab', name: 'result', component: ResultView },
  { path: '/poi/:poiId', name: 'poi-detail', component: DetailView },
]

const results = []
const check = (name, cond, extra = '') => {
  results.push(`${cond ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`)
  return cond
}

async function render(path, { seed } = {}) {
  const pinia = createPinia()
  const router = createRouter({ history: createMemoryHistory(), routes })
  const app = createSSRApp(App, {})
  app.use(pinia)
  app.use(router)
  const store = usePlanStore(pinia)
  if (seed) await seed(store, pinia)
  await router.push(path)
  await router.isReady()
  return { html: await renderToString(app), store }
}

// ---- 1. 首页 ----
{
  const { html } = await render('/')
  check('首页渲染', html.includes('我的圣地巡礼'))
  check('首页搜索框在', html.includes('搜书名'))
}

// ---- 2. 定制页（真实 loadLine） ----
{
  const { html, store } = await render('/customize/fanhua-shanghai', {
    seed: (s) => s.loadLine('fanhua-shanghai'),
  })
  check('路线加载成功', store.line?.title === '繁花·上海', store.line?.title)
  check('候选点 23 个', store.pois.length === 23, String(store.pois.length))
  check('IP 点 8 个 / 城市景点 15 个',
    store.ipPois.length === 8 && store.classicPois.length === 15,
    `${store.ipPois.length}/${store.classicPois.length}`)
  check('IP 点按 S>A>B 排序', store.ipPois[0]?.tier === 'S')
  check('城市景点按知名度降序', store.classicPois[0]?.popularity === 5)
  check('定制页渲染出双栏', html.includes('圣地巡礼') && html.includes('其他知名景点'))
  check('时间条渲染', html.includes('开始') && html.includes('结束'))
  check('勾选列表带原文引文点（S 级在前）', html.includes('国泰电影院'))
}

// ---- 3. 完整规划：2 天 6 点 ----
{
  const { html, store } = await render('/result/map', {
    seed: async (s) => {
      await s.loadLine('fanhua-shanghai')
      ;['sh-ip-01', 'sh-ip-06', 'sh-ip-07', 'sh-sp-01', 'sh-sp-04', 'sh-sp-07'].forEach(s.togglePoi)
      s.setTimeRange({ startDate: '2026-11-01', endDate: '2026-11-02' })
      await s.submit()
    },
  })
  const r = store.result
  check('规划返回成功', !!r, r?.status)
  check('状态 under70', r.status === 'under70', r.status)
  check('两天行程', r.days.length === 2)
  check('有 arrive/leave 时间轴', /^\d{2}:\d{2}$/.test(r.days[0].items[0].arrive), r.days[0].items[0].arrive)
  check('地图 Tab 渲染 D1 编号', html.includes('D1-1'))
  check('结果页渲染标题', html.includes('繁花·上海'))
}

// ---- 4. 装不下 → 取舍抽屉 ----
{
  const { store } = await render('/customize/fanhua-shanghai', {
    seed: async (s) => {
      await s.loadLine('fanhua-shanghai')
      s.pois.forEach((p) => s.togglePoi(p.poiId))
      s.setTimeRange({ startDate: '2026-11-01', endDate: '2026-11-01' })
      await s.submit()
    },
  })
  check('1 天全选 → overload', store.result.status === 'overload', store.result.status)
  check('给出舍弃建议', store.result.suggestions.length > 0, String(store.result.suggestions.length))
  check('标出必砍点', store.result.suggestions.some((x) => x.mustDrop))
  const sug = store.result.suggestions
  const shortage = store.result.shortage ?? 0
  const drop = new Set()
  let saved = 0
  for (const s of [...sug].sort((a, b) => (b.savesMinutes || 0) - (a.savesMinutes || 0))) {
    if (saved >= shortage) break
    drop.add(s.poiId)
    saved += s.savesMinutes || 0
  }
  check('按抽屉规则砍够了', saved >= shortage, `省 ${saved}min / 缺 ${shortage}min`)
  const kept = store.checkedIds.filter((id) => !drop.has(id))
  const r2 = await store.applyTradeoff(kept)
  check('砍完后重算不再是 overload', r2.status !== 'overload', r2.status)
  check('勾选状态同步为保留列表', store.checkedIds.length === kept.length, `${store.checkedIds.length}`)
}

// ---- 5. 详情页（原著引文） ----
{
  const { html } = await render('/poi/sh-ip-01', {
    seed: (s) => s.loadLine('fanhua-shanghai'),
  })
  check('详情页渲染景点名', html.includes('国泰电影院'))
  check('详情页渲染原著引文', html.includes('摩雅傣'))
  check('详情页标注出处', html.includes('第1章'))
}

// ---- 6. 栏目页 ----
{
  const { html } = await render('/column/city')
  check('栏目页渲染（圣地巡礼）', html.includes('圣地巡礼'))
}

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('❌')).length
console.log(`\n${failed === 0 ? '✅ 全部通过' : `❌ ${failed} 项失败`}  共 ${results.length} 项`)
await server.close()
process.exit(failed === 0 ? 0 : 1)
