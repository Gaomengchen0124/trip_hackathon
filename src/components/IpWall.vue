<script setup>
// 首页 IP 墙:仿 siff.com 底部的整墙实景照片 + 水平无缝循环滚动。
// 无缝原理:每条轨道渲染两份完全相同的拷贝,translateX(-50%) 恰好平移一份宽度。
// 拷贝 A 是可交互的真链接;拷贝 B 加 inert + aria-hidden,不进 tab 序、不干扰读屏。
import { computed } from 'vue'
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
</script>

<template>
  <section v-if="rows.some((r) => r.length)" class="ip-wall" aria-label="IP 照片墙">
    <div
      v-for="(row, i) in rows"
      :key="i"
      class="wall-row"
      :class="{ reverse: i % 2 === 0 }"
    >
      <div
        class="wall-track"
        :style="{ '--dur': `${row.length * SECS_PER_TILE}s` }"
      >
        <div
          v-for="copy in ['a', 'b']"
          :key="copy"
          class="wall-copy"
          :inert="copy === 'b' ? true : undefined"
          :aria-hidden="copy === 'b' ? 'true' : undefined"
        >
          <router-link
            v-for="tile in row"
            :key="`${tile.key}-${copy}`"
            class="wall-tile"
            :to="`/customize/${tile.lineId}`"
            :tabindex="copy === 'b' ? -1 : undefined"
          >
            <PhotoFrame :src="tile.src" :alt="tile.ipName" ratio="4 / 3" eager />
            <span class="tile-caption">
              <strong>{{ tile.ipName }}</strong>
              <small>{{ tile.title }}</small>
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
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 18px 10px 8px;
  background: linear-gradient(transparent, rgba(20, 12, 12, 0.72));
  color: #fff;
  pointer-events: none;
}
.tile-caption strong {
  font-family: serif;
  font-size: 15px;
  letter-spacing: 2px;
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
