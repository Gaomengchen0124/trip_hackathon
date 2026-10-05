<script setup>
/**
 * S3 左右两栏勾选列表（基础版）
 * 左栏 IP 点按 tier（S>A>B）排序；右栏城市景点按数组顺序（即知名度）排序。
 */
const props = defineProps({
  title: { type: String, required: true },
  pois: { type: Array, required: true },
  checkedIds: { type: Array, required: true },
})
const emit = defineEmits(['toggle'])

const TIER_LABEL = { S: '⭐灵魂', A: '重要', B: '可去' }

function tag(p) {
  return p.type === 'ip' ? TIER_LABEL[p.tier] || '' : '经典'
}
</script>

<template>
  <div class="col card-block">
    <h3>{{ title }}（{{ pois.length }}）</h3>
    <div class="tools">
      <button @click="pois.forEach((p) => !checkedIds.includes(p.poiId) && emit('toggle', p.poiId))">全选</button>
      <button @click="pois.forEach((p) => checkedIds.includes(p.poiId) && emit('toggle', p.poiId))">清空</button>
    </div>
    <label v-for="p in pois" :key="p.poiId" class="row">
      <input type="checkbox" :checked="checkedIds.includes(p.poiId)" @change="emit('toggle', p.poiId)" />
      <span class="name">{{ p.name }}</span>
      <span class="tag">{{ tag(p) }}</span>
      <span class="dur">{{ p.durationNormal }}min</span>
    </label>
  </div>
</template>

<style scoped>
.card-block { background: #fff; border-radius: var(--card-radius); box-shadow: var(--shadow); }
.col { padding: 12px; min-width: 0; }
h3 { font-size: 15px; margin-bottom: 8px; }
.tools { display: flex; gap: 12px; font-size: 12px; color: var(--ink-2); margin-bottom: 8px; }
.row { display: flex; align-items: center; gap: 8px; padding: 8px 4px; border-bottom: 1px solid var(--line); font-size: 14px; cursor: pointer; }
.row:last-child { border-bottom: none; }
.name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag { font-size: 11px; color: var(--brand); background: var(--brand-light); border-radius: 4px; padding: 1px 6px; white-space: nowrap; }
.dur { font-size: 12px; color: var(--ink-2); white-space: nowrap; }
</style>
