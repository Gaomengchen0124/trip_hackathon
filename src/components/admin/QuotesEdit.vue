<script setup>
// quotes 数组编辑器：原著/台词引文（kind / brief / full / source）
const quotes = defineModel({ type: Array, default: () => [] })

const KINDS = ['原著', '台词']
function add() { quotes.value = [...quotes.value, { kind: '原著', brief: '', full: '', source: '' }] }
function remove(i) { quotes.value = quotes.value.filter((_, idx) => idx !== i) }
</script>

<template>
  <div class="quotes">
    <div v-for="(q, i) in quotes" :key="i" class="quote">
      <div class="q-head">
        <select v-model="q.kind"><option v-for="k in KINDS" :key="k" :value="k">{{ k }}</option></select>
        <input v-model="q.source" placeholder="出处到章/集，如《繁花》第 12 章 / 电视剧《繁花》第 8 集" class="src" />
        <button type="button" class="mini danger" @click="remove(i)">删除</button>
      </div>
      <input v-model="q.brief" placeholder="卡片短句 ≤20 字，要能独立成立" maxlength="40" />
      <textarea v-model="q.full" rows="3" placeholder="详情长文 80–120 字，和短句分开写，不是截断" maxlength="500" />
    </div>
    <button type="button" class="btn-ghost" @click="add">＋ 添加引文</button>
  </div>
</template>

<style scoped>
.quotes { display: grid; gap: 10px; }
.quote { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); }
.q-head { display: flex; gap: 8px; align-items: center; }
.src { flex: 1; }
input, textarea, select { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font: inherit; font-size: 13px; background: #fff; }
textarea { resize: vertical; }
.mini { font-size: 12px; color: var(--brand); text-decoration: underline; white-space: nowrap; }
.mini.danger { color: #c0392b; }
</style>
