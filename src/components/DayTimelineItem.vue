<script setup>
import { computed } from 'vue'
import PhotoFrame from './ui/PhotoFrame.vue'
import { formatMinutes, poiCover } from '../utils/travel-ui'
const props = defineProps({
  day: { type: Number, required: true },
  item: { type: Object, required: true },
  poi: { type: Object, default: null }
})
const emit = defineEmits(['locate'])
const cover = computed(() => poiCover(props.poi))
</script>
<template>
  <li class="stop">
    <button
      type="button"
      :aria-label="`在地图查看${poi?.name || item.poiId}`"
      @click="emit('locate', item.poiId)"
    >
      <span class="cover">
        <PhotoFrame :src="cover" :alt="poi?.name || ''" ratio="16 / 10" />
        <span class="number">D{{ day }}-{{ item.order }}</span>
      </span>
      <span class="body">
        <strong>{{ poi?.name || '景点信息待补充' }}</strong>
        <small
          >{{ poi?.cluster || ''
          }}<span v-if="poi?.type === 'ip'"> · 圣地巡礼</span></small
        >
        <span class="duration"
          >{{ formatMinutes(item.duration)
          }}<em v-if="poi && item.duration < poi.durationNormal">快速打卡</em></span
        >
      </span>
    </button>
  </li>
</template>
<style scoped>
.stop {
  list-style: none;
  display: flex;
  min-width: 0;
  /* 一天只有两三站时不要让封面图被拉得过大 */
  max-width: 420px;
}
button {
  width: 100%;
  display: flex;
  flex-direction: column;
  text-align: left;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg);
}
button:hover {
  background: var(--brand-light);
}
button:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.cover {
  position: relative;
  display: block;
}
.number {
  position: absolute;
  left: 8px;
  top: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--brand);
  font-size: 11px;
  font-weight: 600;
}
.body {
  display: block;
  padding: 10px 12px 12px;
}
strong {
  display: block;
  font-size: 14px;
  overflow-wrap: anywhere;
}
small {
  display: block;
  font-size: 11px;
  color: var(--ink-2);
  margin-top: 4px;
}
.duration {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  margin-top: 8px;
}
.duration em {
  font-style: normal;
  font-size: 11px;
  color: var(--ink-2);
}
</style>
