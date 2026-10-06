<script setup>
import { computed } from 'vue'
import PoiSelectCard from './PoiSelectCard.vue'
const props = defineProps({
  title: { type: String, required: true },
  pois: { type: Array, required: true },
  checkedIds: { type: Array, required: true },
  disabled: Boolean
})
const emit = defineEmits(['toggle'])
const count = computed(
  () => props.pois.filter((p) => props.checkedIds.includes(p.poiId)).length
)
// Preserve parent-supplied order (IP tier / classic popularity).
function bulk(select) {
  if (props.disabled) return
  const ids = props.pois
    .filter((p) => props.checkedIds.includes(p.poiId) !== select)
    .map((p) => p.poiId)
  ids.forEach((id) => emit('toggle', id))
}
</script>
<template>
  <section class="poi-list" :aria-label="title">
    <header>
      <h2>
        {{ title }} <small>{{ count }} / {{ pois.length }}</small>
      </h2>
      <div class="tools">
        <button
          type="button"
          :disabled="disabled || count === pois.length"
          @click="bulk(true)"
        >
          全选</button
        ><button
          type="button"
          :disabled="disabled || !count"
          @click="bulk(false)"
        >
          清空
        </button>
      </div>
    </header>
    <div class="options">
      <PoiSelectCard
        v-for="poi in pois"
        :key="poi.poiId"
        :poi="poi"
        :checked="checkedIds.includes(poi.poiId)"
        :disabled="disabled"
        @toggle="emit('toggle', $event)"
      />
    </div>
    <p v-if="!pois.length" class="empty">暂无候选景点</p>
  </section>
</template>
<style scoped>
.poi-list {
  min-width: 0;
  border-radius: var(--card-radius);
  padding: 16px;
  background: #fff;
  box-shadow: var(--shadow);
}
header {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
h2 {
  font-size: 15px;
}
small {
  font-weight: 400;
  color: var(--ink-2);
  font-size: 12px;
  margin-left: 5px;
}
.tools {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--brand);
}
.tools button {
  padding: 4px;
}
.tools button:disabled {
  color: var(--ink-2);
  opacity: 0.5;
  cursor: default;
}
.tools button:focus-visible {
  outline: 2px solid var(--brand);
}
.options {
  display: grid;
  gap: 9px;
}
.empty {
  padding: 24px 0;
  color: var(--ink-2);
  text-align: center;
  font-size: 13px;
}
</style>
