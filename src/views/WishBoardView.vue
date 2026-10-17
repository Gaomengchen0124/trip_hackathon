<script setup>
// 巡礼许愿墙：左侧高德式热度榜（悬浮展开详情、点击聚焦）+ 右侧作品 IP 墙。
// 交互对照高德 report.amap.com：行悬浮渐变+标题缩进、子详情回弹展开、排名序号 counter、
// 首次载入逐行级联进场、点行聚焦右侧墙卡。榜单数据来自 /api/wishes/board（已脱敏）。
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import WishForm from '../components/WishForm.vue'

const router = useRouter()
const groups = ref([])
const sortBy = ref('count') // count=按许愿人数 like=按点赞
const focusedKey = ref('')
const hoverKey = ref('')
const wishOpen = ref(false)
const failed = ref(false)
// 榜单 3D 翻入：行初始 rotateY(90deg)，数据到位后加 turned 逐行翻正（对照高德 .turning）。
// 注意必须在数据渲染后触发——onMounted 时行还不存在。
const turned = ref(false)

async function load() {
  failed.value = false
  try {
    const res = await fetch('/api/wishes/board')
    if (!res.ok) throw new Error()
    groups.value = await res.json()
    if (!turned.value) {
      await nextTick()
      // 双 rAF：先让 rotateY(90deg) 的初始态上屏，再加 turned 才有翻转动画
      requestAnimationFrame(() => requestAnimationFrame(() => { turned.value = true }))
    }
  } catch { failed.value = true }
}
load()

const sorted = computed(() => {
  const key = sortBy.value === 'like' ? 'likes' : 'count'
  return [...groups.value].sort((a, b) => b[key] - a[key] || b.lastAt.localeCompare(a.lastAt))
})
const maxVal = computed(() => Math.max(1, ...sorted.value.map((g) => sortBy.value === 'like' ? g.likes : g.count)))
const keyOf = (g) => `${g.ip}${g.city}`

function timeText(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return `${Math.floor(diff / 86400000)} 天前`
}

async function like(wish, group) {
  if (wish._busy) return
  wish._busy = true
  wish._error = ''
  try {
    const res = await fetch('/api/wishes/like', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: wish.id, liked: !wish.liked }) })
    if (!res.ok) throw new Error()
    const { likes, liked } = await res.json()
    group.likes += likes - wish.likes
    wish.likes = likes
    wish.liked = liked
    wish._pop = liked
    setTimeout(() => (wish._pop = false), 400)
  } catch { wish._error = '操作失败，请重试' } finally { wish._busy = false }
}

async function focus(g) {
  const key = keyOf(g)
  focusedKey.value = focusedKey.value === key ? '' : key
  if (focusedKey.value) {
    await nextTick()
    document.getElementById(`wish-card-${CSS.escape(key)}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}
</script>

<template>
  <div class="page board">
    <header class="bar">
      <button class="back" @click="router.push('/')">← 首页</button>
      <h1>巡礼许愿墙</h1>
      <button class="btn wish-cta" @click="wishOpen = true">＋ 我也要许愿</button>
    </header>
    <p class="slogan">留下你期待的下一站，点赞帮喜欢的作品进入官方视野。</p>

    <p v-if="failed" class="state" role="alert">
      许愿墙暂不可用，请稍后重试
      <button class="retry" @click="load">重试</button>
    </p>
    <div v-else-if="!groups.length && !sorted.length" class="state">
      <p>还没有愿望，来许第一个愿吧 ✨</p>
      <button class="btn" @click="wishOpen = true">去许愿</button>
    </div>

    <div v-else class="cols">
      <!-- 左：高德式热度榜 -->
      <aside class="rank">
        <div class="tabs" role="tablist">
          <button role="tab" :aria-selected="sortBy === 'count'" :class="{ on: sortBy === 'count' }" @click="sortBy = 'count'">按许愿</button>
          <button role="tab" :aria-selected="sortBy === 'like'" :class="{ on: sortBy === 'like' }" @click="sortBy = 'like'">按点赞</button>
        </div>
        <ol v-if="sorted.length" class="rank-list" :class="{ turned }">
          <li
            v-for="(g, i) in sorted"
            :key="keyOf(g)"
            class="row"
            :class="{ focus: focusedKey === keyOf(g) }"
            :style="{ '--delay': `${Math.min(i * 0.06, 0.9)}s`, '--val': `${((sortBy === 'like' ? g.likes : g.count) / maxVal) * 100}%` }"
            @mouseenter="hoverKey = keyOf(g)"
            @mouseleave="hoverKey = ''"
            @click="focus(g)"
          >
            <div class="row-head">
              <span class="name">《{{ g.ip }}》<small>{{ g.city }}</small></span>
              <span class="val">{{ sortBy === 'like' ? `❤️ ${g.likes}` : `${g.count} 人` }}</span>
            </div>
            <div class="bar-track" aria-hidden="true"><i /></div>
            <div class="sub">
              <ul>
                <li>最想去的：{{ g.topPoints.length ? g.topPoints.join('·') : '还没写点位' }}</li>
                <li>总赞数：{{ g.likes }}　许愿人数：{{ g.count }}</li>
                <li>最近许愿：{{ timeText(g.lastAt) }}</li>
              </ul>
            </div>
          </li>
        </ol>
        <p v-if="focusedKey" class="unfocus"><button @click="focusedKey = ''">查看全部作品 ↑</button></p>
      </aside>

      <!-- 右：作品 IP 墙 -->
      <section class="wall" aria-label="许愿作品墙">
        <article
          v-for="g in sorted"
          :id="`wish-card-${keyOf(g)}`"
          :key="keyOf(g)"
          class="wish-card"
          :class="{ dim: (focusedKey || hoverKey) && focusedKey !== keyOf(g) && hoverKey !== keyOf(g), lit: focusedKey === keyOf(g) || hoverKey === keyOf(g) }"
        >
          <button class="card-head" @click="focus(g)">
            <span class="cover" aria-hidden="true">《{{ g.ip.slice(0, 1) }}》</span>
            <span class="body">
              <strong>《{{ g.ip }}》</strong>
              <span class="meta">{{ g.city }} · {{ g.count }} 人许愿 · ❤️ {{ g.likes }}</span>
              <span v-if="g.topPoints.length" class="points">{{ g.topPoints.join(' · ') }}</span>
            </span>
          </button>
          <div v-if="focusedKey === keyOf(g)" class="detail">
            <ul class="wishes">
              <li v-for="w in g.wishes" :key="w.id" class="wish">
                <div class="wish-main">
                  <p v-if="w.scene" class="scene">“{{ w.scene }}”</p>
                  <p v-if="w.points.length" class="pts">{{ w.points.join(' · ') }}</p>
                  <p class="foot">{{ w.styles.join(' / ') }}<template v-if="w.styles.length"> · </template>{{ timeText(w.createdAt) }}</p>
                  <p v-if="w._error" class="foot" role="alert">{{ w._error }}</p>
                </div>
                <button class="like" :class="{ on: w.liked, pop: w._pop }" :disabled="w._busy" :aria-pressed="!!w.liked" :aria-label="`${w.liked ? '取消点赞' : '点赞'}（${w.likes}）`" :title="w.liked ? '取消点赞' : '点赞'" @click="like(w, g)">
                  <span aria-hidden="true">❤</span><b>{{ w.likes }}</b>
                </button>
              </li>
            </ul>
            <p v-if="g.wishes.length > 3" class="more-hint">共 {{ g.wishes.length }} 条愿望，按赞数排序</p>
          </div>
        </article>
      </section>
    </div>

    <WishForm v-if="wishOpen" @close="wishOpen = false; load()" />
  </div>
</template>

<style scoped>
.bar{display:flex;align-items:center;gap:12px}
.bar h1{font-size:20px;letter-spacing:2px}
.back{color:var(--ink-2);font-size:14px;white-space:nowrap}
.wish-cta{margin-left:auto;padding:8px 20px;font-size:14px}
.slogan{color:var(--ink-2);font-size:13px;margin:10px 0 18px}
.state{text-align:center;padding:60px 0;color:var(--ink-2);display:grid;gap:14px;justify-items:center}
.retry{color:var(--brand);text-decoration:underline}

.cols{display:grid;grid-template-columns:300px minmax(0,1fr);gap:20px;align-items:start}
@media(max-width:820px){.cols{grid-template-columns:1fr}}

/* ===== 左：热度榜（对照高德 report.amap.com 的交互）===== */
.rank{position:sticky;top:16px}
.tabs{display:flex;gap:8px;margin-bottom:10px}
.tabs button{padding:6px 14px;border-radius:999px;border:1px solid var(--line);background:#fff;font-size:13px;color:var(--ink-2)}
.tabs button.on{background:var(--brand);border-color:var(--brand);color:#fff}
.rank-list{list-style:none;counter-reset:rank;perspective:2000px;perspective-origin:130px 300px}
.row{
  counter-increment:rank;cursor:pointer;border:1px solid var(--line);border-bottom:0;background:#fff;
  padding:10px 12px 8px;position:relative;
  /* 3D 翻入：初始 rotateY(90deg)，.turned 后逐行翻正；--delay 逐行级联（对照高德 .turning） */
  transform:rotateY(90deg);transform-origin:center center -130px;backface-visibility:hidden;
  transition:transform .5s cubic-bezier(.2,.8,.2,1) var(--delay),background .25s;
}
.rank-list.turned .row{transform:rotateY(0)}
.row:last-child{border-bottom:1px solid var(--line)}
.row-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding-left:34px;position:relative}
/* 排名序号：CSS counter，前三名更大 */
.row-head::before{
  content:counter(rank);position:absolute;left:0;top:50%;transform:translateY(-50%);
  width:28px;text-align:center;font-size:15px;color:var(--ink-2);font-weight:600;
}
.row:nth-child(-n+3) .row-head::before{font-size:24px;color:var(--brand);font-family:serif}
.name{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:padding .2s cubic-bezier(0,.44,0,1.38),color .2s}
.name small{font-weight:400;color:var(--ink-2);margin-left:6px;font-size:12px}
.val{font-size:13px;color:var(--brand);white-space:nowrap}
/* 悬浮：底衬渐变 + 标题缩进变亮（对照高德 li:hover h3） */
.row:hover,.row.focus{background:linear-gradient(90deg,var(--brand-light),rgba(246,236,236,0))}
.row:hover .name,.row.focus .name{padding-left:8px;color:var(--brand)}
/* 比例条 */
.bar-track{height:3px;border-radius:2px;background:var(--line);margin:7px 0 2px 34px;overflow:hidden}
.bar-track i{display:block;height:100%;width:0;background:var(--brand);border-radius:2px;transition:width .8s cubic-bezier(.2,.8,.2,1) .1s;animation:bar-grow .8s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--delay) + .15s)}
@keyframes bar-grow{from{width:0}to{width:var(--val)}}
/* 悬浮展开的子详情（对照高德 .sub_ul 回弹展开） */
.sub{display:grid;grid-template-rows:0fr;transition:grid-template-rows .5s cubic-bezier(0,1.23,.68,1.01)}
.sub ul{overflow:hidden;list-style:none;margin-left:34px;min-height:0}
.sub li{font-size:12px;color:var(--ink-2);line-height:1.9}
.row:hover .sub,.row.focus .sub{grid-template-rows:1fr}
.row.focus{box-shadow:inset 3px 0 0 var(--brand)}
.unfocus{margin-top:10px;text-align:center}
.unfocus button{font-size:13px;color:var(--ink-2);text-decoration:underline}

/* ===== 右：作品 IP 墙 ===== */
.wall{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.wish-card{border:1px solid var(--line);border-radius:var(--card-radius);background:#fff;box-shadow:var(--shadow);overflow:hidden;transition:opacity .25s,transform .25s,box-shadow .25s}
.wish-card.dim{opacity:.32}
.wish-card.lit{transform:translateY(-3px);box-shadow:0 8px 24px #40272620;outline:2px solid var(--brand);outline-offset:-2px}
.card-head{display:flex;width:100%;text-align:left;gap:12px;padding:14px;align-items:center}
.cover{flex:none;width:56px;height:56px;border-radius:10px;background:var(--brand-light);color:var(--brand);display:grid;place-items:center;font-family:serif;font-size:20px}
.body{display:grid;gap:4px;min-width:0}
.body strong{font-family:serif;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta{font-size:12px;color:var(--ink-2)}
.points{font-size:12px;color:var(--brand);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.detail{border-top:1px solid var(--line);padding:10px 14px 12px;animation:detail-in .3s cubic-bezier(.2,.8,.2,1) both}
@keyframes detail-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.wishes{list-style:none;display:grid;gap:10px}
.wish{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}
.scene{font-size:13px;overflow-wrap:anywhere}
.pts{font-size:12px;color:var(--ink-2);margin-top:2px;overflow-wrap:anywhere}
.foot{font-size:11px;color:var(--ink-2);margin-top:3px}
.like{flex:none;display:flex;align-items:center;gap:4px;font-size:13px;color:var(--ink-2);padding:3px 9px;border:1px solid var(--line);border-radius:999px;background:#fff;transition:color .2s,border-color .2s}
.like.on{color:var(--brand);border-color:var(--brand)}
.like b{font-weight:600}
.like.pop span{animation:heart-pop .4s cubic-bezier(.2,.8,.2,1)}
@keyframes heart-pop{0%{transform:scale(1)}40%{transform:scale(1.5)}100%{transform:scale(1)}}
.more-hint{font-size:11px;color:var(--ink-2);margin-top:8px;text-align:right}

@media(prefers-reduced-motion:reduce){
  .row{transform:none;transition:none}
  .bar-track i,.detail{animation:none}
  .sub{transition:none}
  .name,.wish-card{transition:none}
  .like.pop span{animation:none}
}
</style>
