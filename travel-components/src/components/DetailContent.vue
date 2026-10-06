<script setup>
import PhotoFrame from './ui/PhotoFrame.vue'
import QuoteCard from './QuoteCard.vue'
import { formatMinutes, TIER_LABELS } from '../utils/travel-ui'
defineProps({ poi: { type: Object, required: true } })
</script>
<template>
  <article class="detail">
    <PhotoFrame :src="poi.realPhoto" :alt="poi.name" />
    <div class="content">
      <p class="eyebrow">
        {{ poi.type === 'ip' ? '故事中的一站' : '城市经典'
        }}<span v-if="poi.type === 'ip' && poi.tier">
          · {{ TIER_LABELS[poi.tier] }}</span
        >
      </p>
      <h2>{{ poi.name }}</h2>
      <p class="meta">
        {{ poi.cluster }} · 建议停留 {{ formatMinutes(poi.durationNormal) }}
      </p>
      <p class="intro">{{ poi.intro || '景点介绍即将补充' }}</p>
      <section v-if="poi.type === 'ip'" class="quotes" aria-label="原著与台词">
        <h3>重读这个瞬间</h3>
        <QuoteCard
          v-for="(quote, index) in poi.quotes || []"
          :key="index"
          :quote="quote"
        />
        <p v-if="!poi.quotes?.length" class="empty">这个地点的故事即将补充</p>
      </section>
    </div>
  </article>
</template>
<style scoped>
.detail {
  max-width: 820px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.content {
  padding: 28px;
}
.eyebrow {
  font-size: 11px;
  color: var(--brand);
  letter-spacing: 2px;
}
h2 {
  font-size: 30px;
  font-family: serif;
  margin: 6px 0 8px;
  overflow-wrap: anywhere;
}
.meta {
  color: var(--ink-2);
  font-size: 12px;
}
.intro {
  font-size: 15px;
  line-height: 1.9;
  margin: 22px 0;
  overflow-wrap: anywhere;
}
.quotes {
  display: grid;
  gap: 16px;
}
h3 {
  font-size: 16px;
  border-top: 1px solid var(--line);
  padding-top: 20px;
}
.empty {
  color: var(--ink-2);
  font-size: 13px;
}
@media (max-width: 600px) {
  .content {
    padding: 20px;
  }
  h2 {
    font-size: 25px;
  }
}
</style>
