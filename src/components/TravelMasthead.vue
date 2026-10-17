<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
const base = import.meta.env.BASE_URL
const paused = ref(false)
let preference
function updatePreference(event) { paused.value = event.matches }
onMounted(() => {
  preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  paused.value = preference.matches
  preference.addEventListener('change', updatePreference)
})
onUnmounted(() => preference?.removeEventListener('change', updatePreference))
</script>
<template>
  <header class="travel-masthead" :class="{ paused }">
    <div class="landscape" aria-hidden="true">
      <div class="track">
        <div v-for="copy in 2" :key="copy" class="segment">
          <img :src="`${base}img/world-panorama-v1.png`" width="3546" height="443" alt="" fetchpriority="high" />
        </div>
      </div>
    </div>
    <div class="titles">
      <h1 class="english"><img :src="`${base}img/story-pilgrim-wordmark-v1.png`" alt="Story Pilgrim" fetchpriority="high" /></h1>
      <p class="chinese">我的圣地巡礼</p>
    </div>
    <button class="motion-toggle" type="button" :aria-label="paused ? '播放建筑滚动动画' : '暂停建筑滚动动画'" :aria-pressed="paused" @click="paused = !paused">{{ paused ? '▷' : 'Ⅱ' }}</button>
  </header>
</template>
<style scoped>
.travel-masthead{height:clamp(165px,17.5vw,280px);position:relative;overflow:hidden;background:#fdfcf9;isolation:isolate;width:100%}
.landscape{position:absolute;inset:0;overflow:hidden;z-index:0}
.track{position:absolute;left:0;bottom:0;display:flex;width:600vw;height:100%;animation:world-travel 165s linear infinite;will-change:transform}
.segment{flex:0 0 300vw;position:relative;overflow:hidden;height:100%}
.segment img{position:absolute;width:100%;height:auto;left:0;bottom:0;transform:translateY(14%);opacity:.82;mix-blend-mode:multiply}
.titles{position:absolute;inset:0;z-index:1;pointer-events:none;display:flex;justify-content:flex-end;align-items:center;flex-direction:column;padding-bottom:10px}
.english{width:86vw;height:clamp(100px,12.5vw,200px);font-size:0;line-height:0;position:relative;overflow:hidden;flex-shrink:0;margin:0}
.english img{position:absolute;width:100%;height:181%;left:0;top:-43%;object-fit:fill}
.chinese{font-family:"Songti SC",STSong,"Noto Serif SC",serif;font-size:clamp(23px,3.35vw,52px);font-weight:500;letter-spacing:.17em;margin:-3px 0 0;line-height:1.2;color:#51442e;transform:scaleX(.88) scaleY(1.12);text-shadow:0 0 8px #fcfaf6,0 0 14px #fcfaf6}
.paused .track{animation-play-state:paused}
.motion-toggle{position:absolute;right:10px;bottom:8px;z-index:2;width:26px;height:26px;border:1px solid #d8cbb0;border-radius:50%;background:#fcfaf6c9;color:#998359;font-size:12px;cursor:pointer}
.motion-toggle:focus-visible{outline:2px solid #a88d58;outline-offset:3px}
@keyframes world-travel{to{transform:translateX(-50%)}}
@media(prefers-reduced-motion:reduce){.track{animation-play-state:paused}.travel-masthead:not(.paused) .track{animation-play-state:running}}
@media(max-width:600px){.travel-masthead{height:160px}.track{width:1000vw}.segment{flex-basis:500vw}.english{width:94vw;height:75px}.chinese{font-size:6vw}.titles{padding-bottom:8px}}
</style>
