<script setup>
/**
 * S7 景点详情页：大图 + ≤50 字介绍 + 约 100 字原文/台词（brief/full 分离）
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DetailContent from '../components/DetailContent.vue'
import { usePlanStore } from '../stores/plan'

const route = useRoute()
const router = useRouter()
const store = usePlanStore()

const poi = computed(() =>
  store.pois.find((p) => p.poiId === route.params.poiId)
)
</script>

<template>
  <div class="page">
    <header class="bar">
      <button class="back" @click="router.back()">← 返回</button>
      <h1>{{ poi?.name || '未找到该景点' }}</h1>
    </header>

    <DetailContent v-if="poi" :poi="poi" />

    <router-link v-else class="btn" to="/">回首页</router-link>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.back {
  color: var(--ink-2);
  font-size: 14px;
}
.back:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 3px;
}
h1 {
  font-size: 20px;
}
</style>
