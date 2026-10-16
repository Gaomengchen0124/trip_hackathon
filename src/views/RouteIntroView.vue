<script setup>
import FavoriteButton from '../components/FavoriteButton.vue'
import CommentSection from '../components/CommentSection.vue'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import * as api from '../api/adapter'
import PhotoFrame from '../components/ui/PhotoFrame.vue'
import MapContainer from '../components/MapContainer.vue'
import QuoteCard from '../components/QuoteCard.vue'
import PoiSubmission from '../components/PoiSubmission.vue'
import { poiCover } from '../utils/travel-ui'
import { workIntros, cityIntros } from '../data/route-intros'
const route = useRoute()
const detail = ref(null), loading = ref(true), error = ref(''), active = ref(''), contributing = ref(false)
const pois = computed(() => (detail.value?.pois || []).filter(p => p.type === 'ip'))
let version = 0
watch(() => route.params.lineId, async id => {
 const current = ++version
 loading.value = true; detail.value = null; error.value = ''; active.value = ''; contributing.value = false
 try { const data = await api.getLineDetail(id); if (current === version) detail.value = data }
 catch { if (current === version) error.value = '路线暂无法加载，请返回首页重试。' }
 finally { if (current === version) loading.value = false }
}, {immediate:true})
function locate(id) { active.value = id; document.getElementById(`intro-${id}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block:'center' }) }
</script>
<template>
 <main class="page route-intro">
  <nav class="intro-back-links" aria-label="返回导航"><router-link v-if="route.query.from==='recommend'" class="back back-to-recommend" :to="{name:'recommend',query:{edit:'1'}}">← 返回推荐筛选</router-link><router-link class="back" to="/">← 首页</router-link></nav>
  <p v-if="loading" class="loading" role="status">正在展开这段旅程…</p>
  <p v-else-if="error" role="alert">{{ error }}</p>
  <template v-else-if="detail">
   <section class="intro-hero">
    <FavoriteButton :key="detail.line.lineId" class="hero-favorite" :entity-key="`line:${detail.line.lineId}`" label="收藏路线" icon-only />
    <PhotoFrame :src="detail.line.cover" :alt="detail.line.title" ratio="16 / 9" eager />
    <div class="hero-copy"><p class="eyebrow">沿着故事，走进现实</p><h1>{{ detail.line.title }}</h1><p class="hero-meta">{{ detail.line.city }} · {{ pois.length }} 个巡礼点 · 建议 {{ detail.line.recommendDays }} 天</p><router-link class="btn" :to="`/customize/${detail.line.lineId}`">定制行程 ↗</router-link></div>
   </section>
   <nav class="section-nav" aria-label="路线介绍章节"><a href="#work">作品介绍</a><a href="#city">城市介绍</a><a href="#ip-overview">IP 点位</a><a href="#contribute">补充点位</a></nav>
   <div class="story-grid"><section id="work" class="story"><span class="eyebrow">01 / THE STORY</span><h2>作品介绍</h2><h3>《{{ detail.ip.name }}》</h3><p class="author">{{ detail.ip.author }}</p><p>{{ workIntros[detail.ip.ipId] || `循着《${detail.ip.name}》的地点线索，在现实中重访故事。` }}</p></section>
   <section id="city" class="story"><span class="eyebrow">02 / THE CITY</span><h2>城市介绍</h2><h3>{{ detail.line.city }}</h3><p>{{ cityIntros[detail.line.city] || '沿着作品中的地点线索，在街道与日常生活之间重新认识这座城市。' }}</p></section></div>
   <section id="ip-overview" class="overview"><div class="section-heading"><div><span class="eyebrow">03 / IN THE FOOTSTEPS</span><h2>IP 点位总览</h2></div><span class="muted">{{ pois.length }} 个故事坐标</span></div><p class="muted small">含情节线索，点击「作品关联」展开。</p>
    <div v-if="pois.length" class="overview-layout"><div class="map-panel"><MapContainer :pois="pois" :selected-ids="pois.map(p=>p.poiId)" :active-poi-id="active" :city="detail.line.city" :ip-name="detail.ip.name" @marker-click="locate" /><p class="map-note">点击地图标记，查看对应地点</p></div>
    <div class="poi-list"><article v-for="(poi,i) in pois" :key="poi.poiId" :id="`intro-${poi.poiId}`" class="intro-poi" :class="{active:active===poi.poiId}"><button class="poi-photo" :aria-label="`地图定位${poi.name}`" @click="active=poi.poiId"><PhotoFrame :src="poiCover(poi)" :alt="poi.name" ratio="16 / 10" /></button><div class="poi-copy"><p class="eyebrow">{{ String(i+1).padStart(2,'0') }} · {{ poi.cluster }}</p><h3>{{ poi.name }}</h3><p>{{ poi.intro }}</p><details><summary>作品关联</summary><QuoteCard v-for="(q,j) in poi.quotes || []" :key="j" :quote="q" /><p v-if="!poi.quotes?.length" class="muted">情节资料整理中</p></details><p v-if="poi.tips" class="tip">到访提示 · {{ poi.tips }}</p></div></article></div></div>
    <p v-else class="muted">巡礼点位整理中，欢迎补充线索。</p>
   </section>
   <section id="contribute" class="contribute"><div class="contribute-icon" aria-hidden="true">📍</div><span class="eyebrow">把你的发现，留给下一位同好</span><h2>补充巡礼点位</h2><p>分享尚未收录的地点、景点照片与故事线索。</p><button class="btn-ghost" @click="contributing=true">补充点位 ＋</button><small>投稿审核后收录 · IP 点 / 其他点</small></section>
   <CommentSection :entity-key="`line:${detail.line.lineId}`" />
   <footer class="intro-footer"><span>{{ detail.line.title }}</span><router-link class="btn" :to="`/customize/${detail.line.lineId}`">定制行程 ↗</router-link></footer>
   <PoiSubmission v-if="contributing" :line="detail.line" :ip="detail.ip" :existing-pois="detail.pois" @close="contributing=false" />
  </template>
 </main>
</template>
<style scoped>
.intro-back-links{display:flex;gap:24px;flex-wrap:wrap}.route-intro{max-width:1120px}.back{display:inline-block;font-size:13px;color:var(--ink-2);margin-bottom:20px}.loading{padding:80px;text-align:center}.intro-hero{display:grid;grid-template-columns:1.2fr 1fr;gap:42px;align-items:center;padding:24px;background:rgba(255,255,255,.75);border:1px solid var(--line);border-radius:24px;overflow:hidden}.intro-hero :deep(.photo-frame){border-radius:14px}.hero-copy{padding:10px 12px}.eyebrow{font-size:11px;letter-spacing:1.5px;color:var(--ink-2)}h1{font-family:serif;font-size:38px;line-height:1.35;margin:14px 0}.hero-meta{font-size:14px;color:var(--ink-2);margin:16px 0 26px}.section-nav{display:flex;gap:30px;padding:22px 4px;border-bottom:1px solid var(--line);font-size:13px;overflow:auto;white-space:nowrap}.section-nav a:hover{color:var(--brand)}.story-grid{display:grid;grid-template-columns:1fr 1fr;gap:70px;padding:54px 4px}.story h2{font-size:15px;font-weight:400;color:var(--ink-2);margin:8px 0 20px}.story h3{font-family:serif;font-size:25px;margin:8px 0 14px}.story>p:last-child{font-size:15px;line-height:2.1}.author{font-size:12px;color:var(--ink-2);margin-top:-8px;margin-bottom:16px}.section-heading{display:flex;justify-content:space-between;gap:16px;align-items:end}.section-heading h2{font-family:serif;font-size:26px;margin-top:8px}.muted{color:var(--ink-2);font-size:13px}.small{margin:10px 0 24px}.overview-layout{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start}.map-panel{position:sticky;top:20px;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:white}.map-panel :deep(.map-box){height:440px}.map-panel :deep(.map-legend){display:none}.map-note{padding:12px;text-align:center;font-size:12px;color:var(--ink-2)}.poi-list{display:grid;gap:24px}.intro-poi{border:1px solid var(--line);border-radius:18px;overflow:hidden;background:#fff;scroll-margin-top:24px}.intro-poi.active{border-color:var(--brand);box-shadow:0 8px 24px #2b2b2b0a}.poi-photo{display:block;width:100%;text-align:left}.poi-copy{padding:22px}.poi-copy h3{font-family:serif;font-size:22px;margin:8px 0 12px}.poi-copy>p:not(.eyebrow){font-size:14px;line-height:1.9}.poi-copy details{margin-top:18px}.poi-copy summary{font-size:13px;color:var(--brand);cursor:pointer;margin-bottom:10px}.tip{color:var(--ink-2);margin-top:16px}.contribute{text-align:center;padding:46px 20px;margin-top:54px;border:1px solid var(--line);background:rgba(255,255,255,.75);border-radius:22px;box-shadow:0 5px 20px #2b2b2b04}.contribute-icon{font-size:32px;margin-bottom:12px}.contribute h2{font-family:serif;font-size:28px;margin:8px 0}.contribute p{color:var(--ink-2);font-size:14px;margin:12px 0 22px}.contribute small{display:block;font-size:11px;color:var(--ink-2);margin-top:14px}.intro-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid var(--line);margin-top:40px;padding-top:24px}.intro-footer>span{font-family:serif;font-size:18px}section{scroll-margin-top:20px}a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--brand);outline-offset:3px}@media(max-width:700px){.intro-hero{grid-template-columns:1fr;gap:6px;padding:12px}.hero-copy{padding:16px}h1{font-size:30px}.story-grid{grid-template-columns:1fr;gap:32px;padding:32px 4px}.section-nav{gap:24px}.overview-layout{grid-template-columns:1fr}.map-panel{position:relative;top:0}.map-panel :deep(.map-box){height:300px}.contribute{margin-top:32px}.intro-footer>span{font-size:15px}}
.intro-hero { position: relative; }
.hero-favorite { position: absolute; top: 18px; right: 18px; z-index: 1; }
.hero-copy { padding-top: 48px; }
@media (max-width: 700px) {
 .hero-favorite { top: 20px; right: 20px; }
 .hero-copy { padding-top: 16px; }
}
</style>
