<script setup>
import PhotoFrame from './ui/PhotoFrame.vue'
defineProps({
  line: { type: Object, required: true },
  label: { type: String, default: '' }
})
const emit = defineEmits(['select'])
</script>
<template>
  <button
    type="button"
    class="route-card"
    :aria-label="`选择${line.title}`"
    @click="emit('select', line.lineId)"
  >
    <PhotoFrame :src="line.cover" :alt="line.title" ratio="3 / 2" />
    <span class="body"
      ><span v-if="label" class="eyebrow">{{ label }}</span
      ><strong>{{ line.title }}</strong
      ><span class="meta"
        >{{ line.city }} · 推荐 {{ line.recommendDays }} 天
        <span aria-hidden="true">↗</span></span
      ></span
    >
  </button>
</template>
<style scoped>
.route-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  text-align: left;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: var(--card-radius);
  overflow: hidden;
  box-shadow: var(--shadow);
  transition:
    transform 0.18s,
    box-shadow 0.18s;
}
.route-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px #40272616;
}
.route-card:focus-visible {
  outline: 3px solid var(--brand);
  outline-offset: 3px;
}
.body {
  display: grid;
  gap: 7px;
  padding: 16px;
  width: 100%;
}
.eyebrow {
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--brand);
}
strong {
  font-size: 17px;
  font-family: serif;
  overflow-wrap: anywhere;
}
.meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-2);
}
@media (prefers-reduced-motion: reduce) {
  .route-card {
    transition: none;
  }
  .route-card:hover {
    transform: none;
  }
}
</style>
