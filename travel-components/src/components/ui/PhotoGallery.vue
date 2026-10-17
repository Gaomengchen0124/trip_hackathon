<script setup>
import { computed, ref, watch } from 'vue'
import PhotoFrame from './PhotoFrame.vue'
import { assetUrl } from '../../utils/travel-ui'
const props = defineProps({
  photos: { type: Array, default: () => [] },
  fallback: { type: String, default: '' },
  alt: { type: String, default: '' }
})
const list = computed(() => {
  const items = (props.photos || []).filter((p) => typeof p === 'string' && p.trim())
  if (items.length) return items
  return props.fallback ? [props.fallback] : []
})
const active = ref(0)
watch(list, () => {
  active.value = 0
})
const current = computed(() => list.value[active.value] || '')
const src = (photo) => assetUrl(photo, import.meta.env.BASE_URL)
</script>
<template>
  <div class="gallery">
    <PhotoFrame :src="current" :alt="alt" />
    <div
      v-if="list.length > 1"
      class="thumbs"
      role="group"
      :aria-label="`${alt} 共 ${list.length} 张图片`"
    >
      <button
        v-for="(photo, index) in list"
        :key="photo"
        type="button"
        class="thumb"
        :class="{ active: index === active }"
        :aria-label="`查看${alt}第 ${index + 1} 张图片`"
        :aria-pressed="index === active"
        @click="active = index"
      >
        <img :src="src(photo)" :alt="''" loading="lazy" decoding="async" />
      </button>
    </div>
  </div>
</template>
<style scoped>
.gallery {
  display: grid;
  gap: 8px;
  background: #fff;
}
.thumbs {
  display: flex;
  gap: 8px;
  padding: 0 12px 12px;
  overflow-x: auto;
}
.thumb {
  flex: 0 0 auto;
  width: 88px;
  aspect-ratio: 4 / 3;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  background: linear-gradient(145deg, #f3eddf, #eee6d8);
  cursor: pointer;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.thumb.active {
  border-color: var(--brand);
}
.thumb:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
</style>
