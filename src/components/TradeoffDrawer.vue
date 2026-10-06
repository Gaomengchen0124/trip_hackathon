<script setup>
/**
 * S4 取舍抽屉（浮在 S3 上）
 *
 * 两种模式由 status 决定：
 *   overload → 舍弃清单：勾掉愿意放弃的；带 mustDrop 的必须砍够，否则确认按钮禁用
 *   under70  → 追加建议清单：勾上想加的
 *
 * 确认时把"最终保留的 poiIds"回传，由 S3 重新跑一次引擎（引擎是纯函数，重算无副作用）。
 */
import { ref, computed, watch } from 'vue'
import { usePlanStore } from '../stores/plan'

const props = defineProps({
  status: { type: String, required: true }, // 'overload' | 'under70'
})
/** confirmed 的载荷：{ poiIds, force? }，force = 允许超载直接出结果 */
const emit = defineEmits(['close', 'confirmed'])

const store = usePlanStore()
const picked = ref([]) // overload = 选择放弃的；under70 = 选择追加的

watch(
  () => props.status,
  () => (picked.value = [])
)

const isDrop = computed(() => props.status === 'overload')
const result = computed(() => store.result)
const suggestions = computed(() => result.value?.suggestions ?? [])

const title = computed(() => (isDrop.value ? '时间装不下，咱们得舍几个' : '时间还有富余，建议追加'))

const deficitMin = computed(() => result.value?.shortage ?? 0)

/** 还差多少分钟没补上：勾掉建议里的点能省多少，够不够补缺口 */
const savedMin = computed(() =>
  suggestions.value
    .filter((s) => picked.value.includes(s.poiId))
    .reduce((sum, s) => sum + (s.savesMinutes || 0), 0)
)
const stillShortMin = computed(() => Math.max(0, deficitMin.value - savedMin.value))
const canConfirm = computed(() => (isDrop.value ? stillShortMin.value <= 0 : true))

function toggle(id) {
  const i = picked.value.indexOf(id)
  if (i >= 0) picked.value.splice(i, 1)
  else picked.value.push(id)
}

function poiOf(poiId) {
  return store.pois.find((p) => p.poiId === poiId)
}

const fmtH = (min) => `${Math.round(min / 6) / 10} 小时`

function confirm() {
  if (!canConfirm.value) return
  if (isDrop.value) {
    emit('confirmed', {
      poiIds: store.checkedIds.filter((id) => !picked.value.includes(id)),
    })
  } else {
    emit('confirmed', { poiIds: [...store.checkedIds, ...picked.value] })
  }
}

function allowOverload() {
  // 一个都不砍，带着超载标记直接出结果
  emit('confirmed', { poiIds: [...store.checkedIds], force: true })
}
</script>

<template>
  <div class="mask" @click="emit('close')">
    <div class="sheet" @click.stop>
      <h3>{{ title }}</h3>

      <p v-if="result?.message" class="alert">⚠️ {{ result.message }}</p>
      <p class="hint">
        {{ isDrop
          ? (canConfirm ? '砍够了，可以出结果了。' : `还差 ${fmtH(stillShortMin)}，再勾几个；都不舍得就选「允许超载」。`)
          : '勾上想追加的，行程会自动重新排。' }}
      </p>

      <label
        v-for="s in suggestions"
        :key="s.poiId"
        class="row"
        :class="{ lock: s.mustDrop && !picked.includes(s.poiId) }"
      >
        <input type="checkbox" :checked="picked.includes(s.poiId)" @change="toggle(s.poiId)" />
        <span class="name">{{ s.name || poiOf(s.poiId)?.name || s.poiId }}</span>
        <span class="reason">{{ s.reason }}</span>
        <span v-if="s.kind === 'drop'" class="save">省 {{ fmtH(s.savesMinutes) }}</span>
        <span v-else class="save">+{{ fmtH(s.addsMinutes) }}</span>
      </label>

      <div class="actions">
        <button class="btn-ghost" @click="emit('close')">回去改</button>
        <button v-if="isDrop" class="btn-ghost" @click="allowOverload">都舍不得，允许超载</button>
        <button class="btn" :disabled="!canConfirm" @click="confirm">确认</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); z-index: 40; }
.sheet {
  position: absolute; left: 0; right: 0; bottom: 0; max-height: 70vh; overflow: auto;
  background: #fff; border-radius: 16px 16px 0 0; padding: 20px 16px;
  max-width: 640px; margin: 0 auto;
}
h3 { font-size: 17px; }
.alert { font-size: 13px; color: #b3261e; background: #fdecea; border-radius: 8px; padding: 8px 10px; margin: 8px 0 0; }
.hint { font-size: 13px; color: var(--ink-2); margin: 6px 0 12px; }
.row { display: flex; align-items: center; gap: 8px; padding: 10px 4px; border-bottom: 1px solid var(--line); font-size: 14px; }
.row.lock { background: #fff8e6; }
.name { font-weight: 500; }
.reason { flex: 1; font-size: 12px; color: var(--ink-2); }
.save { font-size: 12px; color: var(--brand); white-space: nowrap; }
.actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
