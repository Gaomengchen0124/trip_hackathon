<script setup>
import DialogSheet from './ui/DialogSheet.vue'
import { computed } from 'vue'
import PhotoFrame from './ui/PhotoFrame.vue'
import QuoteCard from './QuoteCard.vue'
import { formatMinutes, poiCover } from '../utils/travel-ui'
const props = defineProps({ poi: { type: Object, required: true } })
const cover = computed(() => poiCover(props.poi))
const emit = defineEmits(['view-detail', 'close'])
</script>
<template>
  <DialogSheet :title="poi.name" @close="emit('close')">
    <PhotoFrame class="photo" :src="cover" :alt="poi.name" />
    <p class="meta">
      {{ poi.cluster }} · 建议停留 {{ formatMinutes(poi.durationNormal) }}
    </p>
    <div v-if="poi.type === 'ip'" class="quotes">
      <QuoteCard
        v-for="(quote, index) in poi.quotes || []"
        :key="index"
        :quote="quote"
        brief
      />
      <p v-if="!poi.quotes?.length" class="empty">这个地点的故事即将补充</p>
    </div>
    <p v-else class="intro">{{ poi.intro || '景点介绍即将补充' }}</p>
    <div class="actions">
      <button type="button" class="btn-ghost" @click="emit('close')">
        继续看地图</button
      ><button
        type="button"
        class="btn"
        @click="emit('view-detail', poi.poiId)"
      >
        查看详情 ↗
      </button>
    </div>
  </DialogSheet>
</template>
<style scoped>
.photo {
  border-radius: 12px;
}
.meta {
  font-size: 12px;
  color: var(--ink-2);
  margin: 12px 0 16px;
}
.quotes {
  display: grid;
  gap: 10px;
}
.intro {
  font-size: 14px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.empty {
  font-size: 13px;
  color: var(--ink-2);
  padding: 10px 0;
}
.actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 20px;
}
.actions button {
  padding: 10px 18px;
}
.actions button:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 3px;
}
@media (max-width: 360px) {
  .actions {
    flex-direction: column;
  }
}
</style>
