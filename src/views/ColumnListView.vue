<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RouteCard from '../components/RouteCard.vue'
import * as api from '../api/adapter'

const route = useRoute()
const router = useRouter()
const columns = ref({ city: [] })

const NAMES = { city: '圣地巡礼' }
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
        <RouteCard
          v-for="l in g.lines"
          :key="l.lineId"
          :line="l"
          :label="g.label"
          @select="go"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}
.back {
  color: var(--ink-2);
  font-size: 14px;
}
h1 {
  font-size: 20px;
}
.group {
  margin-bottom: 24px;
}
.group h2 {
  font-size: 15px;
  color: var(--ink-2);
  margin-bottom: 10px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
</style>
