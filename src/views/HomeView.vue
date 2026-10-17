<script setup>
import { computed, onDeactivated, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import RouteCard from '../components/RouteCard.vue'
import IpWall from '../components/IpWall.vue'
import WishForm from '../components/WishForm.vue'
import YoyoBuddy from '../components/ui/YoyoBuddy.vue'
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
  <div class="page home-page">
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
      <div class="wish-entry"><YoyoBuddy :size="64" message="想去的故事还没上线？把愿望告诉我吧。" /><div class="wish-copy"><strong>巡礼许愿</strong><span>和 YOYO 留下期待的下一站</span></div><router-link class="go" to="/wishes">去许愿墙 <span aria-hidden="true">→</span></router-link></div>
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
            .slice(0, 5)"
          :key="g.label"
          class="card-wrap"
        >
          <RouteCard :line="g.lines[0]" :label="g.label" @select="go" />
        </div>
        <router-link class="card more" aria-label="查看全部巡礼路线" :to="`/column/${meta.key}`"
          ><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></router-link
        >
      </div>
    </section>
  </div>
</template>

<style scoped>
.recommend-entry{width:100%;margin:0 0 22px;padding:22px 24px;display:flex;gap:18px;align-items:center;text-align:left;border:1px solid #d6c5a7;border-radius:18px;background:linear-gradient(120deg,#f1e7d3,#fcf8ef);box-shadow:0 5px 20px #80633310;transition:transform .18s,box-shadow .18s,border-color .18s}.recommend-symbol{font-size:38px;color:#9a7942}.recommend-entry>span:nth-child(2){flex:1;display:grid;gap:5px}.recommend-entry small{font-size:10px;color:#806333;letter-spacing:.08em}.recommend-entry strong{font-family:serif;font-size:21px;font-weight:600}.recommend-entry span span{font-size:12px;color:var(--ink-2)}.recommend-entry b{font-size:24px;font-weight:400;color:#806333}@media(hover:hover){.recommend-entry:hover{border-color:#9a7942;transform:translateY(-3px);box-shadow:0 8px 24px #40272616}}.recommend-entry:active{transform:translateY(-1px)}@media(prefers-reduced-motion:reduce){.recommend-entry{transition:none}.recommend-entry:hover,.recommend-entry:active{transform:none}}.recommend-entry:focus-visible{outline:2px solid #806333;outline-offset:4px}@media(max-width:600px){.recommend-entry{padding:18px 16px;gap:12px}.recommend-entry strong{font-size:18px}.recommend-symbol{font-size:29px}.recommend-entry span span{font-size:11px}}

.home-page{padding-top:0}
.wish-entry{max-width:420px;margin:30px auto 0;padding:10px 18px;border:1px solid var(--line);border-radius:18px;display:flex;align-items:center;gap:16px;background:rgba(255,255,255,.78);box-shadow:var(--shadow);transition:transform var(--motion-normal) var(--ease-out),box-shadow var(--motion-normal) var(--ease-out);text-align:left}
.wish-copy{flex:1;min-width:0}
.wish-entry .go{padding:10px 0 10px 8px}
.wish-entry .go span{color:inherit;font-size:16px;margin-left:4px}
@media(hover:hover){.wish-entry:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(34,76,115,.08)}}
.wish-entry:focus-within{box-shadow:0 8px 24px rgba(43,43,43,.055)}
@media(prefers-reduced-motion:reduce){.wish-entry{transition:none}.wish-entry:hover{transform:none}}
.wish-entry strong{display:block;font-size:15px}.wish-entry span{font-size:12px;color:var(--ink-2)}.wish-entry .go,.wish-link{color:var(--brand);font-size:14px;white-space:nowrap}.wish-link{margin-top:8px}
.hero {
  text-align: center;
  padding: 24px 0 48px;
}
h1 {
  font-size: 30px;
  letter-spacing: 4px;
}
.slogan {
  font-family: Georgia, "Songti SC", "STSong", serif;
  font-size: 16px;
  font-weight: 400;
  letter-spacing: 0.06em;
  line-height: 1.9;
  color: var(--ink-2);
  margin: 0 0 32px;
  text-wrap: balance;
}
.searchbox {
  position: relative;
  max-width: 520px;
  margin: 0 auto;
}
.searchbox input {
  width: 100%;
  padding: 16px 24px;
  border-radius: 999px;
  border: 1px solid var(--brand-border);
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
  margin-top: 36px;
}
.wall h2 {
  font-size: 17px;
  margin-bottom: 12px;
}
/* 桌面五张路线卡与“更多”均匀铺满；小屏保留横向浏览。 */
.cards {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr)) 48px;
  gap: 12px;
  align-items: stretch;
  padding-bottom: 4px;
}
.card-wrap { min-width: 0; }
.card-wrap :deep(.route-card) { height: 100%; }
.card-wrap :deep(.route-card .body) { flex: 1; grid-template-rows: auto 1fr auto; }
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
  width: auto;
  padding: 0;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: var(--ink-2);
}
@media(max-width:960px){
  .cards{display:flex;overflow-x:auto;padding:4px 0 8px}
  .card-wrap{flex:0 0 calc((100% - 24px) / 3)}
  .more{flex:0 0 48px}
}
@media(max-width:600px){
  .card-wrap{flex-basis:76%;max-width:260px}
  .hero{padding:22px 0 36px}
  .slogan{font-size:14px;letter-spacing:.04em;line-height:1.9;max-width:28em;margin:0 auto 24px}
  .wish-entry{margin-top:24px;padding:8px 14px;gap:12px}
  .wish-entry :deep(.dolphin-guide){--guide-size:56px!important}
  .wish-entry :deep(.yoyo-buddy){--buddy-size:56px!important}
  .wish-entry strong{font-size:14px}
  .wish-entry .go{font-size:13px}
  .searchbox input{padding:15px 20px;font-size:14px}
}
</style>
