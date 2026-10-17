<script setup>
// 投稿审核：核对位置/照片/作品关联 → 标记状态；「转为路线点位」生成草稿 POI。
// 鉴权 = 管理员 cookie 会话（原 /review/points 的密钥登录已随统一后台移除）。
import { ref, onBeforeUnmount } from 'vue'
import { manage } from '../../api/manage.js'

const rows = ref([])
const error = ref('')
const busy = ref(false)
const photos = ref({})
const notes = ref({})
const promoting = ref(null)   // 正在转正的投稿
const targetLineId = ref('')
let generation = 0

function clearPhotos() { for (const urls of Object.values(photos.value)) for (const url of urls) URL.revokeObjectURL(url); photos.value = {} }

async function load() {
  busy.value = true; error.value = ''; const current = ++generation; clearPhotos(); rows.value = []
  try {
    rows.value = await manage('/api/poi-submissions')
    if (current !== generation) return
    for (const r of rows.value) notes.value[r.id] = r.reviewNote || ''
  } catch (e) { error.value = e.message } finally { busy.value = false }
}
load()

async function showPhotos(row) {
  error.value = ''
  const current = generation
  const urls = []
  try {
    for (let i = 0; i < row.photoCount; i++) {
      const res = await fetch(`/api/poi-submissions/${row.id}/photos/${i}`, { credentials: 'same-origin' })
      if (!res.ok) throw new Error('照片读取失败')
      urls.push(URL.createObjectURL(await res.blob()))
    }
    if (current !== generation) { urls.forEach(URL.revokeObjectURL); return }
    photos.value[row.id] = urls
  } catch (e) { urls.forEach(URL.revokeObjectURL); error.value = e.message }
}

async function update(row, status) {
  busy.value = true; error.value = ''
  try {
    const saved = await manage(`/api/poi-submissions/${row.id}`, { method: 'PATCH', body: { status, reviewNote: notes.value[row.id] || '' } })
    Object.assign(row, saved)
  } catch (e) { error.value = e.message } finally { busy.value = false }
}

async function promote(row) {
  error.value = ''
  if (!targetLineId.value.trim()) { error.value = '请填写目标线路 ID（如 fanhua-shanghai）'; return }
  busy.value = true
  try {
    const { poi } = await manage('/api/manage/content/promote', { method: 'POST', body: { submissionId: row.id, lineId: targetLineId.value.trim() } })
    promoting.value = null
    await load()
    error.value = ''
    alert(`已生成草稿点位 ${poi.poiId}，请到「IP 管理」的对应城市线补全片区/重要度/时长/引文后上架。`)
  } catch (e) { error.value = e.message } finally { busy.value = false }
}

onBeforeUnmount(() => { generation++; clearPhotos() })
</script>

<template>
  <div>
    <h2 class="title">投稿审核</h2>
    <p class="hint">核对位置、照片及作品关联后标记为「待收录」；「转为路线点位」会把坐标/介绍/照片预填成草稿 POI，整理进入正式点位库后再上线。</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="busy" role="status" class="hint">处理中…</p>
    <p v-if="rows.length" class="hint">共 {{ rows.length }} 条投稿；照片按需读取。</p>

    <article v-for="row in rows" :key="row.id">
      <header><h3>{{ row.place.name }}</h3><span>{{ row.status }}</span></header>
      <p class="hint">{{ row.lineId }} · {{ row.type === 'ip' ? 'IP 点' : '其他点' }} · {{ new Date(row.createdAt).toLocaleString('zh-CN') }}</p>
      <p>{{ row.place.address }} · {{ row.place.lat }}, {{ row.place.lng }}</p>
      <p v-if="row.locationDetail">具体位置：{{ row.locationDetail }}</p>
      <p>{{ row.intro }}</p>
      <p v-if="row.tips">实用补充：{{ row.tips }}</p>
      <section v-if="row.type === 'ip'">
        <h4>作品关联</h4>
        <p>{{ row.edition }} · {{ row.relation }} · {{ row.alias }}</p>
        <p>{{ row.scene }}</p>
        <p>章节/集数：{{ row.chapter || '待查证' }}</p>
        <blockquote>{{ row.excerpt || '未提供节选，由团队查证' }}</blockquote>
        <p>来源：{{ row.source || '待查证' }}</p>
      </section>
      <button v-if="!photos[row.id]" class="btn-ghost" @click="showPhotos(row)">查看 {{ row.photoCount }} 张照片</button>
      <div class="photos"><img v-for="url in photos[row.id] || []" :key="url" :src="url" alt="投稿景点照" /></div>

      <label :for="`note-${row.id}`">审核备注</label>
      <textarea :id="`note-${row.id}`" v-model="notes[row.id]" maxlength="1000" placeholder="位置/主体人物/使用授权/IP 关联/待补资料" />

      <div class="actions">
        <button v-for="s in ['待审核', '待收录', '需补充', '不收录']" :key="s" class="btn-ghost" :disabled="busy" @click="update(row, s)">{{ s }}</button>
        <button class="btn" :disabled="busy" @click="promoting = row; targetLineId = row.lineId">转为路线点位</button>
      </div>
      <small>{{ row.id }}</small>
    </article>

    <div v-if="promoting" class="modal" @click.self="promoting = null">
      <form class="dialog" @submit.prevent="promote(promoting)">
        <h3>把「{{ promoting.place.name }}」转为路线点位草稿</h3>
        <p class="hint">坐标、介绍、照片会预填；片区 / 重要度 / 时长 / 引文需在路线管理中补全后才能上线。</p>
        <label>目标线路 ID
          <input v-model="targetLineId" required pattern="[a-z0-9][a-z0-9-]*" placeholder="如 fanhua-shanghai" />
        </label>
        <div class="row">
          <button class="btn" type="submit" :disabled="busy">{{ busy ? '处理中…' : '生成草稿点位' }}</button>
          <button class="btn-ghost" type="button" @click="promoting = null">取消</button>
        </div>
      </form>
    </div>
    <p v-if="!rows.length && !busy" class="hint">还没有投稿。</p>
  </div>
</template>

<style scoped>
.title { font-size: 20px; letter-spacing: 2px; margin-bottom: 8px; }
.hint { font-size: 12px; color: var(--ink-2); margin: 8px 0; }
.error { color: var(--brand); margin: 8px 0; }
article { background: #fff; border: 1px solid var(--line); border-radius: var(--card-radius); padding: 22px; margin: 18px 0; box-shadow: var(--shadow); }
header { display: flex; justify-content: space-between; gap: 12px; }
header h3 { font-family: serif; font-size: 20px; }
header span { color: var(--brand); font-size: 13px; }
article p { margin: 10px 0; font-size: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
section { padding: 14px; background: var(--bg); border-radius: 12px; margin: 14px 0; }
section h4 { font-size: 13px; margin-bottom: 6px; }
blockquote { white-space: pre-wrap; font-size: 13px; color: var(--ink-2); }
.photos { display: flex; gap: 10px; flex-wrap: wrap; margin: 12px 0; }
.photos img { width: 200px; max-width: 100%; height: 150px; object-fit: contain; background: var(--bg); border-radius: 8px; }
input, textarea { padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; font: inherit; background: #fff; }
textarea { width: 100%; margin: 6px 0 12px; }
label { font-size: 13px; color: var(--ink-2); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
small { display: block; font-size: 11px; color: var(--ink-2); margin-top: 14px; }
.modal { position: fixed; inset: 0; background: #0006; display: grid; place-items: center; z-index: 100; }
.dialog { background: #fff; border-radius: 16px; padding: 24px; width: min(92vw, 440px); display: grid; gap: 12px; }
.dialog h3 { font-size: 16px; }
.dialog label { display: grid; gap: 4px; }
.row { display: flex; gap: 10px; }
</style>
