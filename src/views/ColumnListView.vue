<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as api from '../api/adapter'

const route = useRoute()
const router = useRouter()
const columns = ref({ city: [], figure: [], place: [] })

const NAMES = { city: '按城市', figure: '按人物', place: '按地名' }
const key = computed(() => route.params.key)
const title = computed(() => NAMES[key.value] || '栏目')

api.listColumns().then((c) => (columns.value = c))

function go(lineId) {
  router.push(`/customize/${lineId}`)
}
</script>

<template>
  <div class="page">
    <header class="bar">
      <button class="back" @click="router.push('/')">← 首页</button>
      <h1>{{ title }} · 全部</h1>
    </header>

    <section v-for="g in columns[key]" :key="g.label" class="group">
      <h2>{{ g.label }}</h2>
      <div class="cards">
        <button v-for="l in g.lines" :key="l.lineId" class="card" @click="go(l.lineId)">
          <span class="title">{{ l.title }}</span>
          <span class="meta">{{ l.city }} · 推荐 {{ l.recommendDays }} 天</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.bar { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.back { color: var(--ink-2); font-size: 14px; }
h1 { font-size: 20px; }
.group { margin-bottom: 24px; }
.group h2 { font-size: 15px; color: var(--ink-2); margin-bottom: 10px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.card {
  background: #fff; border-radius: var(--card-radius); box-shadow: var(--shadow);
  padding: 16px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
}
.title { font-weight: 600; }
.meta { font-size: 12px; color: var(--ink-2); }
</style>
