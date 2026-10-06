<script setup>
/**
 * S5 行程结果页：Tab 容器（地图 / 日程 / 导出·携程）
 * S6 景点卡片浮层挂在地图 Tab 上。
 */
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlanStore } from '../stores/plan'
import MapContainer from '../components/MapContainer.vue'
import PoiCardOverlay from '../components/PoiCardOverlay.vue'

const route = useRoute()
const router = useRouter()
const store = usePlanStore()

const TABS = [
  { key: 'map', label: '地图' },
  { key: 'day', label: '日程' },
  { key: 'export', label: '导出·携程' },
]

const activePoi = ref(null)
const tab = computed(() => route.params.tab)

const statusBadge = computed(() => {
  const r = store.result
  if (!r) return ''
  const map = {
    ok: '',
    overload: r.impossible
      ? '⚠️ 这趟走不完：即使全部压缩也排不下，建议减少点位或增加天数'
      : '⚠️ 超载行程：时间不够，已按你的取舍保留',
    under70: '✨ 宽松行程：还有时间可以再加',
  }
  return map[r.status] || ''
})

const pct = computed(() => Math.round((store.result?.usage ?? 0) * 100))

function poiOf(poiId) {
  return store.pois.find((p) => p.poiId === poiId)
}

const itineraryText = computed(() => {
  const r = store.result
  const lines = [`${store.line?.title || ''} 行程单`, '']
  r?.days.forEach((d) => {
    lines.push(`Day ${d.day}  （${d.date}）`)
    d.items.forEach((it) => {
      const name = poiOf(it.poiId)?.name || it.poiId
      const tag = it.mode === 'rush' ? '（打卡）' : ''
      lines.push(`  ${it.arrive} → ${it.leave}  ${name}${tag}`)
    })
    lines.push('')
  })
  if (r?.message) lines.push(r.message)
  return lines.join('\n')
})

function exportImage() {
  // TODO：换 Canvas 生成行程单图片；先用打印兜底
  window.print()
}
</script>

<template>
  <div class="page">
    <header class="bar">
      <button class="back" @click="router.back()">← 返回</button>
      <h1>
        {{ store.line?.title }} · {{ store.result?.days.length }} 天 · {{ store.checkedIds.length }} 个点
        <span class="usage">用掉 {{ pct }}%</span>
      </h1>
      <span v-if="statusBadge" class="badge">{{ statusBadge }}</span>
    </header>

    <nav class="tabs">
      <router-link
        v-for="t in TABS" :key="t.key"
        :to="`/result/${t.key}`"
        class="tab" :class="{ on: tab === t.key }"
      >{{ t.label }}</router-link>
      <span class="spacer"></span>
      <router-link class="mini" :to="`/customize/${store.lineId}`">继续修改</router-link>
      <button class="mini danger" @click="store.reset(); router.push(`/customize/${store.lineId}`)">重新规划</button>
    </nav>

    <!-- S5-a 地图 -->
    <template v-if="tab === 'map'">
      <div class="map-wrap">
        <MapContainer
          :pois="store.checkedPois"
          :selected-ids="store.checkedIds"
          :plan="store.result"
          :city="store.line?.city"
          :interactive="true"
          @marker-click="(id) => (activePoi = poiOf(id))"
        />
      </div>
      <PoiCardOverlay
        v-if="activePoi"
        :poi="activePoi"
        @close="activePoi = null"
        @view-detail="(id) => router.push(`/poi/${id}`)"
      />
    </template>

    <!-- S5-b 日程 -->
    <ol v-else-if="tab === 'day'" class="timeline">
      <li v-for="d in store.result?.days" :key="d.day" class="day">
        <h3>
          Day {{ d.day }}
          <span class="date">{{ d.date }}</span>
          <span class="cap">用掉 {{ Math.round(d.usedMin / 6) / 10 }}h / 可用 {{ Math.round(d.availableMin / 6) / 10 }}h</span>
        </h3>
        <button
          v-for="it in d.items" :key="it.poiId"
          class="stop" :class="{ rush: it.mode === 'rush' }"
          @click="router.push(`/poi/${it.poiId}`)"
        >
          <span class="no">D{{ d.day }}-{{ it.order }}</span>
          <span class="clock">{{ it.arrive }}–{{ it.leave }}</span>
          <span class="name">{{ poiOf(it.poiId)?.name }}</span>
          <span class="dur">{{ it.duration }}min{{ it.mode === 'rush' ? ' · 压缩' : '' }}</span>
        </button>
      </li>
    </ol>

    <!-- S5-c 导出·携程 -->
    <section v-else class="export card-block">
      <pre class="itinerary">{{ itineraryText }}</pre>
      <div class="actions">
        <button class="btn-ghost" @click="exportImage">导出文字行程单图片</button>
        <!-- TODO：深链参数待验证（见执行方案风险表），先跳官网首页 -->
        <a class="btn" href="https://www.ctrip.com" target="_blank" rel="noopener">行程定了，去携程订酒店和票 →</a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.back { color: var(--ink-2); font-size: 14px; }
h1 { font-size: 18px; }
.badge { font-size: 12px; color: var(--brand); background: var(--brand-light); border-radius: 999px; padding: 2px 12px; }
.usage { font-size: 12px; color: var(--ink-2); font-weight: 400; margin-left: 6px; }
.tabs { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.tab { padding: 8px 18px; border-radius: 999px; background: #fff; font-size: 14px; box-shadow: var(--shadow); }
.tab.on { background: var(--brand); color: #fff; }
.spacer { flex: 1; }
.mini { font-size: 13px; color: var(--ink-2); }
.mini.danger { color: var(--brand); }
.map-wrap { height: 420px; }
.timeline { list-style: none; }
.day { background: #fff; border-radius: var(--card-radius); box-shadow: var(--shadow); padding: 16px; margin-bottom: 12px; }
.day h3 { font-size: 16px; margin-bottom: 8px; }
.date { font-size: 12px; color: var(--ink-2); font-weight: 400; margin-left: 6px; }
.cap { float: right; font-size: 12px; color: var(--ink-2); font-weight: 400; }
.clock { font-size: 12px; color: var(--ink-2); white-space: nowrap; }
.stop {
  display: flex; gap: 10px; width: 100%; align-items: center;
  padding: 10px 4px; border-bottom: 1px solid var(--line); font-size: 14px; text-align: left;
}
.stop:last-child { border-bottom: none; }
.no { font-size: 11px; color: var(--brand); background: var(--brand-light); border-radius: 4px; padding: 1px 6px; }
.name { flex: 1; }
.dur { font-size: 12px; color: var(--ink-2); }
.stop.rush .dur { color: #c99a2c; }
.card-block { background: #fff; border-radius: var(--card-radius); box-shadow: var(--shadow); }
.export { padding: 16px; }
.itinerary {
  background: var(--bg); border-radius: var(--card-radius); padding: 16px;
  font-family: monospace; font-size: 13px; white-space: pre-wrap; margin-bottom: 14px;
}
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
</style>
