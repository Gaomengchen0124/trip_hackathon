<script setup>
/**
 * S7 景点详情页：大图 + ≤50 字介绍 + 约 100 字原文/台词（brief/full 分离）
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlanStore } from '../stores/plan'

const route = useRoute()
const router = useRouter()
const store = usePlanStore()

const poi = computed(() => store.pois.find((p) => p.poiId === route.params.poiId))

// 图片缺失时回落到占位样式
const imgFailed = ref(false)
watch(() => route.params.poiId, () => (imgFailed.value = false))
</script>

<template>
  <div class="page">
    <header class="bar">
      <button class="back" @click="router.back()">← 返回</button>
      <h1>{{ poi?.name || '未找到该景点' }}</h1>
    </header>

    <template v-if="poi">
      <div class="photo">
        <img
          v-if="!imgFailed"
          class="photo-img"
          :src="'/' + poi.realPhoto"
          :alt="poi.name"
          @error="imgFailed = true"
        />
        <span v-else>📷 {{ poi.realPhoto }}</span>
      </div>
      <p class="intro">{{ poi.intro }}</p>

      <section v-if="poi.quotes?.length" class="quotes">
        <blockquote v-for="(q, i) in poi.quotes" :key="i" class="quote">
          <p class="full">{{ q.kind === '台词' ? q.full : `「${q.full}」` }}</p>
          <footer>—— {{ q.kind }} · {{ q.source }}</footer>
        </blockquote>
      </section>
      <p v-else class="empty">引文待内容组核对原著 / 剧集后填入（宁缺毋假）</p>
    </template>

    <router-link v-else class="btn" to="/">回首页</router-link>
  </div>
</template>

<style scoped>
.bar { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.back { color: var(--ink-2); font-size: 14px; }
h1 { font-size: 20px; }
.photo {
  aspect-ratio: 16/9; border-radius: var(--card-radius); margin-bottom: 14px;
  background: var(--brand-light); color: var(--ink-2);
  display: flex; align-items: center; justify-content: center; font-size: 13px;
  overflow: hidden;
}
.photo-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.intro { font-size: 15px; margin-bottom: 16px; }
.quote {
  background: #fff; border-radius: var(--card-radius); box-shadow: var(--shadow);
  padding: 16px; margin-bottom: 12px;
}
.full { font-size: 15px; }
.quote footer { font-size: 12px; color: var(--ink-2); margin-top: 8px; text-align: right; }
.empty { font-size: 13px; color: var(--ink-2); }
</style>
