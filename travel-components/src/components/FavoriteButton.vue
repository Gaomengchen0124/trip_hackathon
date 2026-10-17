<script setup>
import { onUnmounted, ref, watch } from 'vue'
import { getAuthSession } from '../auth/session.mjs'
import { requestDemoLogin } from '../auth/login-dialog.mjs'
import { subscribeFavorites, setFavorite } from '../auth/favorites.mjs'
import { createLoginGate } from '../auth/login-gate.mjs'
import '../auth/login-dialog.css'
const props = defineProps({ entityKey: { type: String, required: true } })
const auth = getAuthSession()
const saved = ref(false)
const busy = ref(false)
const feedback = ref('')
const gate = createLoginGate({ getUser: () => auth.getSnapshot().user, requestLogin: requestDemoLogin })
watch(() => props.entityKey, () => { gate.cancel(); saved.value = false; feedback.value = '' })
const unwatchFavorites = subscribeFavorites(keys => { saved.value = keys.has(props.entityKey) })
const unsubscribe = auth.subscribe(state => { if (!state.isLoggedIn) { saved.value = false; feedback.value = '' } })
onUnmounted(() => { gate.cancel(); unsubscribe(); unwatchFavorites() })
async function toggle() {
  busy.value = true
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
    <button type="button" :disabled="busy" :aria-pressed="saved" @click="toggle">{{ busy ? '等待登录…' : saved ? '取消收藏' : '收藏景点' }}</button>
    <p role="status">{{ feedback }}</p>
    
  </div>
</template>
<style scoped>
.favorite-action { margin: 16px 0; }
button { background: #fff; color: var(--brand, #a88d58); border: 1px solid var(--line, #e8e2da); padding: 8px 16px; border-radius: 999px; cursor: pointer; }
button:disabled { opacity: .6; cursor: wait; }
p, small { font-size: 12px; color: var(--ink-2, #7a7168); }
button:focus-visible { outline: 2px solid var(--brand, #a88d58); outline-offset: 3px; }
</style>
