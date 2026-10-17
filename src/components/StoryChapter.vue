<script setup>
import { computed } from 'vue'
const props = defineProps({ routeName: String })
const chapters = {
  column: ['I', '寻迹', 'ATLAS OF STORIES', '每一座城，都藏着一页故事。'],
  recommend: ['I', '寻迹', 'FOLLOW YOUR CURIOSITY', '从心动的一页，找到想去的远方。'],
  'route-intro': ['II', '入境', 'BETWEEN PAGE & PLACE', '把读过的句子，走成真实的风景。'],
  'poi-detail': ['II', '驻足', 'A MOMENT IN THE STORY', '在故事发生的地方，停留片刻。'],
  customize: ['III', '成行', 'DRAW YOUR OWN JOURNEY', '将散落的坐标，连成自己的旅途。'],
  result: ['IV', '远行', 'THE JOURNEY TAKES SHAPE', '从这一页出发，去写新的故事。'],
  itinerary: ['IV', '远行', 'THE JOURNEY TAKES SHAPE', '从这一页出发，去写新的故事。'],
  wishes: ['V', '续篇', 'LET THE STORY CONTINUE', '把尚未抵达的远方，写给下一次相逢。'],
}
const chapter = computed(() => chapters[props.routeName] || chapters.column)
</script>
<template>
  <div class="story-chapter" data-story-reveal>
    <div class="chapter-folio"><span class="chapter-edition">THE ATLAS OF STORIES</span><span class="chapter-seal" aria-hidden="true">{{ chapter[0] }}</span><span class="chapter-volume">STORY PILGRIM / 旅人图鉴</span></div>
    <div class="chapter-inscription"><span class="chapter-kicker">CHAPTER {{ chapter[0] }} <i aria-hidden="true">/</i> {{ chapter[2] }}</span><span class="chapter-name">{{ chapter[1] }}</span><p>{{ chapter[3] }}</p></div>
    <svg class="chapter-compass" viewBox="0 0 150 100" fill="none" aria-hidden="true"><path d="M74 10c29 0 46 18 44 40s-18 40-44 39S31 71 33 48 49 11 74 10Z"/><path d="M75 4v12m0 68v12M27 50h12m74 0h12M47 23l8 8m40 39 8 8"/><path class="compass-needle" d="m82 26-17 40 13-13 4-27Z"/><path d="M3 81c32-25 51 25 78 3s38-4 66-22" stroke-dasharray="2 5"/></svg>
  </div>
</template>
