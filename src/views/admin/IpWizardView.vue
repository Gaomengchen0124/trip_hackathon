<script setup>
// IP 分步向导：① 作品信息 → ② IP 点位卡 → ③ 城市线与共享景点 → ④ 图片总览 → ⑤ 检查与上架
// 对应内容组真实流程：《填写模板》→ 找图/补漏 → 生成（上架）这个 IP。AI 填充本期留接口位。
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { manage, uploadImage, ManageError } from '../../api/manage.js'
import { lineReadiness } from '../../engine/catalog.mjs'
import { assetUrl } from '../../utils/travel-ui.js'
import PoiEditForm from '../../components/admin/PoiEditForm.vue'
import { poiMissingFields } from '../../components/admin/poi-check.mjs'

const route = useRoute()
const router = useRouter()
const ipId = route.params.ipId

const STEPS = ['作品信息', 'IP 点位卡', '城市线与景点', '图片检查', '检查与上架']
const step = ref(0)
const maxVisited = ref(0)
const publishSelected = ref([])   // 第⑤步勾选的城市线
const aiGenerated = ref(false)
const meta = ref(null)
const doc = reactive({ ip: { ipId, name: '', author: '', kind: 'novel', cover: '', aliases: [] }, lines: {} })
const error = ref('')
const notice = ref('')
const busy = ref(true)
const saving = ref(false)

// 第②步
const activeCity = ref('')
const activePoi = ref(null)
// 第③步
const pool = ref({ spots: [] })
const poolChecked = ref({})
const poolLoadedFor = ref('')
// AI
const aiBusy = ref(false)
const aiEpub = ref(null)
const aiPaste = ref('')
const aiConfirm = ref(false)   // 有内容时的两步确认
const locating = ref(false)
const savedFlash = ref(false)
let flashTimer = 0
function flashSaved() {
  savedFlash.value = true
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { savedFlash.value = false }, 2000)
}
// 城市景点自动检测
const cityStopsHint = ref(null)   // { kind: 'sibling'|'pool'|'none', count, stops? }
const fetchingPhotos = ref(false)
// 图片检查大图
const lightbox = ref('')

async function checkCityStops() {
  cityStopsHint.value = null
  const line = activeLine()
  if (!line || (line.cityStops ?? []).length) return
  const city = line.line.city
  try {
    const sibling = await manage(`/api/manage/content/city-stops?city=${encodeURIComponent(city)}`)
    if (sibling.stops?.length) {
      cityStopsHint.value = { kind: 'sibling', count: sibling.stops.length, stops: sibling.stops, label: sibling.title }
      return
    }
    const pool = await manage(`/api/manage/content/city-pool?city=${encodeURIComponent(city)}`)
    if (pool.spots?.length) cityStopsHint.value = { kind: 'pool', count: pool.spots.length }
    else cityStopsHint.value = { kind: 'none', count: 0 }
  } catch { /* 静默：不阻断向导 */ }
}

function applyCityStopsHint() {
  const line = activeLine()
  const hint = cityStopsHint.value
  if (!line || !hint) return
  if (hint.kind === 'sibling' && hint.stops?.length) {
    line.cityStops = hint.stops.map((p, i) => ({ ...p, poiId: `${line.line.lineId}-sp-${String(i + 1).padStart(2, '0')}`, lineId: line.line.lineId }))
    mergeClustersAndBounds(line, hint.stops)
  } else if (hint.kind === 'pool') {
    line.cityStops = []
    poolLoadedFor.value = ''
    ensurePool().then(() => { for (const s of pool.value.spots) poolChecked.value[s.key] = true; syncCityStops() })
    return
  }
  cityStopsHint.value = null
  notice.value = `已同步 ${line.cityStops.length} 个城市景点。`
}

/** 把来源点位的片区并入本线 clusters，并把 _bounds 扩到能覆盖全部来源坐标（防止 C02/C03 保存冲突） */
function mergeClustersAndBounds(line, stops) {
  const extra = stops.map((p) => p.cluster).filter(Boolean)
  line.clusters = [...new Set([...(line.clusters ?? []), ...extra])]
  const lons = stops.map((p) => p.lng).filter(Number.isFinite)
  const lats = stops.map((p) => p.lat).filter(Number.isFinite)
  if (lons.length && line._bounds?.lng?.length === 2 && line._bounds?.lat?.length === 2) {
    line._bounds.lng = [Math.min(line._bounds.lng[0], ...lons), Math.max(line._bounds.lng[1], ...lons)]
    line._bounds.lat = [Math.min(line._bounds.lat[0], ...lats), Math.max(line._bounds.lat[1], ...lats)]
  }
}

async function autoFetchPhotos(poi) {
  error.value = ''; notice.value = ''
  fetchingPhotos.value = true
  try {
    notice.value = '已自动保存草稿 → 开始抓取…'
    if (!await save(true)) return
    const { filled, failed } = await manage('/api/manage/content/fetch-photos', {
      method: 'POST',
      body: { ipId, cityKey: activeCity.value, poiId: poi?.poiId },
    })
    // 直接把结果合并进当前内存文档：不 reload，未保存的手工填写不受影响
    let count = 0
    for (const line of Object.values(doc.lines)) {
      for (const p of [...(line.ipStops ?? []), ...(line.cityStops ?? [])]) {
        const f = filled?.[p.poiId]
        if (!f) continue
        p.photos = [...(p.photos ?? []), ...f.photos]
        if (!p.realPhoto) p.realPhoto = f.photos[0]
        p.photoCredit = [p.photoCredit, f.credit].filter(Boolean).join('；')
        count++
      }
    }
    notice.value = count ? `已抓取 ${count} 个点位的候选图（人工可换可删）。` : ''
    if (failed?.length) error.value = `未抓到的：${failed.join('、')}（可手工上传）`
  } catch (e) { error.value = e.message } finally { fetchingPhotos.value = false }
}

// 取景地定位：单个点位 / 一键全部
async function locatePoi(poi) {
  error.value = ''
  locating.value = true
  try {
    const name = (poi.filmingLocation || '').trim() || poi.name
    if (!name.trim()) { error.value = '请先填写取景地/现实地名'; return }
    const { place } = await manage('/api/manage/content/geocode', { method: 'POST', body: { city: activeLine()?.line.city ?? '', name } })
    if (typeof place.lng === 'number' && typeof place.lat === 'number') {
      poi.lng = place.lng
      poi.lat = place.lat
      if (place.address && !poi.locationDetail) poi.locationDetail = place.address
      notice.value = `已定位「${poi.name || name}」→ ${place.address || `${place.lng}, ${place.lat}`}`
    } else error.value = '定位结果没有坐标，请换名字或地图选点'
  } catch (e) { error.value = e.message } finally { locating.value = false }
}

async function locateAll() {
  error.value = ''
  locating.value = true
  try {
    notice.value = '已自动保存草稿 → 开始定位…'
    if (!await save(true)) return
    const { located, missing } = await manage('/api/manage/content/geocode', { method: 'POST', body: { ipId, cityKey: activeCity.value } })
    // 本地合并坐标，不 reload
    let count = 0
    for (const line of Object.values(doc.lines)) {
      for (const p of [...(line.ipStops ?? []), ...(line.cityStops ?? [])]) {
        const hit = located?.[p.poiId]
        if (!hit) continue
        p.lng = hit.lng
        p.lat = hit.lat
        if (hit.address && !p.locationDetail) p.locationDetail = hit.address
        count++
      }
    }
    notice.value = count ? `已定位 ${count} 个点位。` : ''
    if (missing.length) error.value = `未定位（取景地待人工补充）：${missing.join('、')}`
  } catch (e) { error.value = e.message } finally { locating.value = false }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

const KINDS = [['novel', '小说'], ['film', '影视'], ['poetry', '诗词'], ['history', '史传']]
const STATUS_TEXT = { draft: '草稿', online: '已上线', offline: '已下架', bundled: '打包数据（未导入）' }

function lineEntries() { return Object.entries(doc.lines) }
function activeLine() { return doc.lines[activeCity.value] }

onMounted(load)
async function load() {
  busy.value = true; error.value = ''
  try {
    const { ip } = await manage(`/api/manage/content/ips/${ipId}`)
    meta.value = ip
    const fresh = { ip: { ipId, name: '', author: '', kind: 'novel', cover: '', aliases: [] }, lines: {} }
    Object.assign(doc, JSON.parse(JSON.stringify({ ...fresh, ...ip.doc, ip: { ...fresh.ip, ...(ip.doc?.ip ?? {}) } })))
    publishSelected.value = Object.keys(doc.lines)
    // 从预览返回：先恢复离开时的城市线，再设置 activeCity/activePoi（顺序不能反，否则点位串线）
    activeCity.value = Object.keys(doc.lines)[0] ?? ''
    try {
      const pos = JSON.parse(sessionStorage.getItem(`wizard:${ipId}`) || 'null')
      if (pos) {
        if (doc.lines[pos.city]) activeCity.value = pos.city
        if (Number.isInteger(pos.step) && pos.step >= 0 && pos.step <= 4) { step.value = pos.step; maxVisited.value = Math.max(maxVisited.value, pos.step) }
        sessionStorage.removeItem(`wizard:${ipId}`)
      }
    } catch { /* 忽略坏数据 */ }
    activePoi.value = doc.lines[activeCity.value]?.ipStops?.[0] ?? doc.lines[activeCity.value]?.cityStops?.[0] ?? null
    checkCityStops()
  } catch (e) { error.value = e.message } finally { busy.value = false }
}

const aliasesText = computed({
  get: () => (doc.ip.aliases ?? []).join('、'),
  set: (v) => { doc.ip.aliases = v.split(/[、,，]/).map((s) => s.trim()).filter(Boolean) },
})

// ---------- 第①步 ----------
async function uploadCover(e, target, field) {
  error.value = ''
  try { target[field] = await uploadImage(e.target.files[0]); e.target.value = '' }
  catch (err) { error.value = err.message }
}
function hasSubstance() {
  return Object.values(doc.lines).some((line) =>
    (line.ipStops ?? []).some((p) => (p.name ?? '').trim() || (p.quotes ?? []).some((q) => (q.full ?? '').trim()))
    || (line.cityStops ?? []).some((p) => (p.name ?? '').trim()))
}
function aiDraftClick() {
  error.value = ''
  // 草稿是空的：无可覆盖，直接执行；有内容：两步确认
  if (hasSubstance() && !aiConfirm.value) { aiConfirm.value = true; return }
  aiConfirm.value = false
  aiDraft()
}
async function aiDraft() {
  aiBusy.value = true; error.value = ''; notice.value = ''
  try {
    let epub = null, sourceText = aiPaste.value.trim() || undefined
    if (aiEpub.value) epub = await fileToBase64(aiEpub.value)
    if (!epub && !sourceText) { error.value = '请上传 epub 原文或粘贴一段文本'; return }
    const { doc: aiDoc } = await manage('/api/manage/content/ai/draft', {
      method: 'POST',
      body: { ipName: doc.ip.name, author: doc.ip.author, kind: doc.ip.kind, epub, sourceText },
    })
    Object.assign(doc, aiDoc)
    doc.ip.ipId = ipId
    for (const line of Object.values(doc.lines)) line.line.ipId = ipId
    activeCity.value = Object.keys(doc.lines)[0] ?? ''
    activePoi.value = doc.lines[activeCity.value]?.ipStops?.[0] ?? null
    notice.value = 'AI 草稿已生成（含自动划分的片区与自动定位的坐标）。引文必须逐条核对原文后再上架。'
    step.value = 1   // 第①步使命完成，直接去核对点位卡
    maxVisited.value = Math.max(maxVisited.value, 1)
    aiGenerated.value = true
    checkCityStops()
  } catch (e) {
    notice.value = ''
    error.value = e.status === 501 ? 'AI 服务未接入：请先在 server/.env.ai.local 配置 AI_BASE_URL / AI_API_KEY / AI_MODEL。' : e.message
  } finally { aiBusy.value = false }
}

// ---------- 第②步 ----------
function switchCity(city) {
  activeCity.value = city
  activePoi.value = doc.lines[city]?.ipStops?.[0] ?? doc.lines[city]?.cityStops?.[0] ?? null
  checkCityStops()
}
function nextPoiId(line, type) {
  const prefix = `${line.line.lineId}-${type === 'ip' ? 'ip' : 'sp'}-`
  const n = [...(line.ipStops ?? []), ...(line.cityStops ?? [])].filter((p) => p.poiId?.startsWith(prefix)).length + 1
  return `${prefix}${String(n).padStart(2, '0')}`
}
function addPoi(type) {
  const line = activeLine()
  if (!line) return
  const poi = {
    poiId: nextPoiId(line, type), lineId: line.line.lineId, type, name: '', alias: '', lng: null, lat: null,
    cluster: '', durationNormal: 60, durationRush: 30, intro: '', quotes: [],
    realPhoto: '', photos: [], photoCredit: '', skipNote: '', tips: '',
  }
  if (type === 'ip') { poi.tier = ''; line.ipStops = [...(line.ipStops ?? []), poi] }
  else { poi.popularity = 3; line.cityStops = [...(line.cityStops ?? []), poi] }
  activePoi.value = poi
}
function removePoi(poi) {
  const line = activeLine()
  if (!line) return
  if (!confirm(`删除点位「${poi.name || poi.poiId}」？`)) return
  line.ipStops = (line.ipStops ?? []).filter((p) => p !== poi)
  line.cityStops = (line.cityStops ?? []).filter((p) => p !== poi)
  if (activePoi.value === poi) activePoi.value = line.ipStops[0] ?? line.cityStops[0] ?? null
}
const poiBadge = (poi) => { const n = poiMissingFields(poi).length; return n ? `${n} 项未填` : '✓' }
// 待定位分组：无坐标的点位单独列出（虚构地名等，需补取景地/地图选点）
const pendingPois = computed(() => { const line = activeLine(); return line ? [...(line.ipStops ?? []), ...(line.cityStops ?? [])].filter((p) => p.lng == null || p.lat == null) : [] })
const ipLocatedPois = computed(() => { const line = activeLine(); return line ? (line.ipStops ?? []).filter((p) => p.lng != null && p.lat != null) : [] })
const spLocatedPois = computed(() => { const line = activeLine(); return line ? (line.cityStops ?? []).filter((p) => p.lng != null && p.lat != null) : [] })
// 保险：表单只渲染属于当前城市线的点位（防预览返回/切换后串线）
const activePoiInLine = computed(() => {
  const line = activeLine()
  return !!line && !!activePoi.value && [...(line.ipStops ?? []), ...(line.cityStops ?? [])].includes(activePoi.value)
})
// 上架就绪：数据完整 + 每个点位有真实照片且授权齐全（占位图/待替换也算未完成）
const PLACEHOLDER_CREDIT = /占位|待替换|待补/
function imageGapCount(line) {
  return [...(line.ipStops ?? []), ...(line.cityStops ?? [])]
    .filter((p) => !(p.realPhoto ?? '').trim() || !(p.photoCredit ?? '').trim() || PLACEHOLDER_CREDIT.test(p.photoCredit)).length
}
function publishReady(r) {
  return !!r.readiness?.ready && imageGapCount(r.line) === 0
}

// ---------- 第③步 ----------
async function ensurePool() {
  const line = activeLine()
  if (!line || poolLoadedFor.value === line.line.city) return
  poolLoadedFor.value = line.line.city
  pool.value = { spots: [] }
  try { pool.value = await manage(`/api/manage/content/city-pool?city=${encodeURIComponent(line.line.city)}`) } catch { pool.value = { spots: [] } }
  const checked = {}
  const existingNames = new Set((line.cityStops ?? []).map((p) => p.name))
  for (const spot of pool.value.spots) checked[spot.key] = existingNames.has(spot.name)
  poolChecked.value = checked
}
function syncCityStops() {
  const line = activeLine()
  if (!line) return
  const existing = new Map((line.cityStops ?? []).map((p) => [p.name, p]))
  const stops = []
  let seq = 0
  for (const spot of pool.value.spots) {
    if (!poolChecked.value[spot.key]) continue
    seq++
    const prev = existing.get(spot.name)
    stops.push(prev ?? {
      poiId: `${line.line.lineId}-sp-${String(seq).padStart(2, '0')}`, lineId: line.line.lineId, type: 'classic',
      name: spot.name, lng: spot.lng, lat: spot.lat, cluster: spot.cluster, popularity: spot.popularity ?? 3,
      durationNormal: spot.durationNormal ?? 60, durationRush: spot.durationRush ?? 30,
      intro: spot.intro ?? '', realPhoto: spot.realPhoto ?? '', photos: spot.photos ?? [],
      photoCredit: spot.photoCredit ?? '', ticket: spot.ticket ?? '', openHours: spot.openHours ?? '',
    })
  }
  line.cityStops = stops
  mergeClustersAndBounds(line, stops)
  notice.value = `已同步 ${stops.length} 个城市景点到「${line.line.city}」线。`
}
function checkAllPool(v) {
  const next = {}
  for (const s of pool.value.spots) next[s.key] = v
  poolChecked.value = next
}
function addCityLine() {
  const city = prompt('新城市线的城市名（如：杭州）')?.trim()
  if (!city || doc.lines[city]) return
  doc.lines[city] = {
    _bounds: { lng: [73, 135], lat: [18, 54] },
    _expected: { ipStops: [6, 12], cityStops: [10, 20], maxTierS: 3 },
    line: { lineId: `${ipId}-${city}`, ipId, title: `${doc.ip.name || ipId}·${city}`, city, cover: '', recommendDays: 2 },
    clusters: [], ipStops: [], cityStops: [],
  }
  switchCity(city)
  step.value = 2
}
function removeCityLine() {
  const city = activeCity.value
  if (!city || !confirm(`删除「${city}」城市线及其全部点位？`)) return
  delete doc.lines[city]
  activeCity.value = Object.keys(doc.lines)[0] ?? ''
}
const clustersText = computed({
  get: () => (activeLine()?.clusters ?? []).join('\n'),
  set: (v) => { const line = activeLine(); if (line) line.clusters = v.split('\n').map((s) => s.trim()).filter(Boolean) },
})

// ---------- 第④步 ----------
const missingImages = computed(() => {
  const out = []
  if (!doc.ip.cover) out.push('作品封面')
  for (const [city, line] of lineEntries()) {
    if (!line.line.cover) out.push(`${city} 线路封面`)
    for (const poi of [...(line.ipStops ?? []), ...(line.cityStops ?? [])]) {
      if (!poi.realPhoto) out.push(`${city} · ${poi.name || poi.poiId}`)
    }
  }
  return out
})

// ---------- 第⑤步 ----------
const readinessList = computed(() => lineEntries().map(([city, line]) => ({
  city, line, readiness: lineReadiness({ ...line, ip: doc.ip }),
})))
function fmtIssues(list) { return list.slice(0, 8).map((i) => `[${i.ruleId}] ${i.msg}${i.where ? `（${i.where}）` : ''}`).join('；') + (list.length > 8 ? ` 等 ${list.length} 条` : '') }

// ---------- 保存/上架 ----------
function payload() { return JSON.parse(JSON.stringify(doc)) }
async function save(silent) {
  saving.value = true; error.value = ''
  if (!silent) notice.value = ''
  try {
    const { ip } = await manage(`/api/manage/content/ips/${ipId}`, { method: 'PUT', body: { doc: payload() } })
    meta.value = ip
    if (!silent) notice.value = '已保存草稿'
    else flashSaved()
    return true
  } catch (e) {
    error.value = e instanceof ManageError && e.issues ? `${e.message}：${fmtIssues(e.issues)}` : e.message
    return false
  } finally { saving.value = false }
}
async function publish() {
  error.value = ''; notice.value = ''
  const cityKeys = (publishSelected.value.length ? publishSelected.value : Object.keys(doc.lines))
    .filter((k) => publishReady(readinessList.value.find((r) => r.city === k)))
  if (!cityKeys.length) { error.value = '没有可上架的线路（检查就绪状态与图片）'; return }
  if (!await save(true)) return
  try {
    const { ip } = await manage(`/api/manage/content/ips/${ipId}/status`, { method: 'PATCH', body: { status: 'online', cityKeys } })
    meta.value = ip
    notice.value = `已上架 ${cityKeys.length} 条城市线（公开接口 /api/content/lines 已可见）。`
  } catch (e) {
    error.value = e instanceof ManageError && e.issues ? `${e.message}：${fmtIssues(e.issues)}` : e.message
  }
}
async function unpublish() {
  error.value = ''
  const cityKeys = publishSelected.value.length ? publishSelected.value : Object.keys(doc.lines)
  try {
    const { ip } = await manage(`/api/manage/content/ips/${ipId}/status`, { method: 'PATCH', body: { status: 'offline', cityKeys } })
    meta.value = ip
    notice.value = `已下架 ${cityKeys.length} 条城市线。`
  } catch (e) { error.value = e.message }
}

function go(next) {
  error.value = ''
  if (next === 2) ensurePool()
  step.value = next
  maxVisited.value = Math.max(maxVisited.value, next)
  window.scrollTo(0, 0)
}

async function goPreview() {
  if (!await save(true)) return
  sessionStorage.setItem(`wizard:${ipId}`, JSON.stringify({ step: step.value, city: activeCity.value }))
  router.push(`/manage/ips/${ipId}/preview`)
}
</script>

<template>
  <div>
    <p><router-link class="mini" to="/manage/ips">← 返回 IP 管理</router-link></p>
    <div class="head">
      <h2 class="title">{{ doc.ip.name || ipId }}</h2>
      <span class="status" :data-s="meta?.status">{{ STATUS_TEXT[meta?.status] ?? '加载中' }}</span>
      <span class="spacer" />
      <button v-if="step === 4" class="btn-ghost" :disabled="saving" @click="goPreview">👁 预览效果</button>
    </div>
    <ol class="steps">
      <li v-for="(label, i) in STEPS" :key="label" :class="{ on: step === i, done: i < step, future: i > maxVisited }" @click="i <= maxVisited && i !== step && go(i)">{{ i + 1 }}. {{ label }}</li>
    </ol>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <p v-if="busy" class="hint">加载中…</p>

    <template v-if="!busy && meta">
      <!-- ① 作品信息 -->
      <section v-if="step === 0" class="panel">
        <div v-if="aiGenerated" class="hint-banner ai-banner">
          ✨ 已用 epub 生成草稿：点位卡 / 片区 / 引文都已填好，点下方「下一步」逐条核对。
          <b>epub 文件因浏览器安全限制无法记住选择</b>，如需重新生成请重新选择文件。
        </div>
        <div class="grid">
          <label>IP ID<input :value="ipId" disabled /></label>
          <label>作品名 *<input v-model="doc.ip.name" maxlength="60" /></label>
          <label>作者<input v-model="doc.ip.author" maxlength="60" /></label>
          <label>作品类型<select v-model="doc.ip.kind"><option v-for="[v, t] in KINDS" :key="v" :value="v">{{ t }}</option></select></label>
          <label class="wide">搜索别名（顿号分隔，用于首页联想）<input v-model="aliasesText" /></label>
        </div>
        <div class="cover-row">
          <p class="label">作品封面（首页卡片用）</p>
          <div class="thumbs">
            <figure v-if="doc.ip.cover" class="cover"><img :src="assetUrl(doc.ip.cover)" alt="作品封面" /></figure>
            <label class="add">＋ 上传封面<input type="file" accept="image/jpeg" hidden @change="uploadCover($event, doc.ip, 'cover')" /></label>
          </div>
        </div>
        <div class="ai-box">
          <p class="label">✨ AI 填模板：上传作品 epub（或粘贴原文），AI 自动填写点位卡、从原文提取引文、划分片区并定位坐标</p>
          <div class="ai-row">
            <label class="file-btn">选择 .epub 文件
              <input type="file" accept=".epub,application/epub+zip" hidden @change="aiEpub = $event.target.files[0]" />
            </label>
            <span v-if="aiEpub" class="file-name">{{ aiEpub.name }}</span>
            <input v-model="aiPaste" class="paste" placeholder="或粘贴一段原文（可选，epub 优先）" />
            <button v-if="!aiConfirm" class="btn" :disabled="aiBusy" @click="aiDraftClick">{{ aiBusy ? 'AI 填写中（含坐标定位，约 30–60 秒）…' : '✨ AI 一键填写模板' }}</button>
            <template v-else>
              <button class="btn danger" :disabled="aiBusy" @click="aiDraftClick">确认覆盖并重新生成？</button>
              <button class="btn-ghost" @click="aiConfirm = false">取消</button>
            </template>
          </div>
          <p class="hint">引文红线：AI 只从喂入的原文中提取引文并标注出处；上架前必须人工逐条核对。</p>
        </div>
      </section>

      <!-- ② IP 点位卡 -->
      <section v-else-if="step === 1" class="panel">
        <div class="city-tabs">
          <button v-for="[city] in lineEntries()" :key="city" :class="{ on: activeCity === city }" @click="switchCity(city)">{{ city }}</button>
          <button class="btn-ghost" @click="addCityLine">＋ 城市线</button>
          <span class="spacer" />
          <button v-if="(activeLine()?.ipStops ?? []).some((p) => p.lng == null)" class="btn-ghost" :disabled="locating" @click="locateAll">{{ locating ? '定位中…' : '📍 一键定位全部待定位点位' }}</button>
          <button class="btn-ghost" :disabled="fetchingPhotos" @click="autoFetchPhotos()">{{ fetchingPhotos ? '抓取中…' : '📷 一键抓取全部缺图' }}</button>
        </div>
        <div v-if="cityStopsHint && activeLine()" class="hint-banner">
          <template v-if="cityStopsHint.kind === 'sibling'">检测到同城线路「{{ cityStopsHint.label }}」已确认 {{ cityStopsHint.count }} 个城市景点，可一键复制（含已微调过的门票/开放时间）。</template>
          <template v-else-if="cityStopsHint.kind === 'pool'">检测到「{{ activeLine().line.city }}」城市共享池（{{ cityStopsHint.count }} 个景点），可一键全选同步。</template>
          <template v-else>「{{ activeLine().line.city }}」暂无城市共享池，可在下方手工添加城市景点（AI 生成共享池为后续版本功能）。</template>
          <button v-if="cityStopsHint.kind !== 'none'" class="mini" @click="applyCityStopsHint">一键同步</button>
          <button class="mini" @click="cityStopsHint = null">忽略</button>
        </div>
        <div v-if="activeLine()" class="poi-layout">
          <aside class="poi-list">
            <div class="add-row">
              <button class="btn-ghost" @click="addPoi('ip')">＋ IP 点位卡</button>
              <button class="btn-ghost" @click="addPoi('classic')">＋ 城市景点</button>
            </div>
            <p class="group pending-group">待定位（{{ pendingPois.length }}）<small>虚构地名等：补取景地后定位</small></p>
            <button v-for="p in pendingPois" :key="p.poiId" class="poi pending" :class="{ on: activePoi === p }" @click="activePoi = p">
              <b>{{ p.name || '（未命名）' }}</b>
              <small :class="{ miss: poiMissingFields(p).length }">{{ p.poiId }} · {{ poiBadge(p) }}</small>
              <span class="del" role="button" aria-label="删除此点位" @click.stop="removePoi(p)">✕</span>
            </button>
            <p class="group">IP 打卡点（{{ ipLocatedPois.length }}）</p>
            <button v-for="p in ipLocatedPois" :key="p.poiId" class="poi" :class="{ on: activePoi === p }" @click="activePoi = p">
              <b>{{ p.name || '（未命名）' }}</b>
              <small :class="{ miss: poiMissingFields(p).length }">{{ p.poiId }} · {{ poiBadge(p) }}</small>
              <span class="del" role="button" aria-label="删除此点位" @click.stop="removePoi(p)">✕</span>
            </button>
            <p class="group">城市景点（{{ spLocatedPois.length }}）</p>
            <button v-for="p in spLocatedPois" :key="p.poiId" class="poi" :class="{ on: activePoi === p }" @click="activePoi = p">
              <b>{{ p.name || '（未命名）' }}</b>
              <small :class="{ miss: poiMissingFields(p).length }">{{ p.poiId }} · {{ poiBadge(p) }}</small>
              <span class="del" role="button" aria-label="删除此点位" @click.stop="removePoi(p)">✕</span>
            </button>
            <p v-if="!pendingPois.length && !ipLocatedPois.length && !spLocatedPois.length" class="hint">还没有点位。IP 点对照原著/剧集逐点核对填写；城市景点可在第③步从共享池勾选。</p>
          </aside>
          <div v-if="activePoiInLine" class="poi-edit">
            <PoiEditForm :poi="activePoi" :clusters="activeLine().clusters ?? []" :line-id="activeLine().line.lineId" :city="activeLine().line.city" :max-tier-s="activeLine()._expected?.maxTierS ?? 3" :locating="locating" @remove="removePoi(activePoi)" @locate="locatePoi(activePoi)" />
          </div>
          <div v-else class="poi-edit"><p class="hint">点左侧点位开始编辑；还没有点位就点「＋」新增。</p></div>
        </div>
      </section>

      <!-- ③ 城市线与景点 -->
      <section v-else-if="step === 2" class="panel">
        <div class="city-tabs">
          <button v-for="[city] in lineEntries()" :key="city" :class="{ on: activeCity === city }" @click="switchCity(city); ensurePool()">{{ city }}</button>
          <button class="btn-ghost" @click="addCityLine">＋ 城市线</button>
        </div>
        <template v-if="activeLine()">
          <div class="grid">
            <label>线路 ID<input :value="activeLine().line.lineId" disabled /></label>
            <label>线路标题<input v-model="activeLine().line.title" maxlength="60" /></label>
            <label>城市<input :value="activeLine().line.city" disabled /></label>
            <label>推荐天数<input v-model.number="activeLine().line.recommendDays" type="number" min="1" max="14" /></label>
            <label>经度范围<input :value="activeLine()._bounds?.lng?.join(' ~ ')" @change="activeLine()._bounds.lng = $event.target.value.split('~').map(Number)" /></label>
            <label>纬度范围<input :value="activeLine()._bounds?.lat?.join(' ~ ')" @change="activeLine()._bounds.lat = $event.target.value.split('~').map(Number)" /></label>
            <label>IP 点位期望（如 6-12）<input :value="activeLine()._expected?.ipStops?.join('-')" @change="activeLine()._expected.ipStops = $event.target.value.split('-').map(Number)" /></label>
            <label>城市景点期望<input :value="activeLine()._expected?.cityStops?.join('-')" @change="activeLine()._expected.cityStops = $event.target.value.split('-').map(Number)" /></label>
            <label>S 级上限<input v-model.number="activeLine()._expected.maxTierS" type="number" min="1" max="5" /></label>
          </div>
          <label class="clusters">片区列表（片区 = 行程分组单位，同片区的点尽量排在同一天；通常由 AI 自动划分，可微调。每行一个）<textarea v-model="clustersText" rows="4" /></label>

          <div class="cover-row">
            <p class="label">线路封面</p>
            <div class="thumbs">
              <figure v-if="activeLine().line.cover" class="cover"><img :src="assetUrl(activeLine().line.cover)" alt="线路封面" /></figure>
              <label class="add">＋ 上传封面<input type="file" accept="image/jpeg" hidden @change="uploadCover($event, activeLine().line, 'cover')" /></label>
            </div>
          </div>

          <div class="pool">
            <div class="pool-head">
              <p class="label">城市著名景点（城市共享池：{{ activeLine().line.city }}，共 {{ pool.spots.length }} 个）——勾选后成为该城市线的城市著名景点，可再逐个微调门票/开放时间</p>
              <div class="pool-ops">
                <button class="mini" @click="checkAllPool(true)">全选</button>
                <button class="mini" @click="checkAllPool(false)">清空</button>
                <button class="btn-ghost" @click="syncCityStops">同步选中景点到本线</button>
              </div>
            </div>
            <p v-if="!pool.spots.length" class="hint">该城市暂无共享池数据（data/cities/{{ activeLine().line.city }}.json 不存在）。可回第②步手动添加城市景点。</p>
            <div class="pool-grid">
              <label v-for="spot in pool.spots" :key="spot.key" class="pool-item">
                <input v-model="poolChecked[spot.key]" type="checkbox" />
                <span>{{ spot.name }}</span>
                <small>{{ spot.cluster }} · ★{{ spot.popularity }} · {{ spot.durationNormal }}分钟</small>
              </label>
            </div>
            <p class="hint">本线现有城市景点：{{ activeLine().cityStops?.length ?? 0 }} 个（可回第②步的城市景点卡查看/调整）</p>
          </div>
          <button class="btn-ghost danger subtle" @click="removeCityLine">删除此城市线（含它的全部点位）</button>
        </template>
      </section>

      <!-- ④ 图片检查 -->
      <section v-else-if="step === 3" class="panel">
        <div class="city-tabs">
          <button v-for="[city] in lineEntries()" :key="city" :class="{ on: activeCity === city }" @click="switchCity(city)">{{ city }}</button>
        </div>
        <div class="check-head">
          <p class="label">交稿前核对：每张图一个点位、来源授权齐全、无遗漏。缺图可在第②步一键抓取或手工上传。</p>
        </div>
        <div v-if="missingImages.length" class="missing-box">
          <p class="label">缺图清单（{{ missingImages.length }}）</p>
          <ul><li v-for="m in missingImages" :key="m">{{ m }}</li></ul>
          <p class="hint">实在没图可先用同色系占位图，图片来源/授权栏标注「占位图，待替换」。Commons 抓不到的景点（如虚构地名）请手工上传。</p>
        </div>
        <p v-else class="ok-line">✓ 全部图片就绪</p>
        <div v-if="activeLine()" class="img-group">
          <h3>{{ activeLine().line.title }}（{{ activeCity }}）</h3>
          <div class="thumbs">
            <figure v-for="poi in [...(activeLine().ipStops ?? []), ...(activeLine().cityStops ?? [])]" :key="poi.poiId" :class="{ cover: true }">
              <img v-if="poi.realPhoto" :src="assetUrl(poi.realPhoto)" :alt="poi.name" class="zoom" @click="lightbox = assetUrl(poi.realPhoto)" />
              <div v-else class="no-img">缺图</div>
              <figcaption>{{ poi.name || poi.poiId }}</figcaption>
            </figure>
          </div>
        </div>
        <div v-if="lightbox" class="lightbox" @click="lightbox = ''"><img :src="lightbox" alt="原图" /></div>
      </section>

      <!-- ⑤ 检查与上架 -->
      <section v-else class="panel">
        <h3>上架前检查（按城市线勾选，可只上架部分线路）</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th></th><th>城市线</th><th>当前状态</th><th>IP 点位</th><th>城市景点</th><th>就绪</th></tr></thead>
            <tbody>
              <tr v-for="r in readinessList" :key="r.city">
                <td><input v-model="publishSelected" type="checkbox" :value="r.city" :disabled="!publishReady(r)" :title="publishReady(r) ? '' : '数据未就绪（含图片检查），不能上架'" /></td>
                <td>{{ r.line.line.title }}</td>
                <td><span class="status" :data-s="r.line.status ?? meta?.status">{{ { draft: '草稿', online: '已上线', offline: '已下架' }[r.line.status ?? meta?.status] ?? '草稿' }}</span></td>
                <td>{{ r.readiness.ipDone }}/{{ r.readiness.ipTotal }}</td>
                <td>{{ r.readiness.spDone }}/{{ r.readiness.spTotal }}</td>
                <td>
                  <span v-if="publishReady(r)" class="ok-line">✓ 可上架</span>
                  <span v-else-if="r.readiness.ready" class="miss">缺图/占位 {{ imageGapCount(r.line) }} 处</span>
                  <span v-else class="miss">{{ r.readiness.missing.join(' · ') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="hint">引文红线：逐字来自原著/剧集并标注出处；查不到就留空，绝不编造。未就绪的线路（含缺图/占位图）勾选框已禁用，补齐数据后才能上架。</p>
      </section>

      <footer class="actions">
        <button class="btn-ghost" :disabled="saving" :class="{ saved: savedFlash }" @click="save()">{{ saving ? '保存中…' : savedFlash ? '✓ 已自动保存' : '保存草稿' }}</button>
        <span class="spacer" />
        <button v-if="step > 0" class="btn-ghost" @click="go(step - 1)">上一步</button>
        <button v-if="step < 4" class="btn" @click="go(step + 1)">下一步</button>
        <template v-else>
          <button class="btn" :disabled="!publishSelected.length" @click="publish">上架所选线路（{{ publishSelected.length }}）</button>
          <button class="btn-ghost" :disabled="!publishSelected.length" @click="unpublish">下架所选线路</button>
        </template>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.mini { font-size: 13px; color: var(--brand); text-decoration: underline; }
.head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.head .spacer { flex: 1; }
.title { font-size: 20px; letter-spacing: 1px; }
.status { font-size: 12px; padding: 2px 10px; border-radius: 999px; background: var(--bg); }
.status[data-s='online'] { background: #e8f5e9; color: #2e7d32; }
.status[data-s='draft'] { background: #fff8e1; color: #b28704; }
.status[data-s='bundled'] { background: #e3f2fd; color: #1565c0; }
.error { color: var(--brand); margin: 10px 0; font-size: 14px; }
.notice { color: #2e7d32; margin: 10px 0; font-size: 14px; }
.hint { color: var(--ink-2); font-size: 13px; }
.ok-line { color: #2e7d32; font-size: 14px; }
.miss { color: var(--ink-2); font-size: 12px; }
td .status { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--bg); }
td .status[data-s='online'] { background: #e8f5e9; color: #2e7d32; }
td .status[data-s='draft'] { background: #fff8e1; color: #b28704; }
td .status[data-s='offline'] { background: #eee; color: #777; }
.ai-banner b { color: #8a6d1a; }
.steps { display: flex; gap: 6px; list-style: none; padding: 0; margin: 0 0 16px; flex-wrap: wrap; }
.steps li { padding: 7px 14px; border: 1px solid var(--line); border-radius: 999px; background: #fff; font-size: 13px; color: var(--ink-2); }
.steps li.on { border-color: var(--brand); color: var(--brand); font-weight: 600; }
.steps li.done { color: var(--brand); cursor: pointer; text-decoration: underline; }
.steps li.future { opacity: .45; cursor: not-allowed; }
.panel { background: #fff; border: 1px solid var(--line); border-radius: var(--card-radius); padding: 18px 20px; margin-bottom: 18px; box-shadow: var(--shadow); }
.panel h3 { font-size: 15px; margin-bottom: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
label { display: grid; gap: 4px; font-size: 13px; color: var(--ink-2); }
label.wide { grid-column: 1 / -1; }
input, textarea, select { padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; font: inherit; font-size: 14px; background: #fff; }
input:disabled { background: var(--bg); color: var(--ink-2); }
.clusters { margin-top: 10px; }
.cover-row { margin-top: 12px; }
.thumbs { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
.thumbs figure { margin: 0; width: 120px; display: grid; gap: 4px; }
.thumbs img, .thumbs .no-img { width: 120px; height: 90px; object-fit: cover; border-radius: 8px; border: 2px solid var(--line); }
.thumbs .no-img { display: grid; place-items: center; background: var(--bg); color: #c0392b; font-size: 12px; }
.thumbs figcaption { font-size: 11px; color: var(--ink-2); overflow-wrap: anywhere; }
.add { display: grid; place-items: center; width: 120px; height: 90px; border: 1px dashed var(--line); border-radius: 8px; font-size: 13px; color: var(--ink-2); cursor: pointer; }
.ai-box { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px; }
.ai-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
.file-btn { display: inline-grid; padding: 9px 16px; border: 1px dashed var(--line); border-radius: 8px; font-size: 13px; color: var(--ink-2); cursor: pointer; }
.file-name { font-size: 13px; color: var(--brand); }
.paste { flex: 1; min-width: 200px; }
.city-tabs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; align-items: center; }
.city-tabs .spacer { flex: 1; }
.city-tabs button { padding: 7px 16px; border: 1px solid var(--line); border-radius: 999px; background: #fff; font-size: 13px; }
.city-tabs button.on { border-color: var(--brand); color: var(--brand); font-weight: 600; }
.poi-layout { display: grid; grid-template-columns: 250px 1fr; gap: 18px; align-items: start; }
.poi-list { display: grid; gap: 6px; position: sticky; top: 16px; }
.add-row { display: flex; gap: 8px; }
.group { font-size: 12px; color: var(--ink-2); margin: 8px 0 2px; }
.poi { text-align: left; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: #fff; display: grid; gap: 2px; position: relative; }
.poi.on { border-color: var(--brand); background: var(--brand-light, #f7f3ee); }
.poi b { font-size: 13px; padding-right: 18px; }
.poi small { font-size: 11px; color: #2e7d32; }
.poi small.miss { color: #c0392b; }
.poi .del { position: absolute; top: 6px; right: 8px; font-size: 12px; color: var(--ink-2); padding: 2px 4px; border-radius: 6px; }
.poi .del:hover { color: #c0392b; background: #ffebee; }
.poi.pending { border-color: #f0d68a; background: #fffdf5; }
.pending-group { color: #b28704; }
.pending-group small { display: block; font-weight: 400; color: var(--ink-2); }
.poi-edit { min-width: 0; }
.pool { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 14px; }
.pool-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.pool-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 6px; margin-top: 10px; }
.pool-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
.pool-item input { width: auto; }
.pool-item span { flex: none; }
.pool-item small { color: var(--ink-2); font-size: 11px; }
.missing-box { background: #ffebee; border: 1px solid #f5c6c0; border-radius: 10px; padding: 12px 16px; margin-bottom: 14px; }
.missing-box ul { margin: 8px 0 0; padding-left: 18px; font-size: 13px; color: #8a2c22; max-height: 160px; overflow-y: auto; }
.check-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.pool-ops { display: flex; align-items: center; gap: 10px; }
.hint-banner { background: #e3f2fd; border: 1px solid #a6c8e8; border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; color: #155a9e; }
.hint-banner .mini { margin-left: 8px; }
.thumbs img.zoom { cursor: zoom-in; }
.lightbox { position: fixed; inset: 0; background: #000a; display: grid; place-items: center; z-index: 200; cursor: zoom-out; }
.lightbox img { max-width: 92vw; max-height: 90vh; border-radius: 8px; }
.img-group { margin-top: 16px; }
.img-group h3 { font-size: 14px; margin-bottom: 8px; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--line); }
th { font-size: 12px; color: var(--ink-2); background: var(--bg); }
tr:last-child td { border-bottom: 0; }
.actions { display: flex; align-items: center; gap: 12px; position: sticky; bottom: 0; background: var(--bg); padding: 12px 0; border-top: 1px solid var(--line); }
.actions .btn-ghost.saved { color: #2e7d32; border-color: #a5d6a7; background: #e8f5e9; }
.spacer { flex: 1; }
.btn-ghost.danger { color: #c0392b; justify-self: start; }
.btn-ghost.danger.subtle { font-size: 12px; opacity: .85; }
@media (max-width: 860px) { .poi-layout { grid-template-columns: 1fr; } .poi-list { position: static; } }
</style>
