<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
defineEmits(['replay-opening'])
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
    <div class="masthead-edition" aria-hidden="true"><span>一本关于故事与远方的图鉴</span><span>THE ATLAS OF STORIES <i>·</i> VOL. I</span></div>
    <div class="landscape" aria-hidden="true">
      <div class="track">
        <div v-for="copy in 2" :key="copy" class="segment">
          <img :src="`${base}img/world-panorama-v1.png`" width="3546" height="443" alt="" fetchpriority="high" />
        </div>
      </div>
    </div>
    <div class="titles">
      <h1 class="english" tabindex="-1"><img :src="`${base}img/story-pilgrim-wordmark-v1.png`" alt="Story Pilgrim" fetchpriority="high" /></h1>
      <p class="chinese">我的圣地巡礼</p>
    </div>
    <button class="intro-replay" type="button" @click="$emit('replay-opening')"><span aria-hidden="true">↺</span> 重温序章</button>
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
.english{width:86vw;height:clamp(100px,12.5vw,200px);font-size:0;line-height:0;position:relative;overflow:hidden;flex-shrink:0;margin:0;transform:translateY(clamp(8px,1vw,16px))}
.english img{position:absolute;width:100%;height:181%;left:0;top:-43%;object-fit:fill}
.chinese{position:relative;z-index:1;isolation:isolate;font-family:"Songti SC",STSong,"Noto Serif SC",serif;font-size:clamp(23px,3.35vw,52px);font-weight:500;letter-spacing:.17em;padding-left:.17em;margin:-3px 0 0;line-height:1.2;color:#51442e;transform:scaleX(.88) scaleY(1.12);text-shadow:0 0 8px #fdfcf9,0 0 14px #fdfcf9}
.chinese::before{content:"";position:absolute;z-index:-1;inset:-35% -14%;pointer-events:none;background:radial-gradient(ellipse at center,#fdfcf9 0%,#fdfcf9f5 44%,#fdfcf9b3 60%,#fdfcf900 78%);filter:blur(6px)}
.paused .track{animation-play-state:paused}
.motion-toggle{position:absolute;right:10px;bottom:8px;z-index:2;width:26px;height:26px;border:1px solid #d8cbb0;border-radius:50%;background:#fcfaf6c9;color:#998359;font-size:12px;cursor:pointer}
.motion-toggle:focus-visible{outline:2px solid #a88d58;outline-offset:3px}
.intro-replay{position:absolute;bottom:8px;left:12px;z-index:2;padding:3px 9px;background:#fcfaf6de;color:#796139;font-size:11px;border:1px solid #d8cbb0;border-radius:20px}
.intro-replay:focus-visible{outline:2px solid #a88d58;outline-offset:3px}
.english:focus{outline:none}
.masthead-edition{position:absolute;top:11px;left:3.6%;right:3.6%;z-index:2;display:flex;justify-content:space-between;gap:20px;font:8px/1.5 Georgia,'Songti SC',serif;letter-spacing:.17em;color:#a88e5a;pointer-events:none}
.masthead-edition i{font-style:normal;margin:0 12px}
.travel-masthead::after{content:'';position:absolute;left:3.6%;right:3.6%;bottom:0;height:4px;border-top:1px solid #bb9f6360;border-bottom:1px solid #bb9f6328;pointer-events:none}
.intro-replay{font-family:Georgia,'Songti SC',serif;letter-spacing:.04em;bottom:9px}
.chinese{transition:opacity .24s ease-out}
@media(prefers-reduced-motion:reduce){.chinese{transition:none}}
@keyframes world-travel{to{transform:translateX(-50%)}}
@media(prefers-reduced-motion:reduce){.track{animation-play-state:paused}.travel-masthead:not(.paused) .track{animation-play-state:running}}
@media(max-width:600px){.travel-masthead{height:160px}.track{width:1000vw}.segment{flex-basis:500vw}.english{width:94vw;height:75px}.chinese{font-size:6vw}.titles{padding-bottom:8px}}
@media(max-width:760px){.masthead-edition{font-size:6px;top:9px;letter-spacing:.07em}.masthead-edition i{margin:0 5px}.masthead-edition>span:first-child{max-width:43%}.intro-replay{font-size:9px;padding:3px 6px;left:8px;bottom:6px}}
</style>
