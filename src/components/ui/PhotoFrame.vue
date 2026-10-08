<script setup>
import { computed, ref, watch } from 'vue'
import { assetUrl } from '../../utils/travel-ui'
const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  ratio: { type: String, default: '16 / 9' },
  // 首屏关键视觉(如首页 IP 墙)设 eager:滚入视口才加载会在滚动中露出空白块
  eager: { type: Boolean, default: false }
})
const failed = ref(false)
const url = computed(() => assetUrl(props.src, import.meta.env.BASE_URL))
watch(url, () => {
  failed.value = false
})
</script>
<template>
  <div class="photo-frame" :style="{ aspectRatio: ratio }">
    <img
      v-if="url && !failed"
      :src="url"
      :alt="alt"
      :loading="eager ? 'eager' : 'lazy'"
      decoding="async"
      @error="failed = true"
    />
    <div v-else class="placeholder" role="img" :aria-label="`${alt}，暂无图片`">
      <svg viewBox="0 0 80 60" aria-hidden="true">
        <path
          d="M8 51V15h23v36m0-25h20v25m0-43h21v43M3 52h74M14 22h10m-10 8h10m-10 8h10m13-5h8m-8 8h8m12-24h9m-9 10h9m-9 10h9"
        />
      </svg>
      <span>{{ alt }}</span
      ><small>现实照片待补充</small>
    </div>
  </div>
</template>
<style scoped>
.photo-frame {
  position: relative;
  overflow: hidden;
  background: linear-gradient(145deg, #f6ecec, #eee6d8);
  width: 100%;
  min-width: 0;
}
.photo-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 5px;
  padding: 12px;
  color: var(--brand);
  text-align: center;
}
.placeholder svg {
  width: 64px;
  height: 48px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.2;
  opacity: 0.5;
}
.placeholder span {
  font-family: serif;
  font-size: 18px;
  letter-spacing: 2px;
}
.placeholder small {
  font-size: 11px;
  color: var(--ink-2);
}
</style>
