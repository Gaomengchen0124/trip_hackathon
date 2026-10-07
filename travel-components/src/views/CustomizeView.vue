<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlanStore } from '../stores/plan'
import MapContainer from '../components/MapContainer.vue'
import TimeBar from '../components/TimeBar.vue'
import PoiCheckList from '../components/PoiCheckList.vue'
import TradeoffDrawer from '../components/TradeoffDrawer.vue'
import {
  validateTimeRange,
  validateSelection,
  applyTradeoff
} from '../utils/travel-ui'
const route = useRoute()
const router = useRouter()
const store = usePlanStore()
const drawerStatus = ref(null)
const hoverInfo = ref('')
const loading = ref(false)
const planning = ref(false)
const error = ref('')
const drawerError = ref('')
// Returning from results keeps selections; a different line loads fresh data.
watch(
  () => route.params.lineId,
  async (id) => {
    if (!id || (store.lineId === id && store.line)) return
    loading.value = true
    error.value = ''
    try {
      await store.loadLine(id)
    } catch {
      error.value = '路线加载失败，请返回首页后重试。'
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)
const sortedIp = computed(() => {
  const weights = { S: 0, A: 1, B: 2 }
  return [...store.ipPois].sort(
    (a, b) => (weights[a.tier] ?? 9) - (weights[b.tier] ?? 9)
  )
})
const validation = computed(
  () =>
    validateTimeRange(store.timeRange, store.hoursPerDay) ||
    validateSelection(store.pois, store.checkedIds)
)
const canSubmit = computed(
  () =>
    !loading.value &&
    store.lineId === route.params.lineId &&
    !validation.value &&
    !planning.value
)
async function recalculate() {
  // Keep the existing one-second planning feedback without changing the engine.
  const [status] = await Promise.all([
    store.submit(),
    new Promise((resolve) => setTimeout(resolve, 1000))
  ])
  if (!['ok', 'overload', 'under70'].includes(status))
    throw new Error('Invalid planning status')
  return status
}
function showResult(status) {
  if (status === 'ok') {
    drawerStatus.value = null
    router.push('/result/map')
  } else drawerStatus.value = status
}
async function submit() {
  if (!canSubmit.value) return
  planning.value = true
  error.value = ''
  drawerError.value = ''
  const previousResult = store.result
  try {
    showResult(await recalculate())
  } catch {
    store.result = previousResult
    error.value = '规划失败，已保留当前选择，请重试。'
  } finally {
    planning.value = false
  }
}
function onMarkerHover(id) {
  const poi = store.pois.find((p) => p.poiId === id)
  hoverInfo.value = poi
    ? `${poi.name} · ${poi.type === 'ip' ? store.ip?.name || '' : '城市景点'}`
    : ''
}
async function onConfirmed(status, choice) {
  if (planning.value || status !== drawerStatus.value || !choice) return
  if (choice.action === 'keep') {
    drawerStatus.value = null
    router.push('/result/map')
    return
  }
  if (choice.action !== 'apply') return
  const allowed = new Set((store.result?.suggestions || []).map((s) => s.poiId))
  const picked = (choice.poiIds || []).filter((id) => allowed.has(id))
  if (!picked.length) return
  const next = applyTradeoff(store.checkedIds, picked, status, store.pois)
  const invalid = validateSelection(store.pois, next)
  if (invalid) {
    drawerError.value = invalid
    return
  }
  const previous = { ids: [...store.checkedIds], result: store.result }
  planning.value = true
  drawerError.value = ''
  store.checkedIds = next
  try {
    showResult(await recalculate())
  } catch {
    store.checkedIds = previous.ids
    store.result = previous.result
    drawerError.value = '重新规划失败，已恢复原选择，请重试。'
  } finally {
    planning.value = false
  }
}
</script>
<template>
  <div class="page">
    <header class="bar">
      <button
        type="button"
        class="back"
        :disabled="planning"
        @click="router.push('/')"
      >
        ← 首页
      </button>
      <h1>{{ loading ? '加载中…' : store.line?.title || '行程定制' }}</h1>
      <span v-if="hoverInfo" class="hover-info">{{ hoverInfo }}</span>
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="map-wrap">
      <MapContainer
        :pois="store.pois"
        :selected-ids="store.checkedIds"
        :interactive="!planning && !loading"
        @marker-hover="onMarkerHover"
        @marker-click="onMarkerHover"
      />
    </div>
    <TimeBar
      v-model:time-range="store.timeRange"
      v-model:hours-per-day="store.hoursPerDay"
      :disabled="planning || loading"
    />
    <div class="cols">
      <PoiCheckList
        title="IP 打卡点"
        :pois="sortedIp"
        :checked-ids="store.checkedIds"
        :disabled="planning || loading"
        @toggle="store.togglePoi"
      /><PoiCheckList
        title="城市著名景点"
        :pois="store.classicPois"
        :checked-ids="store.checkedIds"
        :disabled="planning || loading"
        @toggle="store.togglePoi"
      />
    </div>
    <footer class="submit-bar">
      <span class="stat" aria-live="polite"
        >已选 {{ store.checkedIds.length }} 个点 · 每天
        {{ store.hoursPerDay }} 小时</span
      ><button
        type="button"
        class="btn"
        :disabled="!canSubmit"
        :aria-busy="planning"
        @click="submit"
      >
        {{ planning ? '规划中…' : '生成行程' }}
      </button>
    </footer>
    <p v-if="validation" class="tip">{{ validation }}</p>
    <TradeoffDrawer
      v-if="drawerStatus"
      :status="drawerStatus"
      :busy="planning"
      :error="drawerError"
      @close="drawerStatus = null"
      @confirmed="onConfirmed"
    />
  </div>
</template>
<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.back {
  color: var(--ink-2);
  font-size: 14px;
}
h1 {
  font-size: 20px;
}
.hover-info {
  font-size: 13px;
  color: var(--brand);
  background: var(--brand-light);
  border-radius: 999px;
  padding: 2px 12px;
}
.map-wrap {
  height: 320px;
  margin-bottom: 12px;
}
.cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  margin-top: 12px;
}
.submit-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
  background: var(--bg);
  margin-top: 16px;
  border-top: 1px solid var(--line);
}
.stat {
  font-size: 13px;
  color: var(--ink-2);
}
.submit-bar .btn {
  white-space: nowrap;
  padding: 10px 20px;
}
.tip {
  font-size: 12px;
  color: var(--ink-2);
  text-align: right;
}
.error {
  font-size: 13px;
  color: var(--brand);
  background: var(--brand-light);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
@media (max-width: 720px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
button:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 3px;
}
</style>
