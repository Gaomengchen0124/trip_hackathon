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
      <span class="time"><b>{{ item.arrive || '待定' }}–{{ item.leave || '待定' }}</b><small>{{ item.legMinutes ? `路上 ${item.legMinutes} 分钟` : item.order === 1 ? '起点' : '下一站' }}</small></span>
      <span class="cover">
        <PhotoFrame :src="cover" :alt="poi?.name || ''" ratio="1 / 1" />
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
  max-width: none;
}
button {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 14px;
  text-align: left;
  padding: 14px 0;
  border: 0;
  border-bottom: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: transparent;
}
button:hover {
  background: var(--brand-light);
}
button:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.time { width:110px;flex-shrink:0;font-size:13px;padding-left:8px; }
.time b {display:block;}
.cover {
  width:84px;
  flex-shrink:0;
  position: relative;
  display: block;
}
.body {
  display: block;
  padding: 0 8px 0 0;
  min-width: 0;
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
@media(max-width:480px){button{gap:8px;flex-wrap:wrap;}.time{width:100%;padding-left:0;}.cover{width:68px;}.body{flex:1;}}
</style>
