<script setup>
import { TIER_LABELS, formatMinutes } from '../utils/travel-ui'
defineProps({
  poi: { type: Object, required: true },
  checked: Boolean,
  disabled: Boolean
})
const emit = defineEmits(['toggle'])
</script>
<template>
  <label class="poi-option" :class="{ selected: checked, disabled }">
    <input
      type="checkbox"
      :checked="checked"
      :disabled="disabled"
      :aria-label="`选择${poi.name}`"
      @change="emit('toggle', poi.poiId)"
    />
    <span class="content"
      ><span class="headline"
        ><strong>{{ poi.name }}</strong
        ><span class="tag">{{
          poi.type === 'ip' ? TIER_LABELS[poi.tier] || '圣地巡礼' : '其他知名景点'
        }}</span></span
      ><span class="meta"
        >{{ poi.cluster }} · {{ formatMinutes(poi.durationNormal) }}</span
      ></span
    >
  </label>
</template>
<style scoped>
.poi-option {
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: 88px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
}
.poi-option.selected {
  border-color: var(--brand);
  background: var(--brand-light);
  box-shadow: inset 3px 0 var(--brand);
}
.poi-option:focus-within {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.poi-option.disabled {
  opacity: 0.65;
  cursor: wait;
}
input {
  accent-color: var(--brand);
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.content {
  min-width: 0;
  flex: 1;
}
.headline {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
strong {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.tag {
  font-size: 10px;
  color: var(--brand);
  padding: 1px 6px;
  border-radius: 5px;
  border: 1px solid #8b1e2d26;
  white-space: nowrap;
}
.meta {
  display: block;
  margin-top: 5px;
  color: var(--ink-2);
  font-size: 12px;
}
</style>
