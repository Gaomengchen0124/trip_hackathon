<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import RouteCard from '../components/RouteCard.vue'
import IpWall from '../components/IpWall.vue'
import * as api from '../api/adapter'

const router = useRouter()
const keyword = ref('')
const suggestions = ref([])
const columns = ref({ city: [] })

const COL_META = { city: { title: '按城市', key: 'city' } }

api.listColumns().then((c) => (columns.value = c))

// IP 墙:三个栏目 flatMap 后按 ipId 去重(龙族保留首个 = 主线路)
const wallLines = computed(() => {
  const seen = new Set()
  return Object.values(columns.value)
    .flat()
    .flatMap((g) => g.lines ?? [])
    .filter((l) => l?.ipId && !seen.has(l.ipId) && seen.add(l.ipId))
})

// 输入即联想（简单防抖）
let timer = null
watch(keyword, (kw) => {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    suggestions.value = kw.trim() ? await api.search(kw) : []
  }, 200)
})

function go(lineId) {
  router.push(`/customize/${lineId}`)
}
</script>

<template>
  <div class="page">
    <section class="hero">
      <h1>跟着书本去旅行</h1>
      <p class="slogan">把"我热爱的故事"变成"一次可执行的旅行"</p>

      <div class="searchbox">
        <input
          v-model="keyword"
          placeholder="搜书名 / 人物 / 地名 / 城市，如：繁花、阿宝、黄河路"
        />
        <div v-if="keyword.trim()" class="dropdown">
          <p v-if="!suggestions.length" class="none">
            抱歉，暂时未收录该圣地巡礼内容
          </p>
          <button
            v-for="l in suggestions"
            :key="l.lineId"
            class="item"
            @click="go(l.lineId)"
          >
            {{ l.title }}
            <span class="meta"
              >{{ l.city }} · 推荐 {{ l.recommendDays }} 天</span
            >
          </button>
        </div>
      </div>
    </section>

    <IpWall :lines="wallLines" />

    <section v-for="(meta, colKey) in COL_META" :key="colKey" class="wall">
      <h2>{{ meta.title }}</h2>
      <div class="cards">
        <div
          v-for="g in columns[colKey]
            .filter((g) => g.lines?.length)
            .slice(0, 3)"
          :key="g.label"
          class="card-wrap"
        >
          <RouteCard :line="g.lines[0]" :label="g.label" @select="go" />
        </div>
        <router-link class="card more" :to="`/column/${meta.key}`"
          >···</router-link
        >
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  text-align: center;
  padding: 48px 0 24px;
}
h1 {
  font-size: 30px;
  letter-spacing: 4px;
}
.slogan {
  color: var(--ink-2);
  margin: 8px 0 24px;
}
.searchbox {
  position: relative;
  max-width: 480px;
  margin: 0 auto;
}
.searchbox input {
  width: 100%;
  padding: 14px 20px;
  border-radius: 999px;
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  outline: none;
}
.dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 8px);
  background: #fff;
  border-radius: var(--card-radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  text-align: left;
  z-index: 30;
}
.item {
  display: block;
  width: 100%;
  padding: 12px 20px;
  text-align: left;
}
.item:hover {
  background: var(--brand-light);
}
.meta {
  font-size: 12px;
  color: var(--ink-2);
  margin-left: 8px;
}
.none {
  padding: 14px 20px;
  color: var(--ink-2);
  font-size: 14px;
}
.wall {
  margin-top: 24px;
}
.wall h2 {
  font-size: 17px;
  margin-bottom: 12px;
}
/* 栏目收缩为一行可横滑的小卡片 */
.cards {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.card-wrap {
  flex: none;
  width: 190px;
}
.card {
  background: #fff;
  border-radius: var(--card-radius);
  box-shadow: var(--shadow);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  min-height: 120px;
}
.more {
  flex: none;
  width: 64px;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: var(--ink-2);
}
</style>
