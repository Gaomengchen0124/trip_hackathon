<script setup>
import { onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { useRoute } from 'vue-router'
import YoyoBuddy from './ui/YoyoBuddy.vue'

const route = useRoute()
const open = ref(false)
const companion = ref(null)
const toggle = ref(null)
const noteId = useId()
function close(restoreFocus = false) {
  open.value = false
  if (restoreFocus) toggle.value?.focus({ preventScroll: true })
}
function outside(event) {
  if (!companion.value?.contains(event.target)) close()
}
function escape(event) {
  if (event.key !== 'Escape' || !open.value) return
  const ownsFocus = companion.value?.contains(document.activeElement)
  close(ownsFocus)
}
watch(() => route.fullPath, () => close())
onMounted(() => { document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape) })
onUnmounted(() => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) })
</script>

<template>
  <aside ref="companion" class="journey-companion" :class="{ 'is-open': open }" aria-label="YOYO 旅途同行者">
    <div v-if="open" :id="noteId" class="companion-note">
      <div class="companion-note-heading"><span>一张旅途便笺</span><button type="button" aria-label="收起旅途便笺" @click="close(true)">×</button></div>
      <p>下一站，<em>我们一起找。</em></p>
      <span class="companion-note-description">遇到喜欢的故事，就从这里继续。</span>
      <nav aria-label="YOYO 旅途便笺">
        <router-link to="/recommend"><span>寻找旅行灵感</span><i aria-hidden="true">↗</i></router-link>
        <router-link to="/wishes"><span>写下下一站心愿</span><i aria-hidden="true">↗</i></router-link>
      </nav>
      <small>YOUR LITTLE TRAVEL COMPANION</small>
    </div>
    <div class="companion-bookmark">
      <YoyoBuddy :size="70" label="和 YOYO 打个招呼" message="嗨，我是 YOYO。慢慢翻，每一个故事都有值得出发的地方。" />
      <button ref="toggle" class="companion-toggle" type="button" :aria-expanded="open" :aria-controls="noteId" :aria-label="open ? '收起 YOYO 旅途便笺' : '打开 YOYO 旅途便笺'" @click="open = !open"><span>同行者</span><small>YOYO <i aria-hidden="true">{{ open ? '−' : '+' }}</i></small></button>
    </div>
  </aside>
</template>

<style scoped>
.journey-companion{position:fixed;left:8px;bottom:25px;z-index:48;color:#796344;isolation:isolate}
.companion-bookmark{display:flex;flex-direction:column;align-items:center;position:relative;padding:10px 9px 15px;background:var(--paper-grain),#f7f1e6ec;border:1px solid #c5af8170;box-shadow:3px 5px 18px #5841210c;border-radius:46% 46% 2px 2px;backdrop-filter:blur(7px)}
.companion-bookmark::before{content:'';position:absolute;inset:5px;border:1px dashed #b59b6b45;border-radius:45% 45% 0 0;pointer-events:none;z-index:-1}
.companion-toggle{display:grid;gap:3px;justify-items:center;min-width:52px;min-height:44px;position:relative;padding:3px 0 0;color:#8e754b}
.companion-toggle>span{font:12px/1.5 var(--journal-serif);letter-spacing:.16em;padding-left:.16em}
.companion-toggle small{font:8px/1.5 Georgia,serif;letter-spacing:.15em}
.companion-toggle i{font-style:normal;margin-left:3px;font-size:12px}
.companion-toggle:focus-visible,.companion-note a:focus-visible,.companion-note button:focus-visible{outline:2px solid #a88a53;outline-offset:3px}
.companion-note{position:absolute;bottom:0;left:calc(100% + 16px);width:278px;padding:20px 23px 18px;background:var(--paper-grain),#fffdf6;border:1px solid #c9b691;box-shadow:5px 9px 27px #42311d19;transform-origin:left bottom;animation:companion-unfold .28s cubic-bezier(.2,.7,.2,1);rotate:-1deg}
.companion-note::before{content:'';position:absolute;top:8px;right:8px;bottom:8px;left:8px;border:1px solid #d9c9a54d;pointer-events:none}
.companion-note-heading{display:flex;justify-content:space-between;align-items:center;color:#ac9165;font:10px/1.5 var(--journal-serif);letter-spacing:.1em}
.companion-note-heading button{width:34px;height:34px;font-size:23px;line-height:1;margin:-7px -10px 0 0}
.companion-note p{font:22px/1.65 var(--journal-serif);margin:14px 0 10px;color:#51432c}
.companion-note p em{display:block;font-style:normal}
.companion-note-description{font:11px/1.8 var(--journal-serif);color:#a18c67}
.companion-note nav{margin:17px 0 21px;border-top:1px solid #d7c6a4}
.companion-note nav a{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid #dfd2b8;font:13px/1.7 var(--journal-serif);color:#7a6038}
.companion-note nav i{font:20px Georgia,serif;transition:translate .2s}
.companion-note>small{font:7px/1.7 Georgia,serif;letter-spacing:.14em;color:#ac9470}
.companion-bookmark :deep(.yoyo-speech){left:0;bottom:calc(100% + 18px);max-width:min(250px,calc(100vw - 56px));font-size:11px}
.companion-bookmark :deep(.yoyo-buddy){--buddy-size:60px!important}.companion-bookmark :deep(.dolphin-guide){--guide-size:60px!important}
@keyframes companion-unfold{from{opacity:0;transform:translateY(7px) rotate(2deg)}to{opacity:1;transform:none}}
@media(hover:hover){.companion-toggle:hover{color:#5f471e}.companion-note nav a:hover i{translate:3px -2px}}
@media(min-width:1600px){.journey-companion{left:30px;bottom:34px}}
@media(max-width:760px){.journey-companion{left:10px;bottom:calc(78px + env(safe-area-inset-bottom))}.companion-bookmark{padding:4px 5px 5px;border-radius:34px 34px 3px 3px}.companion-bookmark :deep(.yoyo-buddy){--buddy-size:48px!important}.companion-bookmark :deep(.dolphin-guide){--guide-size:48px!important}.companion-toggle{min-height:32px;min-width:36px;padding-top:0}.companion-toggle>span{font-size:9px}.companion-toggle small{font-size:6px}.companion-toggle i{font-size:9px}.companion-note{left:calc(100% + 10px);width:min(255px,calc(100vw - 82px));padding:16px 19px}.companion-note p{font-size:21px}.companion-note-heading{font-size:9px}.companion-note-description{font-size:10px}.companion-note nav a{font-size:12px;padding:11px 0}.companion-note>small{font-size:6px}.companion-bookmark :deep(.yoyo-speech){left:3px;bottom:calc(100% + 10px);max-width:220px}}
@media(max-width:760px){.journey-companion{left:auto;right:10px;bottom:calc(80px + env(safe-area-inset-bottom))}.companion-bookmark{padding:4px;border-radius:50%;width:54px;height:54px;justify-content:center}.companion-bookmark::before{border-radius:50%;inset:2px}.companion-bookmark :deep(.yoyo-buddy),.companion-bookmark :deep(.dolphin-guide){--buddy-size:44px!important;--guide-size:44px!important}.companion-toggle{position:absolute;right:-3px;bottom:-6px;width:25px;height:25px;min-width:25px;min-height:25px;border:1px solid #c5af81;border-radius:50%;background:#fffaf0;padding:0;display:grid;place-items:center}.companion-toggle>span{display:none}.companion-toggle small{font-size:0;line-height:1}.companion-toggle i{margin:0;font-size:17px;letter-spacing:0}.companion-note{left:auto;right:calc(100% + 10px);width:min(255px,calc(100vw - 80px))}.companion-bookmark :deep(.yoyo-speech){left:auto;right:0;bottom:calc(100% + 14px)}}
@media(prefers-reduced-motion:reduce){.companion-note{animation:none}.companion-note nav i{transition:none}.companion-note nav a:hover i{translate:none}}
@media(max-width:760px){.companion-note{width:min(255px,calc(100vw - 100px))}}
@media print{.journey-companion{display:none}}
</style>
