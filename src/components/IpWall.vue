<script setup>
// 首页 IP 墙:仿 siff.com 底部的整墙实景照片 + 水平无缝循环滚动。
// 无缝原理:每条轨道渲染两份完全相同的拷贝,translateX(-50%) 恰好平移一份宽度。
// 两份拷贝都必须可点:滚动中视口里出现的常常是第二份。inert 会连指针事件一起屏蔽,
// 曾导致"有的图点不动";无障碍改由 aria-hidden + tabindex=-1 负责 ——
// 读屏与 Tab 序只走第一份,鼠标点哪一份都能跳转。
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PhotoFrame from './ui/PhotoFrame.vue'
import { buildWallRows } from '../utils/ip-wall'

const props = defineProps({
  // Line[](按 priority 排序),按 ipId 去重后每组 IP 产出若干照片 tile
  lines: { type: Array, default: () => [] }
})

const ROW_COUNT = 3
// 单个 tile 周期(两张 tile 一轮 12s),--dur 按行内 tile 数等比放大,各行线速度一致
const SECS_PER_TILE = 6

const rows = computed(() => buildWallRows(props.lines, ROW_COUNT))

const wall = ref(null)
const active = ref(true)
const paused = ref(false)
let motionPreference
function respectMotion(event) { paused.value = event.matches }
onMounted(() => {
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  paused.value = motionPreference.matches
  motionPreference.addEventListener('change', respectMotion)
})
const loadedSources = reactive(new Set())
let stopLoading = () => {}

// 外层观察纵向位置，内层以每行裁剪区域为根，提前约两张卡片加载。
// 只给真正接近视口的照片创建 img，避免原生 lazy 对横向动画的预取范围过大。
watch([wall, rows, active], () => {
  stopLoading()
  stopLoading = () => {}
  if (!wall.value || !active.value) return
  const rowElements = [...wall.value.querySelectorAll('.wall-row')]
  if (typeof IntersectionObserver === 'undefined') {
    for (const row of rows.value) for (const tile of row) loadedSources.add(tile.src)
    return
  }
  const photoObservers = new Map()
  let stopped = false
  const viewportObserver = new IntersectionObserver(entries => {
    if (stopped) return
    for (const entry of entries) {
      const row = entry.target
      if (!entry.isIntersecting) {
        photoObservers.get(row)?.disconnect()
        photoObservers.delete(row)
        continue
      }
      if (photoObservers.has(row)) continue
      const photos = new IntersectionObserver(photoEntries => {
        if (stopped || !photoObservers.has(row)) return
        for (const photo of photoEntries) {
          if (!photo.isIntersecting) continue
          loadedSources.add(photo.target.dataset.photoSrc)
          photos.unobserve(photo.target)
        }
      }, { root: row, rootMargin: '0px 464px', threshold: 0 })
      photoObservers.set(row, photos)
      for (const tile of row.querySelectorAll('[data-photo-src]')) {
        if (!loadedSources.has(tile.dataset.photoSrc)) photos.observe(tile)
      }
    }
  }, { rootMargin: '240px 0px', threshold: 0 })
  rowElements.forEach(row => viewportObserver.observe(row))
  stopLoading = () => {
    stopped = true
    viewportObserver.disconnect()
    photoObservers.forEach(observer => observer.disconnect())
  }
}, { flush: 'post' })

onActivated(() => { active.value = true })
onDeactivated(() => { active.value = false; stopLoading() })
onBeforeUnmount(() => { stopLoading(); motionPreference?.removeEventListener('change', respectMotion) })

const router = useRouter()

// 兜底:正好点在两张 tile 之间的缝隙(12px)或行内边距上时,target 不是链接,
// 这里按横坐标就近找同一行里最合适的一张 tile 跳转,保证"整面墙都能点"。
function onRowClick(e) {
  if (e.target?.closest?.('.wall-tile')) return
  const x = e.clientX
  const y = e.clientY
  let best = null
  for (const el of e.currentTarget.querySelectorAll('.wall-tile')) {
    const r = el.getBoundingClientRect()
    if (y < r.top || y > r.bottom) continue
    const d = Math.abs(x - (r.left + r.width / 2))
    if (!best || d < best.d) best = { d, to: el.getAttribute('href') }
  }
  if (best?.to) router.push(best.to)
}
</script>

<template>
  <section v-if="rows.some((r) => r.length)" ref="wall" class="ip-wall atlas-photo-roll" :class="{ 'roll-paused': paused || !active }" aria-label="IP 照片墙">
    <button class="roll-motion-toggle" :aria-pressed="paused" :aria-label="paused ? '继续照片卷轴动画' : '暂停照片卷轴动画'" @click="paused = !paused"><span aria-hidden="true">{{ paused ? '▷' : 'Ⅱ' }}</span>{{ paused ? '继续翻阅' : '让风景停一会儿' }}</button>
    <div
      v-for="(row, i) in rows"
      :key="i"
      class="wall-row"
      :class="{ reverse: i % 2 === 0 }"
      @click="onRowClick"
    >
      <div
        class="wall-track"
        :style="{ '--dur': `${row.length * SECS_PER_TILE}s` }"
      >
        <div
          v-for="copy in ['a', 'b']"
          :key="copy"
          class="wall-copy"
          :aria-hidden="copy === 'b' ? 'true' : undefined"
        >
          <router-link
            v-for="tile in row"
            :key="`${tile.key}-${copy}`"
            class="wall-tile"
            :data-photo-src="tile.src"
            :aria-label="`${tile.ipName} · ${tile.city}`"
            :to="`/line/${tile.lineId}`"
            :tabindex="copy === 'b' ? -1 : undefined"
          >
            <PhotoFrame v-if="loadedSources.has(tile.src)" :src="tile.src" :alt="tile.ipName" ratio="4 / 3" thumbnail :sizes="i === 0 ? '300px' : i === 1 ? '220px' : '270px'" eager />
            <div v-else class="photo-frame deferred-photo" aria-hidden="true" />
            <span class="tile-caption">
              <strong>{{ tile.ipName }}</strong>
              <small v-if="tile.city">{{ tile.city }}</small>
              <i aria-hidden="true">↗</i>
            </span>
          </router-link>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 整宽出血:突破 .page 的 1080px 限宽 */
.ip-wall {
  width: 100vw;
  margin-left: calc(50% - 50vw);
  padding: 8px 0 4px;
}
.wall-row {
  overflow: hidden;
  padding: 6px 0;
}
.wall-track {
  display: flex;
  width: max-content;
  /* gap 必须为 0:轨道级 gap 会让 translateX(-50%) 差出半个间距,循环点跳帧。
     每份拷贝自带 padding-right,顶替间距,保证 -50% 恰好是一份宽度 */
  animation: wall-scroll var(--dur, 60s) linear infinite;
}
/* 第 1 行向右滚(用户指定);逐行交替方向更有照片墙动感。
   用 reverse 而不是 alternate —— alternate 在边界处会回跳 */
.wall-row.reverse .wall-track {
  animation-direction: reverse;
}
.wall-row:hover .wall-track {
  animation-play-state: paused;
}
.wall-row:focus-within .wall-track, .roll-paused .wall-track { animation-play-state: paused; }
@keyframes wall-scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}

.wall-copy {
  display: flex;
  gap: 12px;
  padding-right: 12px; /* 顶替轨道级 gap,保证 translateX(-50%) 无缝 */
}
.wall-tile {
  position: relative;
  flex: none;
  width: 220px;
  border-radius: var(--card-radius);
  overflow: hidden;
  box-shadow: var(--shadow);
  background: #fff;
}
.deferred-photo {
  aspect-ratio: 4 / 3;
  background: var(--photo-placeholder);
}
.wall-tile :deep(.photo-frame img) {
  transition: transform 0.4s ease;
}
.wall-tile:hover :deep(.photo-frame img),
.wall-tile:focus-visible :deep(.photo-frame img) {
  transform: scale(1.05);
}
.wall-tile:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
/* SIFF 风格常显 caption:底部渐变 + IP 名 */
.tile-caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  gap: 2px;
  padding: 25px 12px 10px;
  background: linear-gradient(transparent, rgba(20, 12, 12, 0.72));
  color: #fff;
  pointer-events: none;
}
.tile-caption strong {
  font-family: serif;
  font-size: 15px;
  letter-spacing: .04em;
  line-height: 1.45;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tile-caption small {
  font-size: 11px;
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 减少动画:停掉滚动,退化为可手动横向滚动,内容仍可到达(镜像 RouteCard 的既有写法) */
@media (prefers-reduced-motion: reduce) {
  .wall-track {
    animation: none;
  }
  .wall-row {
    overflow-x: auto;
  }
  .wall-tile :deep(.photo-frame img) {
    transition: none;
  }
}
</style>

<style>
.story-content.public-story .atlas-home .atlas-photo-roll{width:100%;margin-left:0;padding:42px 0 0;position:relative}
.atlas-photo-roll .roll-motion-toggle{position:absolute;right:54px;top:0;color:#d2bc95;border-bottom:1px solid #bc9e654d;padding:2px 0 7px;font:10px/1.6 var(--journal-serif);letter-spacing:.06em;z-index:2}
.atlas-photo-roll .roll-motion-toggle>span{display:inline-block;margin-right:8px;font-size:11px}
.atlas-photo-roll .roll-motion-toggle:focus-visible{outline:2px solid #dbbc7d;outline-offset:5px}
.story-content.public-story .atlas-home .atlas-photo-roll .wall-row{padding:11px 0 14px}
.story-content.public-story .atlas-home .atlas-photo-roll .wall-copy{gap:25px;padding-right:25px;align-items:flex-start}
.story-content.public-story .atlas-home .atlas-photo-roll .wall-tile{width:300px;padding:16px 16px 8px;border:0;border-radius:0;background:transparent;box-shadow:none;filter:drop-shadow(2px 5px 4px #17150f38);overflow:visible;color:#594c37;isolation:isolate}
/* Perforate only the paper layer; links, focus rings and photographs stay intact. */
.atlas-photo-roll .wall-tile::before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;background:var(--paper-grain),linear-gradient(110deg,#f7f0df,#eae0ca);
  mask:linear-gradient(#000 0 0) center / calc(100% - 12px) calc(100% - 12px) no-repeat,
    radial-gradient(circle at 6px 0,transparent 3px,#000 3.6px) top left / 12px 6px repeat-x,
    radial-gradient(circle at 6px 6px,transparent 3px,#000 3.6px) bottom left / 12px 6px repeat-x,
    radial-gradient(circle at 0 6px,transparent 3px,#000 3.6px) top left / 6px 12px repeat-y,
    radial-gradient(circle at 6px 6px,transparent 3px,#000 3.6px) top right / 6px 12px repeat-y;}
.atlas-photo-roll .wall-tile::after{content:'';position:absolute;inset:0;pointer-events:none;background:url('/brand/postage-pencil-frame.svg') center / 100% 100% no-repeat;opacity:.85}
.story-content.public-story .atlas-home .atlas-photo-roll .wall-tile .photo-frame{border:1px solid #9d865b65;border-radius:2px}
.story-content.public-story .atlas-home .atlas-photo-roll .wall-row:nth-of-type(2) .wall-tile{width:220px;rotate:1.3deg}
.story-content.public-story .atlas-home .atlas-photo-roll .wall-row:nth-of-type(3) .wall-tile{width:270px;rotate:-1deg}
.story-content.public-story .atlas-home .atlas-photo-roll .wall-tile:nth-child(even){translate:0 4px}
.story-content.public-story .atlas-home .atlas-photo-roll .wall-tile .photo-frame img{filter:sepia(.2) saturate(.66);transition:transform .7s ease,filter .7s ease}
.story-content.public-story .atlas-home .atlas-photo-roll .tile-caption{position:relative;inset:auto;display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:10px 6px 11px;background:none;color:#584a35}
.story-content.public-story .atlas-home .atlas-photo-roll .tile-caption strong{font:15px/1.5 var(--journal-serif);grid-column:1}
.story-content.public-story .atlas-home .atlas-photo-roll .tile-caption small{font:9px/1.5 var(--journal-serif);color:#a38b65;opacity:1;grid-column:1}
.atlas-photo-roll .tile-caption i{font:20px Georgia,serif;grid-column:2;grid-row:1/3;align-self:center;color:#9d7e45}
@media(hover:hover){.story-content.public-story .atlas-home .atlas-photo-roll .wall-tile:hover .photo-frame img{filter:sepia(0) saturate(1);transform:scale(1.03)}}
@media(max-width:760px){.atlas-photo-roll .roll-motion-toggle{right:24px;font-size:9px}.story-content.public-story .atlas-home .atlas-photo-roll{padding-top:34px}.story-content.public-story .atlas-home .atlas-photo-roll .wall-tile{width:240px;padding:14px 14px 7px}.story-content.public-story .atlas-home .atlas-photo-roll .wall-row:nth-of-type(2) .wall-tile{width:180px}.story-content.public-story .atlas-home .atlas-photo-roll .wall-row:nth-of-type(3) .wall-tile{width:220px}.story-content.public-story .atlas-home .atlas-photo-roll .wall-copy{gap:18px;padding-right:18px}.story-content.public-story .atlas-home .atlas-photo-roll .tile-caption{padding:8px 5px 9px}.story-content.public-story .atlas-home .atlas-photo-roll .tile-caption strong{font-size:13px}.story-content.public-story .atlas-home .atlas-photo-roll .wall-row{padding:7px 0 10px}}
@media(prefers-reduced-motion:reduce){.atlas-photo-roll .wall-track{animation:none}.atlas-photo-roll .roll-motion-toggle{display:none}.story-content.public-story .atlas-home .atlas-photo-roll .wall-tile{rotate:none!important;translate:none!important}.story-content.public-story .atlas-home .atlas-photo-roll .wall-tile .photo-frame img{transition:none;transform:none!important}}
</style>
