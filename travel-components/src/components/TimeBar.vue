<script setup>
import { computed, useId } from 'vue'
import { SLOTS, HOURS, validateTimeRange } from '../utils/travel-ui'
const props = defineProps({
  timeRange: { type: Object, required: true },
  hoursPerDay: { type: Number, required: true },
  disabled: Boolean
})
const emit = defineEmits(['update:timeRange', 'update:hoursPerDay'])
const radioName = useId()
const error = computed(() =>
  validateTimeRange(props.timeRange, props.hoursPerDay)
)
const showError = computed(
  () => props.timeRange.startDate && props.timeRange.endDate && error.value
)
function patch(field, value) {
  emit('update:timeRange', { ...props.timeRange, [field]: value })
}
</script>
<template>
  <section class="timebar" aria-label="游玩时间">
    <fieldset :disabled="disabled" class="fields">
      <legend>安排游玩时间</legend>
      <div class="endpoint">
        <label
          >开始日期<input
            type="date"
            :value="timeRange.startDate"
            :aria-invalid="Boolean(showError)"
            @input="patch('startDate', $event.target.value)" /></label
        ><label
          >开始时段<select
            :value="timeRange.startSlot"
            @change="patch('startSlot', $event.target.value)"
          >
            <option v-for="slot in SLOTS" :key="slot">{{ slot }}</option>
          </select></label
        >
      </div>
      <span class="separator" aria-hidden="true">→</span>
      <div class="endpoint">
        <label
          >结束日期<input
            type="date"
            :value="timeRange.endDate"
            :min="timeRange.startDate || undefined"
            :aria-invalid="Boolean(showError)"
            @input="patch('endDate', $event.target.value)" /></label
        ><label
          >结束时段<select
            :value="timeRange.endSlot"
            @change="patch('endSlot', $event.target.value)"
          >
            <option v-for="slot in SLOTS" :key="slot">{{ slot }}</option>
          </select></label
        >
      </div>
      <fieldset class="hours">
        <legend>每天游玩</legend>
        <label
          v-for="hour in HOURS"
          :key="hour"
          :class="{ active: hoursPerDay === hour }"
          ><input
            type="radio"
            :checked="hoursPerDay === hour"
            :value="hour"
            :name="radioName"
            :aria-label="`每天 ${hour} 小时`"
            @change="emit('update:hoursPerDay', hour)"
          />{{ hour }}h</label
        >
      </fieldset>
    </fieldset>
    <p v-if="showError" role="alert" class="error">{{ error }}</p>
  </section>
</template>
<style scoped>
.timebar {
  padding: 16px;
  background: #fff;
  border-radius: var(--card-radius);
  box-shadow: var(--shadow);
}
fieldset {
  border: 0;
  min-width: 0;
}
.fields {
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
}
.fields > legend {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 9px;
}
.endpoint {
  display: flex;
  gap: 8px;
  min-width: 0;
}
label {
  display: grid;
  gap: 5px;
  font-size: 11px;
  color: var(--ink-2);
}
input,
select {
  font-size: 13px;
  min-width: 0;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--ink);
  padding: 8px;
  border-radius: 7px;
}
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--brand);
}
.separator {
  color: var(--ink-2);
  margin-top: 17px;
}
.hours {
  display: flex;
  gap: 6px;
  margin-left: auto;
}
.hours legend {
  font-size: 11px;
  color: var(--ink-2);
  margin-bottom: 5px;
}
.hours label {
  position: relative;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}
.hours input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.hours label:focus-within {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.hours .active {
  background: var(--brand);
  color: white;
  border-color: var(--brand);
}
.fields:disabled {
  opacity: 0.65;
}
.error {
  font-size: 12px;
  color: var(--brand);
  margin-top: 10px;
}
@media (max-width: 600px) {
  .fields {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .endpoint {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 90px;
  }
  .separator {
    display: none;
  }
  .hours {
    margin-left: 0;
  }
  .hours label {
    flex: 1;
    text-align: center;
  }
}
</style>
