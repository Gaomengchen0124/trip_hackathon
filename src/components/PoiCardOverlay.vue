<script setup>
/**
 * S6 景点卡片浮层 —— 基础占位。
 * 【交接给组件同学】结构已就位：图片区 + 引文区（原著/台词 brief + 出处）+ 操作区。
 * 样式自由发挥，但保留 props.poi 字段用法与 emit('view-detail') / emit('close') 两个事件。
 */
import { ref, watch } from 'vue'

const props = defineProps({
  poi: { type: Object, required: true },
})
const emit = defineEmits(['view-detail', 'close'])

// 图片缺失时回落到占位样式
const imgFailed = ref(false)
watch(() => props.poi.poiId, () => (imgFailed.value = false))
</script>

<template>
  <div class="overlay-mask" @click="emit('close')">
    <div class="card" @click.stop>
      <div class="photo">
        <img
          v-if="!imgFailed"
          class="photo-img"
          :src="'/' + poi.realPhoto"
          :alt="poi.name"
          @error="imgFailed = true"
        />
        <span v-else>📷 {{ poi.realPhoto }}</span>
      </div>
      <div class="quotes">
        <p v-if="!poi.quotes?.length" class="empty">引文待内容组核对原著后填入</p>
        <template v-for="(q, i) in poi.quotes" :key="i">
          <p class="brief">「{{ q.brief }}」</p>
          <p class="source">—— {{ q.source }}</p>
        </template>
      </div>
      <div class="footer">
        <span>{{ poi.name }} · 建议 {{ poi.durationNormal }} 分钟</span>
        <button class="btn" @click="emit('view-detail', poi.poiId)">查看详情</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay-mask {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: flex-end; justify-content: center; z-index: 50;
}
.card { width: 100%; max-width: 520px; background: #fff; border-radius: 16px 16px 0 0; padding: 16px; }
.photo {
  aspect-ratio: 16/9; border-radius: var(--card-radius);
  background: var(--brand-light); color: var(--ink-2);
  display: flex; align-items: center; justify-content: center; font-size: 13px;
  overflow: hidden;
}
.photo-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.quotes { padding: 12px 4px; }
.brief { font-size: 15px; }
.source { font-size: 12px; color: var(--ink-2); margin-bottom: 6px; }
.empty { font-size: 13px; color: var(--ink-2); }
.footer { display: flex; align-items: center; justify-content: space-between; font-size: 14px; }
</style>
