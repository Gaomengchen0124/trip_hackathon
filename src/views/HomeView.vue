<script setup>
import { computed, onDeactivated, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import RouteCard from '../components/RouteCard.vue'
import IpWall from '../components/IpWall.vue'
import WishForm from '../components/WishForm.vue'
import '../assets/atlas-home.css'
import * as api from '../api/adapter'

defineOptions({ name: 'HomeView' })

const router = useRouter()
const wishOpen = ref(false)
// A cached home must not leave its teleported dialog open on another route.
onDeactivated(() => { wishOpen.value = false })
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
  <div class="page home-page atlas-home">

    <WishForm v-if="wishOpen" :initial-ip="wishIp" @close="wishOpen = false" />

    <section class="atlas-darkroom" aria-labelledby="atlas-darkroom-title">
      <div class="atlas-darkroom-heading" data-story-reveal><div><p class="atlas-eyebrow">Ⅰ / A COLLECTION OF MOMENTS</p><h2 id="atlas-darkroom-title">故事里的风景<span>，在此显影。</span></h2></div><p>有些地方，还未抵达，<br />就已在心里走过千遍。</p></div>
      <IpWall :lines="wallLines" />
      <div class="atlas-darkroom-foot"><span>一帧光影，一段旅途</span><span>随照片走进故事 <i aria-hidden="true">↗</i></span></div>
    </section>

    <section v-for="(meta, colKey) in COL_META" :key="colKey" class="wall atlas-route-collection">
      <div class="atlas-collection-heading" data-story-reveal><div><p class="atlas-eyebrow">Ⅱ / CHOOSE YOUR NEXT CHAPTER</p><h2>{{ meta.title }}</h2></div><p>下一章，<em>去往哪里？</em><br /><span>让故事的坐标，成为旅行的起点。</span></p></div>
      <div class="atlas-route-search">
        <div class="atlas-search-label"><span>搜索巡礼路线</span><span aria-hidden="true">FIND YOUR STORY</span></div>
        <div class="searchbox">
          <svg class="atlas-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="6.5" /><path d="m15 15 5 5" /></svg>
        <input
          v-model="keyword"
          aria-label="搜索书名、人物、地名或城市"
          placeholder="书名、人物、地名或城市…"
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
        <p class="atlas-search-example">例如：繁花 / 阿宝 / 黄河路</p>
      </div>
      <div class="cards">
        <div
          v-for="(g, index) in columns[colKey]
            .filter((g) => g.lines?.length)
            .slice(0, 5)"
          :key="g.label"
          class="card-wrap"
          :class="{ 'atlas-lead-route': index === 0 }"
        >
          <span class="atlas-route-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
          <RouteCard :line="g.lines[0]" :label="g.label" :sizes="index === 0 ? '(max-width: 760px) 90vw, 540px' : '(max-width: 760px) 44vw, 300px'" @select="go" />
        </div>
      </div>
      <router-link class="atlas-all-routes more" aria-label="查看全部巡礼路线" :to="`/column/${meta.key}`"><span>继续翻阅巡礼图鉴</span><span class="atlas-all-routes-rule" aria-hidden="true"></span><span>查看全部路线 <i aria-hidden="true">↗</i></span></router-link>
    </section>
  </div>
</template>
