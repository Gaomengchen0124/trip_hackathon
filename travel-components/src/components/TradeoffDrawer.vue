<script setup>
/** Existing status prop + confirmed(status) are retained.
 * confirmed(status, { action: 'apply' | 'keep', poiIds: string[] }) adds selection details.
 * Parent owns the API request and applies/rolls back the selection.
 */
import { computed, ref, watch } from 'vue'
import { usePlanStore } from '../stores/plan'
import DialogSheet from './ui/DialogSheet.vue'
import {
  applyTradeoff,
  validateSelection,
  formatMinutes
} from '../utils/travel-ui'
const props = defineProps({
  status: { type: String, required: true },
  busy: Boolean,
  error: { type: String, default: '' }
})
const emit = defineEmits(['close', 'confirmed'])
const store = usePlanStore()
const picked = ref([])
const removing = computed(() => props.status === 'overload')
const title = computed(() =>
  removing.value ? '留一点从容，调整这一程' : '还有时间，再多读一页城市'
)
const rows = computed(() => {
  const seen = new Set()
  return (store.result?.suggestions || []).flatMap((s) => {
    const poi = store.pois.find((p) => p.poiId === s.poiId)
    if (
      !poi ||
      seen.has(s.poiId) ||
      store.checkedIds.includes(s.poiId) !== removing.value
    )
      return []
    seen.add(s.poiId)
    return [{ ...s, poi }]
  })
})
watch(
  () => [props.status, store.result],
  () => {
    picked.value = []
  }
)
const selectionError = computed(() =>
  validateSelection(
    store.pois,
    applyTradeoff(store.checkedIds, picked.value, props.status, store.pois)
  )
)
function confirm(action) {
  if (
    props.busy ||
    (action === 'apply' && (!picked.value.length || selectionError.value))
  )
    return
  emit('confirmed', props.status, { action, poiIds: [...picked.value] })
}
</script>
<template>
  <DialogSheet :title="title" :busy="busy" @close="emit('close')">
    <p class="hint">
      {{
        removing
          ? '勾选愿意舍弃的景点，确认后重新安排。'
          : '勾选想追加的景点，确认后重新安排。'
      }}
    </p>
    <div class="suggestions">
      <label
        v-for="row in rows"
        :key="row.poiId"
        class="suggestion"
        :class="{ picked: picked.includes(row.poiId) }"
        ><input
          v-model="picked"
          type="checkbox"
          :value="row.poiId"
          :disabled="busy"
          :aria-label="`${removing ? '舍弃' : '追加'}${row.poi.name}`"
        /><span
          ><strong>{{ row.poi.name }}</strong
          ><small
            >{{ row.poi.cluster }} ·
            {{ formatMinutes(row.poi.durationNormal) }}</small
          >
          <p>
            {{ row.reason || row.poi.skipNote || '可根据自己的偏好调整' }}
          </p></span
        ></label
      >
    </div>
    <p v-if="!rows.length" class="hint">
      暂时没有可选建议，可以返回修改或保留当前行程。
    </p>
    <p v-if="picked.length && selectionError" class="error" role="alert">
      {{ selectionError }}
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="summary" aria-live="polite">
      已选 {{ picked.length }} 个{{ removing ? '舍弃' : '追加' }}点位
    </div>
    <div class="actions">
      <button
        type="button"
        class="btn-ghost"
        :disabled="busy"
        @click="emit('close')"
      >
        返回修改</button
      ><button
        type="button"
        class="keep"
        :disabled="busy"
        @click="confirm('keep')"
      >
        {{ removing ? '保留全部，允许超载' : '保持当前行程' }}</button
      ><button
        type="button"
        class="btn"
        :disabled="busy || !picked.length || Boolean(selectionError)"
        @click="confirm('apply')"
      >
        {{
          busy ? '重新规划中…' : removing ? '确认舍弃并重算' : '确认追加并重算'
        }}
      </button>
    </div>
  </DialogSheet>
</template>
<style scoped>
.hint {
  font-size: 13px;
  color: var(--ink-2);
  margin-bottom: 16px;
}
.suggestions {
  display: grid;
  gap: 10px;
}
.suggestion {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  cursor: pointer;
}
.suggestion.picked {
  background: var(--brand-light);
  border-color: var(--brand);
}
input {
  width: 18px;
  height: 18px;
  accent-color: var(--brand);
  margin-top: 3px;
  flex-shrink: 0;
}
strong {
  font-size: 14px;
}
small {
  display: block;
  color: var(--ink-2);
  font-size: 11px;
  margin-top: 4px;
}
.suggestion p {
  font-size: 12px;
  margin-top: 8px;
  overflow-wrap: anywhere;
}
.error {
  color: var(--brand);
  font-size: 13px;
  margin-top: 12px;
}
.summary {
  font-size: 12px;
  color: var(--ink-2);
  margin-top: 14px;
}
.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 18px;
}
.actions button {
  font-size: 13px;
  padding: 10px 16px;
}
.keep {
  color: var(--brand);
  text-decoration: underline;
  text-underline-offset: 4px;
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
button:focus-visible,
.suggestion:focus-within {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
@media (max-width: 480px) {
  .actions {
    display: grid;
    grid-template-columns: 1fr;
  }
  .actions .btn {
    grid-row: 1;
  }
}
</style>
