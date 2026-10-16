<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import RouteCard from '../components/RouteCard.vue'
import IpWall from '../components/IpWall.vue'
import WishForm from '../components/WishForm.vue'
import * as api from '../api/adapter'

const router = useRouter()
const wishOpen = ref(false)
const wishIp = ref('')
function openWish(ip = '') { wishIp.value = ip; wishOpen.value = true }
const searching = ref(false)
const searchError = ref(false)
let searchVersion = 0
const keyword = ref('')
const suggestions = ref([])
const columns = ref({ city: [] })

const COL_META = { city: { title: '选择你的圣地巡礼之行', key: 'city' } }

api.listColumns().then((c) => (columns.value = c))

// IP 墙:三个栏目 flatMap 后按 ipId 去重(龙族保留首个 = 主线路)
const wallLines = computed(() => {
  const seen = new Set()
  return Object.values(columns.value)
    .flat()
    .flatMap((g) => g.lines ?? [])
    .filter((l) => l?.ipId && !seen.has(l.ipId) && seen.add(l.ipId))
})

// 丢弃过期请求，避免搜索中闪现空结果。
let timer = null
watch(keyword, (kw) => {
  clearTimeout(timer)
  const version = ++searchVersion
  suggestions.value = []
  searchError.value = false
  searching.value = !!kw.trim()
  if (!kw.trim()) return
  timer = setTimeout(async () => {
    try {
      const result = await api.search(kw)
      if (version === searchVersion) suggestions.value = result
    } catch { if (version === searchVersion) searchError.value = true }
    finally { if (version === searchVersion) searching.value = false }
  }, 200)
})

function go(lineId) {
  router.push(`/line/${lineId}`)
}
</script>

<template>
  <div class="page">
    <section class="hero">
      <p class="slogan">循着文字与光影的足迹，赴一场现实的朝圣。</p>

      <div class="searchbox">
        <input
          v-model="keyword"
          placeholder="搜书名 / 人物 / 地名 / 城市，如：繁花、阿宝、黄河路"
        />
        <div v-if="keyword.trim()" class="dropdown">
          <p v-if="searching" class="none" role="status">搜索中…</p>
          <p v-else-if="searchError" class="none" role="alert">搜索暂不可用，请稍后重试</p>
          <div v-else-if="!suggestions.length" class="none">
            <p>暂无相关路线</p>
            <button class="wish-link" @click="openWish(keyword.trim())">去许愿 →</button>
          </div>
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
      <div class="wish-entry"><div><strong>巡礼许愿</strong><span>留下你期待的下一站</span></div><button @click="openWish()">去许愿 →</button></div>
    </section>
    <WishForm v-if="wishOpen" :initial-ip="wishIp" @close="wishOpen = false" />

    <IpWall :lines="wallLines" />

    <section v-for="(meta, colKey) in COL_META" :key="colKey" class="wall">
      <h2>{{ meta.title }}</h2>
      <router-link class="recommend-entry" to="/recommend"><span class="recommend-symbol" aria-hidden="true">✧</span><span><small>智能推荐 · 灵感从这里开始</small><strong>让喜欢的故事，带你去下一站</strong><span>从你的兴趣出发，发现意想不到的作品和巡礼路线。</span></span><b aria-hidden="true">↗</b></router-link>
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
        <router-link class="card more" aria-label="查看全部巡礼路线" :to="`/column/${meta.key}`"
          >···</router-link
        >
      </div>
    </section>
  </div>
</template>

<style scoped>
.recommend-entry{width:100%;margin:0 0 22px;padding:22px 24px;display:flex;gap:18px;align-items:center;text-align:left;border:1px solid #d6c5a7;border-radius:18px;background:linear-gradient(120deg,#f1e7d3,#fcf8ef);box-shadow:0 5px 20px #80633310;transition:transform .18s,box-shadow .18s,border-color .18s}.recommend-symbol{font-size:38px;color:#9a7942}.recommend-entry>span:nth-child(2){flex:1;display:grid;gap:5px}.recommend-entry small{font-size:10px;color:#806333;letter-spacing:.08em}.recommend-entry strong{font-family:serif;font-size:21px;font-weight:600}.recommend-entry span span{font-size:12px;color:var(--ink-2)}.recommend-entry b{font-size:24px;font-weight:400;color:#806333}@media(hover:hover){.recommend-entry:hover{border-color:#9a7942;transform:translateY(-3px);box-shadow:0 8px 24px #40272616}}.recommend-entry:active{transform:translateY(-1px)}@media(prefers-reduced-motion:reduce){.recommend-entry{transition:none}.recommend-entry:hover,.recommend-entry:active{transform:none}}.recommend-entry:focus-visible{outline:2px solid #806333;outline-offset:4px}@media(max-width:600px){.recommend-entry{padding:18px 16px;gap:12px}.recommend-entry strong{font-size:18px}.recommend-symbol{font-size:29px}.recommend-entry span span{font-size:11px}}

.wish-entry{max-width:480px;margin:18px auto 0;padding:15px 20px;border:1px solid var(--line);border-radius:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(255,255,255,.76);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 3px 12px rgba(43,43,43,.025);transition:transform .2s ease,box-shadow .2s ease;text-align:left}
@media(hover:hover){.wish-entry:hover{transform:translateY(-2px) scale(1.015);box-shadow:0 8px 24px rgba(43,43,43,.055)}}
.wish-entry:focus-within{box-shadow:0 8px 24px rgba(43,43,43,.055)}
@media(prefers-reduced-motion:reduce){.wish-entry{transition:none}.wish-entry:hover{transform:none}}
.wish-entry strong{display:block;font-size:15px}.wish-entry span{font-size:12px;color:var(--ink-2)}.wish-entry button,.wish-link{color:var(--brand);font-size:14px;white-space:nowrap}.wish-link{margin-top:8px}
.hero {
  text-align: center;
  padding: 20px 0 24px;
}
h1 {
  font-size: 30px;
  letter-spacing: 4px;
}
.slogan {
  font-family: Georgia, "Songti SC", "STSong", serif;
  font-size: 16px;
  font-weight: 400;
  letter-spacing: 0.12em;
  line-height: 1.9;
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
