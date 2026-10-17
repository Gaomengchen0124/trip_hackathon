<script setup>
import { computed } from 'vue'
import {ticketReferenceText} from '../planning/ticket-policy.mjs'
import PhotoFrame from './ui/PhotoFrame.vue'
import YoyoBuddy from './ui/YoyoBuddy.vue'
import { poiCover, formatMinutes } from '../utils/travel-ui'
const props = defineProps({
  poi: { type: Object, required: true },
  checked: Boolean,
  active: Boolean,
  disabled: Boolean,
  buddySide: { type: String, default: 'left' },
  buddyReaction: { type: Number, default: 0 }
})
const emit = defineEmits(['toggle'])
const cover = computed(() => poiCover(props.poi))
</script>
<template>
  <div :id="`planner-poi-${poi.poiId}`" class="poi-option-wrap" :class="{ 'has-buddy': active }">
  <label class="poi-option" :class="{ selected: checked, active, disabled }">
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
      <span class="meta">{{ poi.cluster }} · {{ formatMinutes(poi.durationNormal) }}<template v-if="ticketReferenceText(poi)"> · 票价：{{ ticketReferenceText(poi) }}</template></span>
    </span>
  </label>
  <span v-if="active" class="poi-buddy-anchor" :class="`buddy-${buddySide}`">
    <YoyoBuddy
      :state="disabled ? 'planning' : checked ? 'success' : 'welcome'"
      :size="48"
      :react-to="buddyReaction"
      :disabled="disabled"
      :label="`和 YOYO 打个招呼：${poi.name}`"
      :message="checked ? `记下了，一起去${poi.name}看看吧。` : '想去就点一下景点，我会陪着你选。'"
      appear
    />
  </span>
  </div>
</template>
<style scoped>
.poi-option-wrap { position: relative; min-width: 0; --poi-photo-width: 88px; scroll-margin: 50px 0 100px; }
.poi-option-wrap.has-buddy { z-index: 2; }
/* Reserve an interior margin for YOYO: the card, speech and leap stay in the viewport. */
.poi-buddy-anchor { position: absolute; z-index: 3; right: 16px; top: 50%; translate: 0 -50%; animation: buddy-arrive 280ms var(--ease-out); }
.poi-option-wrap.has-buddy .poi-option { padding-right: 76px; }
.poi-buddy-anchor :deep(.yoyo-speech) { left: auto; right: 0; max-width: min(220px, calc(100vw - 96px)); border-radius: 14px 14px 4px 14px; }
@keyframes buddy-arrive { from { opacity: 0; transform: translateY(9px) scale(.85); } to { opacity: 1; transform: none; } }
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
  scroll-margin: 24px 0 100px;
  transition: border-color var(--motion-normal) var(--ease-out), background-color var(--motion-normal) var(--ease-out), box-shadow var(--motion-normal) var(--ease-out);
}
.poi-option.active { outline: 2px solid var(--brand-strong); outline-offset: 3px; }
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
  border: 1px solid var(--brand-border);
  white-space: nowrap;
}
.meta {
  display: block;
  margin-top: 5px;
  color: var(--ink-2);
  font-size: 13px;
}
.photo {display:block;width:var(--poi-photo-width);flex-shrink:0;border-radius:10px;overflow:hidden;}
.content {text-align:center;}
.meta {line-height:1.7;overflow-wrap:anywhere;}
@media(max-width:380px){.poi-option-wrap{--poi-photo-width:72px;}.poi-option{gap:10px;}strong{font-size:15px;}}
@media(prefers-reduced-motion:reduce){.poi-option{transition:none;}.poi-buddy-anchor{animation:none;}}
</style>
