<script setup>
/**
 * S5 行程结果页：单页布局。
 * 地图在上，逐日行程紧接在下方，直接下拉即可查看；底部附「导出·携程」区块。
 * 不再用 Tab 在地图 / 日程 / 导出之间切换页面。
 * S6 景点卡片浮层挂在地图上；时间轴点某站 → 地图滚回视野并开该点卡片。
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePlanStore } from '../stores/plan'
import MapContainer from '../components/MapContainer.vue'
import DayTimeline from '../components/DayTimeline.vue'
import PoiCardOverlay from '../components/PoiCardOverlay.vue'

const router = useRouter()
const store = usePlanStore()

const activePoi = ref(null)
const mapBox = ref(null)

const statusBadge = computed(() => {
  const r = store.result
  if (!r) return ''
  const map = {
    ok: '',
    overload: r.impossible
      ? '⚠️ 这趟走不完：即使全部压缩也排不下，建议减少点位或增加天数'
      : '⚠️ 超载行程：时间不够，已按你的取舍保留',
    under70: '✨ 宽松行程：还有时间可以再加'
  }
  return map[r.status] || ''
})

const pct = computed(() => Math.round((store.result?.usage ?? 0) * 100))

/** 时间轴点某站：弹出该点卡片，并把地图滚回视野。 */
function locatePoi(poiId) {
  activePoi.value = poiOf(poiId)
  mapBox.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function restartPlan() {
  store.reset()
  router.push(`/customize/${store.lineId}`)
}

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
        {{ store.line?.title }} · {{ store.result?.days.length }} 天 ·
        {{ store.checkedIds.length }} 个点
        <span class="usage">用掉 {{ pct }}%</span>
      </h1>
      <span v-if="statusBadge" class="badge">{{ statusBadge }}</span>
      <span class="spacer"></span>
      <router-link class="mini" :to="`/customize/${store.lineId}`"
        >继续修改</router-link
      >
      <button class="mini danger" @click="restartPlan">重新规划</button>
    </header>

    <!-- S5-a 地图 -->
    <section ref="mapBox" class="map-wrap" aria-label="行程地图">
      <MapContainer
        :pois="store.checkedPois"
        :selected-ids="store.checkedIds"
        :plan="store.result"
        :city="store.line?.city"
        :ip-name="store.ip?.name || ''"
        :active-poi-id="activePoi?.poiId || ''"
        :interactive="true"
        @marker-click="(id) => (activePoi = poiOf(id))"
      />
    </section>

    <!-- S5-b 逐日行程：紧接地图下方，下拉即达 -->
    <section class="itinerary-block" aria-label="逐日行程">
      <header class="section-head">
        <h2>逐日行程</h2>
        <p>点其中任一站，地图会定位并弹出该点卡片</p>
      </header>
      <DayTimeline
        :days="store.result?.days || []"
        :pois="store.pois"
        @locate="locatePoi"
      />
    </section>

    <!-- S5-c 导出·携程 -->
    <section class="export card-block" aria-label="导出·携程">
      <header class="section-head">
        <h2>导出 · 携程</h2>
        <p>行程单文字版如下，可直接复制或打印</p>
      </header>
      <pre class="itinerary">{{ itineraryText }}</pre>
      <div class="actions">
        <button class="btn-ghost" @click="exportImage">
          导出文字行程单图片
        </button>
        <!-- TODO：深链参数待验证（见执行方案风险表），先跳官网首页 -->
        <a
          class="btn"
          href="https://www.ctrip.com"
          target="_blank"
          rel="noopener"
          >行程定了，去携程订酒店和票 →</a
        >
      </div>
    </section>

    <PoiCardOverlay
      v-if="activePoi"
      :poi="activePoi"
      @close="activePoi = null"
      @view-detail="(id) => router.push(`/poi/${id}`)"
    />
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.back {
  color: var(--ink-2);
  font-size: 14px;
}
h1 {
  font-size: 18px;
}
.badge {
  font-size: 12px;
  color: var(--brand);
  background: var(--brand-light);
  border-radius: 999px;
  padding: 2px 12px;
}
.usage {
  font-size: 12px;
  color: var(--ink-2);
  font-weight: 400;
  margin-left: 6px;
}
.spacer {
  flex: 1;
}
.mini {
  font-size: 13px;
  color: var(--ink-2);
}
.mini.danger {
  color: var(--brand);
}
.map-wrap {
  height: 440px;
  margin-bottom: 26px;
}
.section-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.section-head h2 {
  font-family: serif;
  font-size: 20px;
  color: var(--brand);
}
.section-head p {
  font-size: 12px;
  color: var(--ink-2);
}
.itinerary-block {
  margin-bottom: 26px;
}
.card-block {
  background: #fff;
  border-radius: var(--card-radius);
  box-shadow: var(--shadow);
}
.export {
  padding: 20px;
}
.itinerary {
  background: var(--bg);
  border-radius: var(--card-radius);
  padding: 16px;
  font-family: monospace;
  font-size: 13px;
  white-space: pre-wrap;
  margin-bottom: 14px;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
