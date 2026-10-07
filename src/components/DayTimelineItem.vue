<script setup>
import { formatMinutes } from '../utils/travel-ui'
defineProps({
  day: { type: Number, required: true },
  item: { type: Object, required: true },
  poi: { type: Object, default: null }
})
const emit = defineEmits(['locate'])
</script>
<template>
  <li class="stop">
    <button
      type="button"
      :aria-label="`在地图查看${poi?.name || item.poiId}`"
      @click="emit('locate', item.poiId)"
    >
      <span class="number">D{{ day }}-{{ item.order }}</span
      ><span class="body"
        ><strong>{{ poi?.name || '景点信息待补充' }}</strong
        ><small
          >{{ poi?.cluster || ''
          }}<span v-if="poi?.type === 'ip'"> · 圣地巡礼</span></small
        ></span
      ><span class="duration"
        >{{ formatMinutes(item.duration)
        }}<small v-if="poi && item.duration < poi.durationNormal"
          >快速打卡</small
        ></span
      ><span aria-hidden="true" class="arrow">↗</span>
    </button>
  </li>
</template>
<style scoped>
.stop {
  list-style: none;
  border-left: 1px solid var(--line);
  margin-left: 24px;
  padding: 0 0 12px 18px;
  position: relative;
}
.stop::before {
  content: '';
  position: absolute;
  left: -4px;
  top: 25px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--brand);
}
.stop:last-child {
  padding-bottom: 0;
}
button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
}
button:hover {
  background: var(--brand-light);
}
button:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.number {
  font-size: 11px;
  color: var(--brand);
  font-weight: 600;
  white-space: nowrap;
}
.body {
  flex: 1;
  min-width: 0;
}
strong {
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
  font-size: 12px;
  white-space: nowrap;
}
.arrow {
  color: var(--brand);
}
@media (max-width: 480px) {
  .stop {
    margin-left: 4px;
    padding-left: 12px;
  }
  button {
    padding: 12px;
    gap: 8px;
    flex-wrap: wrap;
  }
  .body {
    flex-basis: 55%;
  }
  .duration {
    margin-left: auto;
  }
  .arrow {
    display: none;
  }
}
</style>
