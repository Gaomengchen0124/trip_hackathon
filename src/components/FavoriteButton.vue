<script setup>
import { onUnmounted, ref, watch } from 'vue'
import { getAuthSession } from '../auth/session.mjs'
import { requestDemoLogin } from '../auth/login-dialog.mjs'
import { subscribeFavorites, setFavorite } from '../auth/favorites.mjs'
import { createLoginGate } from '../auth/login-gate.mjs'
import '../auth/login-dialog.css'
import DolphinGuide from './ui/DolphinGuide.vue'
const props = defineProps({ entityKey: { type: String, required: true }, label: { type: String, default: '收藏景点' } })
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
  <div class="favorite-action">
    <button type="button" :disabled="busy" :aria-pressed="saved" @click="toggle">{{ busy ? '等待登录…' : saved ? '取消收藏' : label }}</button>
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
</style>
