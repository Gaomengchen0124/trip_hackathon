<script setup>
import { computed } from 'vue'
import PhotoFrame from './ui/PhotoFrame.vue'
import { poiCover, formatMinutes } from '../utils/travel-ui'
const props = defineProps({
  poi: { type: Object, required: true },
  checked: Boolean,
  disabled: Boolean
})
const emit = defineEmits(['toggle'])
const cover = computed(() => poiCover(props.poi))
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
    <span class="photo"><PhotoFrame :src="cover" :alt="poi.name" ratio="4 / 3" /></span>
    <span class="content">
      <strong>{{ poi.name }}</strong>
      <span class="meta">{{ poi.cluster }} · {{ formatMinutes(poi.durationNormal) }}</span>
    </span>
  </label>
</template>
<style scoped>
.poi-option {
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: 104px;
  position: relative;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #fff;
  cursor: pointer;
}
.poi-option.selected {
  border-color: var(--brand);
  background: var(--brand-light);
  box-shadow: inset 0 0 0 1px var(--brand);
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
  position: absolute;
  opacity: 0;
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
  display: block;
  font-size: 16px;
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
  font-size: 13px;
}
.photo {display:block;width:88px;flex-shrink:0;border-radius:10px;overflow:hidden;}
.content {text-align:center;}
.meta {line-height:1.7;overflow-wrap:anywhere;}
@media(max-width:380px){.photo{width:72px;}.poi-option{gap:10px;}strong{font-size:15px;}}
</style>
