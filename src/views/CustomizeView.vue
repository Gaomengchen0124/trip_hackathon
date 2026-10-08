<script setup>
/**
 * S3 行程定制页：地图 + 时间窄条 + 双栏勾选 + 提交（S4 抽屉挂在提交流程上）
 *
 * 组件来自 travel-components 交付包；契约按当前引擎（contract.md）：
 *   submit()/applyTradeoff() → PlanResult{ status: ok | overload | under70 }
 *   ok / under70 都能进结果页，只有 overload 必须先在抽屉里砍够（或允许超载）。
 */
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlanStore } from '../stores/plan'
import MapContainer from '../components/MapContainer.vue'
import TimeBar from '../components/TimeBar.vue'
import PoiCheckList from '../components/PoiCheckList.vue'
import TradeoffDrawer from '../components/TradeoffDrawer.vue'
import { validateTimeRange, validateSelection } from '../utils/travel-ui'

const route = useRoute()
const router = useRouter()
const store = usePlanStore()

const drawerStatus = ref(null) // 'overload' | 'under70' | null
const hoverInfo = ref('')
const loading = ref(false)
const planning = ref(false)
const error = ref('')
const drawerError = ref('')

// 结果页返回时保留勾选；换一条线才重新加载。
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

// 圣地巡礼点按 tier 排序；其他知名景点按数组顺序（知名度）
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

const STATUSES = ['ok', 'overload', 'under70']

/** 跑一次引擎；带一个最短 800ms 的"规划中…"反馈。 */
async function recalculate(run) {
  const [result] = await Promise.all([
    run(),
    new Promise((resolve) => setTimeout(resolve, 800))
  ])
  if (!result || !STATUSES.includes(result.status))
    throw new Error('Invalid planning status')
  return result
}

function goResult() {
  drawerStatus.value = null
  router.push('/result/map')
}

/** 首次提交：ok 直接进结果页；overload / under70 都先弹抽屉给建议。 */
function showResult(status) {
  if (status === 'ok') goResult()
  else drawerStatus.value = status
}

async function submit() {
  if (!canSubmit.value) return
  planning.value = true
  error.value = ''
  drawerError.value = ''
  const previousResult = store.result
  try {
    showResult((await recalculate(() => store.submit())).status)
  } catch {
    store.result = previousResult
    error.value = '规划失败，已保留当前选择，请重试。'
  } finally {
    planning.value = false
  }
}

function onMarkerHover(poiId) {
  const p = store.pois.find((x) => x.poiId === poiId)
  hoverInfo.value = p
    ? `${p.name} · ${p.type === 'ip' ? store.ip?.name || '' : '其他知名景点'}`
    : ''
}

/**
 * S4 抽屉协商完 → 按"最终保留"的点重算一次。
 * force = 不重算，直接带着当前结果出结果页（overload 的"允许超载"）。
 */
async function onConfirmed({ poiIds, force = false } = {}) {
  if (planning.value) return
  if (force) {
    drawerStatus.value = null
    router.push('/result/map')
    return
  }
  const next = [...new Set(poiIds || [])]
  const invalid = validateSelection(store.pois, next)
  if (invalid) {
    drawerError.value = invalid
    return
  }
  const previous = { ids: [...store.checkedIds], result: store.result }
  planning.value = true
  drawerError.value = ''
  try {
    const result = await recalculate(() => store.applyTradeoff(next))
    // 抽屉里协商完：装得下或富余都放行；只有还是超载才把抽屉留着继续砍。
    if (result.status === 'ok' || result.status === 'under70') goResult()
    else drawerStatus.value = result.status
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
        :city="store.line?.city"
        :ip-name="store.ip?.name || ''"
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
        title="📖 圣地巡礼"
        :pois="sortedIp"
        :checked-ids="store.checkedIds"
        :disabled="planning || loading"
        @toggle="store.togglePoi"
      />
      <PoiCheckList
        title="🏙 其他知名景点"
        :pois="store.classicPois"
        :checked-ids="store.checkedIds"
        :disabled="planning || loading"
        @toggle="store.togglePoi"
      />
    </div>

    <footer class="submit-bar">
      <span class="stat" aria-live="polite">
        已选 {{ store.checkedIds.length }} 个点 · 每天 {{ store.hoursPerDay }} 小时
      </span>
      <button
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
