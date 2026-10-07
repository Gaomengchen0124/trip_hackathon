<script setup>
import { computed } from 'vue'
import DayTimelineItem from './DayTimelineItem.vue'
import { formatMinutes } from '../utils/travel-ui'
const props = defineProps({
  days: { type: Array, default: () => [] },
  pois: { type: Array, default: () => [] }
})
const emit = defineEmits(['locate'])
const byId = computed(() => new Map(props.pois.map((p) => [p.poiId, p])))
function total(day) {
  return (day.items || []).reduce(
    (sum, item) => sum + (Number(item.duration) || 0),
    0
  )
}
</script>
<template>
  <div class="timeline">
    <section v-for="day in days" :key="day.day" class="day">
      <header>
        <h2>Day {{ day.day }}</h2>
        <p>
          {{ day.items?.length || 0 }} 站 · 游览 {{ formatMinutes(total(day)) }}
        </p>
      </header>
      <ol>
        <DayTimelineItem
          v-for="item in day.items || []"
          :key="item.poiId"
          :day="day.day"
          :item="item"
          :poi="byId.get(item.poiId)"
          @locate="emit('locate', $event)"
        />
      </ol>
    </section>
    <p v-if="!days.length" class="empty">
      暂时没有日程，请返回定制页生成行程。
    </p>
  </div>
</template>
<style scoped>
.timeline {
  display: grid;
  gap: 16px;
}
.day {
  background: #fff;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
h2 {
  font-family: serif;
  font-size: 24px;
  color: var(--brand);
}
header p {
  font-size: 12px;
  color: var(--ink-2);
}
/* 每站一张实拍封面图，像画廊一样铺开；点卡片仍然会定位到地图。 */
ol {
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.empty {
  padding: 24px;
  color: var(--ink-2);
}
@media (max-width: 480px) {
  .day {
    padding: 16px;
  }
  ol {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
}
</style>
