<script setup>
import { computed, ref, watch } from 'vue'
import PhotoFrame from './ui/PhotoFrame.vue'
import QuoteCard from './QuoteCard.vue'
import { formatMinutes, TIER_LABELS, poiPhotos } from '../utils/travel-ui'
const props = defineProps({ poi: { type: Object, required: true } })

// 一个点位可能有多张实拍图：默认大图看第一张（封面），点缩略图切其它张。
const photos = computed(() => poiPhotos(props.poi))
const active = ref(0)
const current = computed(() => photos.value[active.value] || '')

watch(
  () => props.poi?.poiId,
  () => {
    active.value = 0
  }
)
</script>
<template>
  <article class="detail">
    <div class="gallery">
      <PhotoFrame :src="current" :alt="poi.name" />
      <div v-if="photos.length" class="thumbs" role="group" aria-label="现场实拍图">
        <button
          v-for="(photo, index) in photos"
          :key="photo"
          type="button"
          :class="{ on: index === active }"
          :aria-label="`查看第 ${index + 1} 张：${poi.name}`"
          :aria-current="index === active ? 'true' : undefined"
          @click="active = index"
        >
          <PhotoFrame :src="photo" :alt="`${poi.name} 第 ${index + 1} 张`" ratio="4 / 3" />
        </button>
        <p class="count">
          {{ photos.length > 1 ? `${active + 1} / ${photos.length}` : '共 1 张实拍' }}
        </p>
      </div>
    </div>
    <div class="content">
      <p class="eyebrow">
        {{ poi.type === 'ip' ? '圣地巡礼' : '其他知名景点'
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
.thumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  overflow-x: auto;
}
.thumbs button {
  flex: 0 0 82px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 10px;
  overflow: hidden;
  background: none;
  line-height: 0;
}
.thumbs button.on {
  border-color: var(--brand);
}
.thumbs button:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.thumbs .count {
  margin-left: auto;
  padding-right: 4px;
  font-size: 12px;
  color: var(--ink-2);
  white-space: nowrap;
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
