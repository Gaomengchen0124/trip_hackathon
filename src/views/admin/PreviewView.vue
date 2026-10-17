<script setup>
// 上线前全体预览：把草稿 IP 拆成 line docs 注入 sessionStorage，
// iframe 打开真实站点路由（/line/:lineId?preview=1）——介绍页/定制/规划/导出全部基于草稿数据。
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { manage } from '../../api/manage.js'

const route = useRoute()
const router = useRouter()
const ipId = route.params.ipId

const ipName = ref('')
const cities = ref([])          // [{ cityKey, lineId, title }]
const selected = ref('')
const error = ref('')
const busy = ref(true)

onMounted(async () => {
  try {
    const { ip } = await manage(`/api/manage/content/ips/${ipId}`)
    ipName.value = ip.doc?.ip?.name ?? ipId
    cities.value = Object.entries(ip.doc?.lines ?? {})
      .map(([cityKey, line]) => ({ cityKey, lineId: line.line?.lineId, title: line.line?.title ?? cityKey }))
      .filter((c) => c.lineId)
    selected.value = cities.value[0]?.lineId ?? ''
    if (selected.value) startPreview()
  } catch (e) { error.value = e.message } finally { busy.value = false }
})

function splitDocs(ip) {
  const docs = {}
  for (const line of Object.values(ip.doc?.lines ?? {})) {
    if (!line?.line?.lineId) continue
    docs[line.line.lineId] = {
      _bounds: line._bounds, _expected: line._expected, ip: ip.doc.ip,
      line: line.line, clusters: line.clusters ?? [],
      ipStops: line.ipStops ?? [], cityStops: line.cityStops ?? [],
    }
  }
  return docs
}

async function loadIp() {
  const { ip } = await manage(`/api/manage/content/ips/${ipId}`)
  return ip
}

async function startPreview() {
  error.value = ''
  try {
    const ip = await loadIp()
    sessionStorage.setItem('preview-docs', JSON.stringify(splitDocs(ip)))
    sessionStorage.setItem('preview-name', ip.doc?.ip?.name ?? ipId)
    frameSrc.value = ''          // 强制 iframe 重载
    requestAnimationFrame(() => { frameSrc.value = `/line/${selected.value}?preview=1` })
  } catch (e) { error.value = e.message }
}

const frameSrc = ref('')
const frameTitle = computed(() => cities.value.find((c) => c.lineId === selected.value)?.title ?? '')

function openTab() { window.open(frameSrc.value, '_blank') }
</script>

<template>
  <div class="preview-page">
    <div class="banner">
      <div class="left">
        <button class="mini" @click="router.push(`/manage/ips/${ipId}/edit`)">← 返回编辑</button>
        <b>草稿预览</b>
        <span class="tip">数据未上线 · 以下为「{{ ipName }}」草稿在真实页面上的效果，可完整试用定制 / 规划 / 导出</span>
      </div>
      <div class="right">
        <select v-model="selected" @change="startPreview">
          <option v-for="c in cities" :key="c.lineId" :value="c.lineId">{{ c.title }}</option>
        </select>
        <button class="mini" @click="startPreview">刷新预览</button>
        <button class="mini" @click="openTab">在新标签打开</button>
      </div>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="busy" class="hint">加载中…</p>
    <iframe v-if="frameSrc" :src="frameSrc" class="frame" :title="`预览 ${frameTitle}`"></iframe>
  </div>
</template>

<style scoped>
.preview-page { display: flex; flex-direction: column; height: calc(100vh - 48px); }
.banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; background: #fff8e1; border: 1px solid #f0d68a; border-radius: 12px; padding: 10px 14px; margin-bottom: 10px; }
.left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.left b { color: #8a6d1a; }
.tip { font-size: 12px; color: #8a6d1a; }
.right { display: flex; align-items: center; gap: 10px; }
select { padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; font: inherit; font-size: 13px; background: #fff; }
.mini { font-size: 13px; color: var(--brand); text-decoration: underline; white-space: nowrap; }
.error { color: var(--brand); margin: 8px 0; }
.hint { color: var(--ink-2); }
.frame { flex: 1; border: 1px solid var(--line); border-radius: 12px; background: #fff; min-height: 480px; }
</style>
