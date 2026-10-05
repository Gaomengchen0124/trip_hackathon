<script setup>
/**
 * S3 顶部 · 游玩时间窄条：日期区间 + 开始/结束时段 + 每天 6/8/10 小时
 */
const props = defineProps({
  timeRange: { type: Object, required: true },
  hoursPerDay: { type: Number, required: true },
})
const emit = defineEmits(['update:timeRange', 'update:hoursPerDay'])

const SLOTS = ['上午', '中午', '晚上']
const HOURS = [6, 8, 10]

function patch(field, value) {
  emit('update:timeRange', { ...props.timeRange, [field]: value })
}
</script>

<template>
  <div class="timebar card-block">
    <label class="field">
      开始
      <input type="date" :value="timeRange.startDate" @input="patch('startDate', $event.target.value)" />
      <select :value="timeRange.startSlot" @change="patch('startSlot', $event.target.value)">
        <option v-for="s in SLOTS" :key="s" :value="s">{{ s }}</option>
      </select>
    </label>
    <span class="tilde">~</span>
    <label class="field">
      结束
      <input type="date" :value="timeRange.endDate" @input="patch('endDate', $event.target.value)" />
      <select :value="timeRange.endSlot" @change="patch('endSlot', $event.target.value)">
        <option v-for="s in SLOTS" :key="s" :value="s">{{ s }}</option>
      </select>
    </label>
    <span class="divider"></span>
    <label class="field">
      每天
      <span class="hours">
        <button
          v-for="h in HOURS" :key="h"
          class="hour" :class="{ on: hoursPerDay === h }"
          @click="emit('update:hoursPerDay', h)"
        >{{ h }}h</button>
      </span>
    </label>
  </div>
</template>

<style scoped>
.card-block { background: #fff; border-radius: var(--card-radius); box-shadow: var(--shadow); }
.timebar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 14px; font-size: 14px; }
.field { display: flex; align-items: center; gap: 6px; }
input, select { border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; background: #fff; }
.tilde { color: var(--ink-2); }
.divider { flex: 1; }
.hours { display: flex; gap: 6px; }
.hour { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); font-size: 13px; }
.hour.on { background: var(--brand); color: #fff; border-color: var(--brand); }
</style>
