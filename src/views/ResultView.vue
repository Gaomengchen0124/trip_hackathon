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
import YoyoBuddy from '../components/ui/YoyoBuddy.vue'
import { formatMinutes } from '../utils/travel-ui'
import { itineraryText as makeItineraryText, downloadItinerary } from '../utils/itinerary-export.mjs'

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
    under70: ''
  }
  return map[r.status] || ''
})

const pct = computed(() => Math.round((store.result?.usage ?? 0) * 100))

/** 时间轴点某站：弹出该点卡片，并把地图滚回视野。 */
function locatePoi(poiId) {
  activePoi.value = poiOf(poiId)
  mapBox.value?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
}

function restartPlan() {
  store.reset()
  router.push(`/customize/${store.lineId}`)
}

function poiOf(poiId) {
  return store.pois.find((p) => p.poiId === poiId)
}

const itineraryText = computed(() => makeItineraryText(store.line?.title, store.result, store.pois))
const exportBusy = ref(false)
const feedback = ref('')
const statusTitle = computed(() => ({ ok: '较充实', under70: '较宽松', overload: '较匆忙' }[store.result?.status] || '行程概览'))
const stats = computed(() => {
  const r = store.result || {}
  return [
    ['可用时间', formatMinutes(r.totalAvailableMin ?? (r.days || []).reduce((n,d) => n + (d.availableMin || 0), 0))],
    ['行程用时（含交通）', formatMinutes(r.totalMin ?? (r.days || []).reduce((n,d) => n + (d.usedMin || 0), 0))],
    ['时间利用率', `${pct.value}%`],
    ['需要天数', `${r.daysNeeded ?? r.days?.length ?? 0} 天`]
  ]
})
async function copyText() {
  try { await navigator.clipboard.writeText(itineraryText.value); feedback.value = '行程文本已复制。' }
  catch { feedback.value = '自动复制不可用，请在下方文本框中选择并复制。' }
}
async function exportImage() {
  exportBusy.value = true; feedback.value = ''
  try { await downloadItinerary(itineraryText.value, store.line?.title); feedback.value = '行程单图片已生成；较长行程会按页下载。' }
  catch (error) { feedback.value = error.message || '图片生成失败，请重试。' }
  finally { exportBusy.value = false }
}
</script>

<template>
  <div class="page atlas-result">
    <header class="bar">
      <button class="back" @click="router.back()">← 返回</button>
      <h1>
        {{ store.line?.title }} · {{ store.result?.days.length }} 天 ·
        {{ store.checkedIds.length }} 个点
        <span class="usage">用掉 {{ pct }}%</span>
      </h1>

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

    <section class="plan-summary card-block" aria-label="行程概览">
      <div class="summary-heading"><YoyoBuddy :state="statusBadge ? 'empty' : 'success'" :size="64" :message="statusBadge ? '可以减少几个地点，或多留一点时间。' : '行程已整理好，带着喜欢的故事出发吧！'" /><div><span class="yoyo-note">{{ statusBadge ? 'YOYO · 一起调整行程节奏' : 'YOYO · 行程已整理' }}</span><h2>{{ statusTitle }}</h2></div></div>
      <p v-if="statusBadge">{{ statusBadge }}</p>
      <p v-if="store.result?.message">{{ store.result.message }}</p>
      <p v-if="store.result?.compressed">已按重要度压缩部分点位停留时间。</p>
      <div class="plan-stats"><div v-for="[label,value] in stats" :key="label"><strong>{{ value }}</strong><span>{{ label }}</span></div></div>
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

    <section v-if="store.result?.suggestions?.length" class="plan-summary card-block" aria-label="行程建议">
      <h2>{{ store.result.status === 'overload' ? '取舍建议' : '顺路追加' }}</h2>
      <div v-for="(suggestion,index) in store.result.suggestions" :key="suggestion.poiId || index" class="suggestion-row"><strong>{{ suggestion.name || poiOf(suggestion.poiId)?.name || '行程建议' }}</strong><p>{{ suggestion.reason }}</p></div>
      <router-link class="mini" :to="`/customize/${store.lineId}`">回到定制页调整 →</router-link>
    </section>

    <!-- S5-c 导出·携程 -->
    <section class="export card-block" aria-label="导出·携程">
      <header class="section-head">
        <h2>导出 · 携程</h2>
        <p>复制文字、保存行程图片，或前往携程预订。</p>
      </header>
      <textarea class="itinerary" readonly aria-label="行程单文本" :value="itineraryText" rows="10"></textarea>
      <p role="status">{{ feedback }}</p>
      <div class="actions">
        <button class="btn-ghost" @click="copyText">复制行程文本</button>
        <button class="btn-ghost" :disabled="exportBusy" @click="exportImage">{{ exportBusy ? '正在生成…' : '导出行程单图片' }}</button>
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
.summary-heading{display:flex;align-items:center;gap:14px;margin-bottom:12px}.summary-heading h2{margin:3px 0 0}.yoyo-note{font-size:12px;color:var(--ink-2)}

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
  font-family: Georgia, "Songti SC", serif;
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
  box-sizing: border-box;
  width: 100%;
  color: var(--ink);
  border: 1px solid var(--line);
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
.plan-summary { padding: 20px; margin-bottom: 22px; }
.plan-summary h2 { font-size: 21px; margin-bottom: 10px; }
.plan-summary p { color: var(--ink-2); margin: 8px 0; }
.plan-stats { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 14px; margin-top: 18px; }
.plan-stats strong,.plan-stats span { display:block; }
.plan-stats strong { font-size:20px; }
.plan-stats span { color:var(--ink-2);font-size:12px;margin-top:4px; }
.suggestion-row { border-bottom:1px solid var(--line);padding:12px 0; }
@media(max-width:600px) { .plan-stats {grid-template-columns:repeat(2,minmax(0,1fr));} .map-wrap {height:340px;} }
</style>
