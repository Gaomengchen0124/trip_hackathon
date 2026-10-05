<script setup>
/**
 * S4 取舍抽屉（浮在 S3 上）
 * 两种模式由 status 决定：
 *   overload → 舍弃清单（用户勾选放弃/保留）+ 允许超载入口
 *   under70 → 追加建议清单
 * 真引擎接入前，"确认舍弃"仅关闭抽屉并把 result 视为可出结果（mock 行为，TODO 对齐）。
 */
import { computed } from 'vue'
import { usePlanStore } from '../stores/plan'

const props = defineProps({
  status: { type: String, required: true }, // 'overload' | 'under70'
})
const emit = defineEmits(['close', 'confirmed'])

const store = usePlanStore()

const title = computed(() =>
  props.status === 'overload' ? '时间装不下，咱们得舍几个' : '时间还有富余，建议追加'
)

function poiOf(poiId) {
  return store.pois.find((p) => p.poiId === poiId)
}
</script>

<template>
  <div class="mask" @click="emit('close')">
    <div class="sheet" @click.stop>
      <h3>{{ title }}</h3>
      <p class="hint">
        {{ status === 'overload'
          ? '勾掉你能放弃的；都不舍得就选「允许超载」。'
          : '勾上想追加的，行程会自动重新排。' }}
      </p>
      <label v-for="s in store.result?.suggestions || []" :key="s.poiId" class="row">
        <input type="checkbox" />
        <span class="name">{{ poiOf(s.poiId)?.name }}</span>
        <span class="reason">{{ s.reason }}</span>
      </label>
      <div class="actions">
        <button class="btn-ghost" @click="emit('close')">回去改</button>
        <button v-if="status === 'overload'" class="btn-ghost" @click="emit('confirmed', 'overload')">
          都舍不得，允许超载
        </button>
        <button class="btn" @click="emit('confirmed', status)">确认</button>
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
.hint { font-size: 13px; color: var(--ink-2); margin: 6px 0 12px; }
.row { display: flex; align-items: center; gap: 8px; padding: 10px 4px; border-bottom: 1px solid var(--line); font-size: 14px; }
.name { font-weight: 500; }
.reason { flex: 1; font-size: 12px; color: var(--ink-2); text-align: right; }
.actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
</style>
