<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { getAuthSession } from '../auth/session.mjs'
import { requestDemoLogin } from '../auth/login-dialog.mjs'
import { subscribeFavorites, setFavorite } from '../auth/favorites.mjs'
import { createLoginGate } from '../auth/login-gate.mjs'
import '../auth/login-dialog.css'
import DolphinGuide from './ui/DolphinGuide.vue'
const props = defineProps({
  entityKey: { type: String, required: true },
  label: { type: String, default: '收藏景点' },
  iconOnly: { type: Boolean, default: false },
})
const auth = getAuthSession()
const saved = ref(false)
const busy = ref(false)
const feedback = ref('')
const celebrating = ref(false)
let celebrationTimer
watch(feedback, value => {
  clearTimeout(celebrationTimer)
  celebrating.value = value === '已收藏'
  if (celebrating.value) celebrationTimer = setTimeout(() => { celebrating.value = false }, 2400)
})
const actionLabel = computed(() => busy.value ? '正在处理收藏' : saved.value ? '取消收藏' : props.label)
const gate = createLoginGate({ getUser: () => auth.getSnapshot().user, requestLogin: requestDemoLogin })
watch(() => props.entityKey, () => { gate.cancel(); saved.value = false; feedback.value = '' })
const unwatchFavorites = subscribeFavorites(keys => { saved.value = keys.has(props.entityKey) })
const unsubscribe = auth.subscribe(state => { if (!state.isLoggedIn) { saved.value = false; feedback.value = '' } })
onUnmounted(() => { clearTimeout(celebrationTimer); gate.cancel(); unsubscribe(); unwatchFavorites() })
async function toggle() {
  busy.value = true
  feedback.value = ''
  const key = props.entityKey
  try {
    const done = await gate.run(async () => {
      await setFavorite(key, !saved.value)
      feedback.value = saved.value ? '已收藏' : '已取消收藏'
    })
    if (!done && key === props.entityKey) feedback.value = '未完成登录，收藏未执行。'
  } catch (error) { feedback.value = error.message }
  finally { busy.value = false }
}
</script>
<template>
  <div class="favorite-action" :class="{ 'favorite-action--icon': iconOnly }">
    <button type="button" :class="{ 'is-saved': saved }" :disabled="busy" :aria-pressed="saved" :aria-busy="busy" :aria-label="actionLabel" :title="iconOnly ? actionLabel : undefined" @click.stop="toggle">
      <svg v-if="iconOnly" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91L12 3Z" /></svg>
      <span v-else>{{ busy ? '处理中…' : saved ? '取消收藏' : label }}</span>
    </button>
    <p role="status"><DolphinGuide v-if="celebrating" class="favorite-yoyo" state="success" :size="36" />{{ feedback }}</p>
  </div>
</template>
<style scoped>
.favorite-action { margin: 16px 0; }
button { background: #fff; color: var(--brand); border: 1px solid var(--line); padding: 8px 16px; border-radius: 999px; cursor: pointer; }
button:disabled { opacity: .6; cursor: wait; }
p, small { font-size: 12px; color: var(--ink-2); }
button:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }

p:not(:empty){display:flex;align-items:center;gap:6px;min-height:36px}.favorite-yoyo{flex:none}
.favorite-action--icon { margin: 0; }
.favorite-action--icon button { display: grid; place-items: center; width: 48px; height: 48px; padding: 0; border-radius: 50%; box-shadow: 0 2px 10px #2b2b2b08; transition: background .18s, border-color .18s; }
.favorite-action--icon button:hover:not(:disabled), .favorite-action--icon button.is-saved { background: var(--brand-light); border-color: var(--brand); }
.favorite-action--icon svg { width: 25px; height: 25px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.favorite-action--icon .is-saved svg { fill: currentColor; }
.favorite-action--icon p { position: absolute; top: calc(100% + 8px); right: 0; z-index: 1; width: max-content; max-width: min(240px, calc(100vw - 64px)); margin: 0; line-height: 1.6; }
.favorite-action--icon p:not(:empty) { padding: 8px 12px; background: #fff; border: 1px solid var(--line, #e8e2da); border-radius: 12px; box-shadow: 0 4px 16px #2b2b2b0a; }
</style>
