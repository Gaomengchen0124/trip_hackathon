<script setup>
/**
 * S3 行程定制页：地图 + 时间窄条 + 双栏勾选 + 提交（S4 抽屉挂在提交流程上）
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlanStore } from '../stores/plan'
import MapContainer from '../components/MapContainer.vue'
import TimeBar from '../components/TimeBar.vue'
import PoiCheckList from '../components/PoiCheckList.vue'
import TradeoffDrawer from '../components/TradeoffDrawer.vue'

const route = useRoute()
const router = useRouter()
const store = usePlanStore()

const drawerStatus = ref(null) // 'overload' | 'under70' | null
const hoverInfo = ref('')

onMounted(() => store.loadLine(route.params.lineId))
watch(() => route.params.lineId, (id) => id && store.loadLine(id))

// IP 点按 tier 排序；城市景点按数组顺序（知名度）
const sortedIp = computed(() => {
  const w = { S: 0, A: 1, B: 2 }
  return [...store.ipPois].sort((a, b) => (w[a.tier] ?? 9) - (w[b.tier] ?? 9))
})

// 定稿规则：IP 打卡点和城市景点"至少勾一个"即可，不要求两类都选
const canSubmit = computed(
  () =>
    store.checkedPois.length > 0 &&
    store.timeRange.startDate &&
    store.timeRange.endDate
)

async function submit() {
  const result = await store.submit()
  if (result.status === 'ok') {
    router.push('/result/map')
  } else {
    drawerStatus.value = result.status // 装不下 / 太宽松 → 弹 S4 抽屉
  }
}

function onMarkerHover(poiId) {
  const p = store.pois.find((x) => x.poiId === poiId)
  hoverInfo.value = p ? `${p.name} · ${store.ip?.name || ''}` : ''
}

/**
 * S4 抽屉协商完 → 按"最终保留"的点重算一次。
 * 还是装不下就把抽屉留着（用户得继续砍）；force = 用户选了"允许超载"。
 */
async function onConfirmed({ poiIds, force = false }) {
  if (force) {
    drawerStatus.value = null
    router.push('/result/map')
    return
  }
  const result = await store.applyTradeoff(poiIds)
  if (result.status === 'ok') {
    drawerStatus.value = null
    router.push('/result/map')
  } else {
    drawerStatus.value = result.status
  }
}
</script>

<template>
  <div class="page">
    <header class="bar">
      <button class="back" @click="router.push('/')">← 首页</button>
      <h1>{{ store.line?.title || '加载中…' }}</h1>
      <span v-if="hoverInfo" class="hover-info">{{ hoverInfo }}</span>
    </header>

    <div class="map-wrap">
      <MapContainer
        :pois="store.pois"
        :selected-ids="store.checkedIds"
        :city="store.line?.city"
        :interactive="true"
        @marker-hover="onMarkerHover"
      />
    </div>

    <TimeBar v-model:time-range="store.timeRange" v-model:hours-per-day="store.hoursPerDay" />

    <div class="cols">
      <PoiCheckList title="📖 打卡点" :pois="sortedIp" :checked-ids="store.checkedIds" @toggle="store.togglePoi" />
      <PoiCheckList title="🏙 城市著名景点" :pois="store.classicPois" :checked-ids="store.checkedIds" @toggle="store.togglePoi" />
    </div>

    <footer class="submit-bar">
      <span class="stat">已选 {{ store.checkedIds.length }} 个点 · 每天 {{ store.hoursPerDay }} 小时</span>
      <button class="btn" :disabled="!canSubmit || store.submitting" @click="submit">
        {{ store.submitting ? '规划中…' : '生成行程' }}
      </button>
    </footer>
    <p v-if="!canSubmit" class="tip">需至少勾选一个点位（书本打卡点或城市景点都行），并选好起止日期</p>

    <TradeoffDrawer
      v-if="drawerStatus"
      :status="drawerStatus"
      @close="drawerStatus = null"
      @confirmed="onConfirmed"
    />
  </div>
</template>

<style scoped>
.bar { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; flex-wrap: wrap; }
.back { color: var(--ink-2); font-size: 14px; }
h1 { font-size: 20px; }
.hover-info { font-size: 13px; color: var(--brand); background: var(--brand-light); border-radius: 999px; padding: 2px 12px; }
.map-wrap { height: 320px; margin-bottom: 12px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
@media (max-width: 720px) { .cols { grid-template-columns: 1fr; } }
.submit-bar {
  position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 12px 0; background: var(--bg); margin-top: 16px;
}
.stat { font-size: 14px; color: var(--ink-2); }
.tip { font-size: 12px; color: var(--ink-2); text-align: right; }
</style>
