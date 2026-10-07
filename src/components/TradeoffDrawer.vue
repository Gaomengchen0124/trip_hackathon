<script setup>
/**
 * S4 取舍抽屉：沿用包里的 DialogSheet UI，契约按当前引擎（contract.md）走。
 *
 *   overload → 舍弃清单：勾掉愿意放弃的；砍够 deficit 之前「确认」禁用
 *   under70  → 追加建议：勾上想加的；一个都不加也能直接确认，去结果页
 *
 * confirmed 载荷：{ poiIds, force? }
 *   poiIds = 最终保留的 poiId（父组件拿它重算）
 *   force  = 不重算，直接带着当前结果出结果页（允许超载用）
 */
import { computed, ref, watch } from 'vue'
import { usePlanStore } from '../stores/plan'
import DialogSheet from './ui/DialogSheet.vue'
import { formatMinutes } from '../utils/travel-ui'

const props = defineProps({
  status: { type: String, required: true }, // 'overload' | 'under70'
  busy: Boolean,
  error: { type: String, default: '' }
})
const emit = defineEmits(['close', 'confirmed'])

const store = usePlanStore()
const picked = ref([])

const removing = computed(() => props.status === 'overload')
const title = computed(() =>
  removing.value ? '时间装不下，咱们得舍几个' : '时间还有富余，建议追加'
)
const suggestions = computed(() => store.result?.suggestions || [])

// overload 的候选是"已勾选、可以放弃"的点；under70 的候选是"没勾、可以追加"的点
const rows = computed(() =>
  suggestions.value.filter(
    (s) => store.checkedIds.includes(s.poiId) === removing.value
  )
)

watch(
  () => [props.status, store.result],
  () => (picked.value = [])
)

const deficitMin = computed(() => store.result?.shortage || 0)
const savedMin = computed(() =>
  suggestions.value
    .filter((s) => picked.value.includes(s.poiId))
    .reduce((sum, s) => sum + (s.savesMinutes || 0), 0)
)
const stillShortMin = computed(() =>
  Math.max(0, deficitMin.value - savedMin.value)
)
const canApply = computed(() =>
  removing.value ? stillShortMin.value <= 0 : true
)

const fmtH = (min) => `${Math.round(min / 6) / 10} 小时`

function toggle(poiId) {
  const i = picked.value.indexOf(poiId)
  if (i >= 0) picked.value.splice(i, 1)
  else picked.value.push(poiId)
}

function confirm() {
  if (props.busy || !canApply.value) return
  const poiIds = removing.value
    ? store.checkedIds.filter((id) => !picked.value.includes(id))
    : [...new Set([...store.checkedIds, ...picked.value])]
  emit('confirmed', { poiIds })
}

function allowOverload() {
  if (props.busy) return
  emit('confirmed', { poiIds: [...store.checkedIds], force: true })
}
</script>

<template>
  <DialogSheet :title="title" :busy="busy" @close="emit('close')">
    <p class="hint">
      {{
        removing
          ? canApply
            ? '砍够了，可以出结果了。'
            : `还差 ${fmtH(stillShortMin)}，再勾几个；都不舍得就选「允许超载」。`
          : '勾上想追加的，行程会自动重新排；不想加就直接确认。'
      }}
    </p>

    <div class="suggestions">
      <label
        v-for="row in rows"
        :key="row.poiId"
        class="suggestion"
        :class="{
          picked: picked.includes(row.poiId),
          lock: row.mustDrop && !picked.includes(row.poiId)
        }"
      >
        <input
          type="checkbox"
          :checked="picked.includes(row.poiId)"
          :disabled="busy"
          :aria-label="`${removing ? '舍弃' : '追加'}${row.name}`"
          @change="toggle(row.poiId)"
        />
        <span class="body">
          <strong>{{ row.name }}</strong>
          <small>
            {{ removing ? `放弃省 ${fmtH(row.savesMinutes)}` : `多花 ${fmtH(row.addsMinutes)}` }}
            <template v-if="row.mustDrop"> · 必须砍</template>
          </small>
          <p>{{ row.reason || '可根据自己的偏好调整' }}</p>
        </span>
      </label>
    </div>

    <p v-if="!rows.length" class="hint">
      暂时没有可选建议，可以返回修改或保留当前行程。
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div class="summary" aria-live="polite">
      已选 {{ picked.length }} 个{{ removing ? '舍弃' : '追加' }}点位
    </div>

    <div class="actions">
      <button type="button" class="btn-ghost" :disabled="busy" @click="emit('close')">
        返回修改
      </button>
      <button
        v-if="removing"
        type="button"
        class="keep"
        :disabled="busy"
        @click="allowOverload"
      >
        都舍不得，允许超载
      </button>
      <button
        type="button"
        class="btn"
        :disabled="busy || !canApply"
        @click="confirm"
      >
        {{ busy ? '重新规划中…' : removing ? '确认舍弃并重算' : '确认追加并重算' }}
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
.suggestion.lock {
  background: #fff8e6;
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
  cursor: not-allowed;
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
