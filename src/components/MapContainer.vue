<script setup>
/**
 * 地图容器 —— 占位实现。
 *
 * 【交接给地图同学】用 Mapbox（或高德）替换本组件时，请保持以下契约不变，
 * 页面代码无需任何改动即可无缝切换：
 *   props:
 *     - pois: POI[]                 要显示的点位
 *     - selectedIds: string[]        已勾选（亮起），其余灰色
 *     - plan: PlanResult | null      规划结果（有值时按 order 标 D1-1 编号）
 *     - interactive: boolean         是否响应点击（S3 与 S5 都是 true，纯展示可传 false）
 *     - city: string                地图抬头城市名（传 line.city，如「上海」「东京及近郊」）
 *   emits:
 *     - marker-click(poiId)          点标点（S5 用来弹 S6 卡片）
 *     - marker-hover(poiId)          悬停/触摸（S3 显示「地名 + IP 名」）
 *
 * 降级预案（对应执行方案"四次救命降级"第 3 条）：
 * 本占位实现不依赖任何地图 SDK，断网/无 token 也能跑通全部页面交互。
 */
import { computed } from 'vue'

const props = defineProps({
  pois: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] },
  plan: { type: Object, default: null },
  interactive: { type: Boolean, default: true },
  city: { type: String, default: '' },
})
const emit = defineEmits(['marker-click', 'marker-hover'])

// 城市名优先取线路自带的 line.city：片区名里未必含城市（如「静安」「近郊」），
// 靠 cluster 拆字符串会把「黄浦·打浦桥」拆成「黄浦」这种区名。
const city = computed(() => props.city || props.pois[0]?.cluster?.split('·')[0] || '上海')

// 简易投影：按 poi 经纬度范围等比映射到容器内
const bounds = computed(() => {
  const lngs = props.pois.map((p) => p.lng)
  const lats = props.pois.map((p) => p.lat)
  return {
    minLng: Math.min(...lngs), maxLng: Math.max(...lngs),
    minLat: Math.min(...lats), maxLat: Math.max(...lats),
  }
})

function pos(p) {
  const { minLng, maxLng, minLat, maxLat } = bounds.value
  const spanLng = maxLng - minLng || 0.01
  const spanLat = maxLat - minLat || 0.01
  return {
    left: `${8 + ((p.lng - minLng) / spanLng) * 84}%`,
    top: `${8 + (1 - (p.lat - minLat) / spanLat) * 84}%`,
  }
}

const orderMap = computed(() => {
  const m = {}
  if (props.plan) {
    props.plan.days.forEach((d) => d.items.forEach((it) => {
      m[it.poiId] = `D${d.day}-${it.order}`
    }))
  }
  return m
})
</script>

<template>
  <div class="map-box">
    <div class="map-placeholder">
      <span class="map-city">{{ city }}</span>
      <span class="map-tip">地图占位 · 等待 Mapbox 接入（契约见组件注释）</span>
    </div>
    <button
      v-for="p in pois"
      :key="p.poiId"
      class="marker"
      :class="{ on: selectedIds.includes(p.poiId), ip: p.type === 'ip' }"
      :style="pos(p)"
      :disabled="!interactive"
      @click="emit('marker-click', p.poiId)"
      @mouseenter="emit('marker-hover', p.poiId)"
    >
      <span v-if="orderMap[p.poiId]" class="order">{{ orderMap[p.poiId] }}</span>
      <span v-else class="dot"></span>
    </button>
  </div>
</template>

<style scoped>
.map-box { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: var(--card-radius); }
.map-placeholder {
  position: absolute; inset: 0;
  background: linear-gradient(135deg, #e8e2d5, #d9d2c2);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  color: var(--ink-2);
}
.map-city { font-size: 28px; letter-spacing: 8px; }
.map-tip { font-size: 12px; }
.marker {
  position: absolute; transform: translate(-50%, -50%);
  width: 26px; height: 26px; border-radius: 50%;
  background: #b9b2a4; border: 2px solid #fff; box-shadow: var(--shadow);
  display: flex; align-items: center; justify-content: center;
}
.marker.on { background: var(--brand); }
.marker.ip.on { background: #c99a2c; } /* IP 点用金色区分 */
.order { font-size: 9px; color: #fff; transform: scale(0.9); white-space: nowrap; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: #fff; }
</style>
