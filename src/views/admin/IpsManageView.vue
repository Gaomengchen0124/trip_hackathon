<script setup>
// IP 管理：列表（内容库 + 打包）+ 草稿箱筛选 + 状态流转 + 新建 IP
// 「上架」把 IP 的所有城市线提供给公开接口 /api/content/lines（本期公网首页仍用打包数据）
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { manage, ManageError } from '../../api/manage.js'
import { lineReadiness } from '../../engine/catalog.mjs'

const router = useRouter()
const ips = ref([])
const filter = ref('all')   // all | draft | online | offline | bundled
const error = ref('')
const busy = ref(true)
const creating = ref(false)
const newIp = ref({ ipId: '', name: '', author: '', kind: 'novel', city: '' })
const actionError = ref('')

const KINDS = [['novel', '小说'], ['film', '影视'], ['poetry', '诗词'], ['history', '史传']]
const STATUS_TEXT = { draft: '草稿', online: '已上线', offline: '已下架', bundled: '线上·打包' }
const TABS = [['all', '全部'], ['draft', '草稿箱'], ['online', '已上线'], ['offline', '已下架'], ['bundled', '线上·打包']]

async function load() {
  busy.value = true; error.value = ''
  try { ips.value = (await manage('/api/manage/content/ips')).ips }
  catch (e) { error.value = e.message } finally { busy.value = false }
}
onMounted(load)

const rows = computed(() => ips.value
  .filter((ip) => filter.value === 'all' || ip.status === filter.value)
  .map((ip) => {
    const lines = Object.entries(ip.doc?.lines ?? {})
    const readinessList = lines.map(([city, line]) => lineReadiness({ ...line, ip: ip.doc.ip }))
    const onlineCount = lines.filter(([, l]) => (l.status ?? (ip.status === 'online' ? 'online' : 'draft')) === 'online').length
    return {
      ...ip,
      name: ip.doc?.ip?.name ?? ip.ipId,
      author: ip.doc?.ip?.author ?? '',
      lineCount: lines.length,
      onlineCount,
      poiTotal: readinessList.reduce((n, r) => n + r.ipTotal, 0),
      poiDone: readinessList.reduce((n, r) => n + r.ipDone, 0),
      ready: readinessList.length > 0 && readinessList.every((r) => r.ready),
    }
  }))

async function setStatus(ip, status) {
  actionError.value = ''
  try {
    await manage(`/api/manage/content/ips/${ip.ipId}/status`, { method: 'PATCH', body: { status } })
    await load()
  } catch (e) {
    actionError.value = e instanceof ManageError && e.issues
      ? `${ip.ipId} 上架前必须修复：${e.issues.slice(0, 5).map(i => `[${i.ruleId}] ${i.msg}${i.where ? `（${i.where}）` : ''}`).join('；')}${e.issues.length > 5 ? ` 等 ${e.issues.length} 条` : ''}`
      : e.message
  }
}

async function removeIp(ip) {
  if (!confirm(`确定删除草稿 IP「${ip.name}」？此操作不可恢复。`)) return
  actionError.value = ''
  try { await manage(`/api/manage/content/ips/${ip.ipId}`, { method: 'DELETE' }); await load() }
  catch (e) { actionError.value = e.message }
}

async function createIp() {
  actionError.value = ''
  const ipId = newIp.value.ipId.trim()
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(ipId)) { actionError.value = 'IP ID 只能含小写字母、数字、连字符'; return }
  const city = newIp.value.city.trim() || '主城市'
  const doc = {
    _schema: 'ip-v1',
    ip: { ipId, name: newIp.value.name.trim(), author: newIp.value.author.trim(), kind: newIp.value.kind, cover: '', aliases: [] },
    lines: {
      [city]: {
        _bounds: { lng: [73, 135], lat: [18, 54] },
        _expected: { ipStops: [6, 12], cityStops: [10, 20], maxTierS: 3 },
        line: { lineId: `${ipId}-${city}`, ipId, title: `${newIp.value.name.trim() || ipId}·${city}`, city, cover: '', recommendDays: 2 },
        clusters: [],
        ipStops: [],
        cityStops: [],
      },
    },
  }
  try {
    await manage('/api/manage/content/ips', { method: 'POST', body: { doc } })
    creating.value = false
    router.push(`/manage/ips/${ipId}/edit`)
  } catch (e) {
    actionError.value = e instanceof ManageError && e.issues
      ? `${e.message}：${e.issues.slice(0, 6).map(i => `[${i.ruleId}] ${i.msg}${i.where ? `（${i.where}）` : ''}`).join('；')}${e.issues.length > 6 ? ` 等 ${e.issues.length} 条` : ''}`
      : e.message
  }
}
</script>

<template>
  <div>
    <div class="head">
      <h2 class="title">IP 管理</h2>
      <button class="btn" @click="creating = true">＋ 新建 IP</button>
    </div>
    <p class="hint">管理单位是 IP（作品）：一个 IP 可含多条城市线。「上架」后该 IP 的所有城市线进入公开接口 <code>/api/content/lines</code>；本期公网首页仍用打包数据，接入后上架即生效。</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>
    <p v-if="busy" class="hint">加载中…</p>

    <div class="tabs">
      <button v-for="[key, label] in TABS" :key="key" :class="{ on: filter === key }" @click="filter = key">{{ label }}</button>
    </div>

    <form v-if="creating" class="create panel" @submit.prevent="createIp">
      <h3>新建 IP（创建后进入分步向导继续填写）</h3>
      <label>IP ID（小写字母/数字/连字符，如 daomu）<input v-model="newIp.ipId" required pattern="[a-z0-9][a-z0-9-]*" /></label>
      <label>作品名 *<input v-model="newIp.name" required placeholder="如：盗墓笔记" /></label>
      <label>作者<input v-model="newIp.author" /></label>
      <label>作品类型<select v-model="newIp.kind"><option v-for="[v, t] in KINDS" :key="v" :value="v">{{ t }}</option></select></label>
      <label>首个城市线（城市名）<input v-model="newIp.city" placeholder="如：杭州" /></label>
      <div class="row">
        <button class="btn" type="submit">创建草稿</button>
        <button class="btn-ghost" type="button" @click="creating = false">取消</button>
      </div>
    </form>

    <div class="table-wrap">
      <table>
        <thead><tr><th>IP</th><th>类型</th><th>城市线</th><th>状态</th><th>IP 点位完成度</th><th>更新时间</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="ip in rows" :key="ip.ipId">
            <td><b>{{ ip.name }}</b><small>{{ ip.ipId }}{{ ip.author ? ' · ' + ip.author : '' }}</small></td>
            <td>{{ { novel: '小说', film: '影视', poetry: '诗词', history: '史传' }[ip.doc?.ip?.kind] ?? '—' }}</td>
            <td>{{ ip.lineCount }} 条</td>
            <td>
              <span v-if="ip.status === 'bundled'" class="status" data-s="bundled" title="内容来自构建打包数据，正在公网运行；编辑或下架会先导入内容库">线上·打包</span>
              <span v-else class="status" :data-s="onlineCount ? 'online' : 'draft'" :title="ip.status === 'draft' && onlineCount ? '部分线路上架中' : ''">{{ ip.lineCount ? `${onlineCount}/${ip.lineCount} 线上` : STATUS_TEXT[ip.status] }}</span>
            </td>
            <td>
              <span v-if="ip.ready" class="ok">✓ 完整</span>
              <span v-else class="miss">{{ ip.poiDone }}/{{ ip.poiTotal }} 点位就绪</span>
            </td>
            <td class="time">{{ ip.updatedAt ? new Date(ip.updatedAt).toLocaleString('zh-CN') : '—' }}</td>
            <td class="ops">
              <router-link class="mini" :to="`/manage/ips/${ip.ipId}/edit`">{{ ip.status === 'bundled' ? '导入并编辑' : '编辑' }}</router-link>
              <button v-if="ip.status !== 'online'" class="mini" @click="setStatus(ip, 'online')">上架</button>
              <button v-if="ip.status === 'online'" class="mini" @click="setStatus(ip, 'offline')">下架</button>
              <button v-if="ip.status === 'draft'" class="mini danger" @click="removeIp(ip)">删除</button>
            </td>
          </tr>
          <tr v-if="!rows.length && !busy"><td colspan="7" class="hint">没有匹配的 IP。打包数据中的 IP 会显示为「打包数据」。</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.title { font-size: 20px; letter-spacing: 2px; }
.hint { color: var(--ink-2); font-size: 12px; margin-bottom: 12px; }
.error { color: var(--brand); margin-bottom: 10px; font-size: 13px; }
code { background: var(--brand-light, #f7f3ee); padding: 1px 5px; border-radius: 5px; }
.tabs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.tabs button { padding: 7px 16px; border: 1px solid var(--line); border-radius: 999px; background: #fff; font-size: 13px; }
.tabs button.on { border-color: var(--brand); color: var(--brand); font-weight: 600; }
.panel { background: #fff; border: 1px solid var(--line); border-radius: var(--card-radius); padding: 18px 20px; margin-bottom: 16px; display: grid; gap: 10px; max-width: 520px; }
.panel h3 { font-size: 15px; }
label { display: grid; gap: 4px; font-size: 13px; color: var(--ink-2); }
input, select { padding: 9px 12px; border: 1px solid var(--line); border-radius: 8px; font: inherit; font-size: 14px; background: #fff; }
.row { display: flex; gap: 10px; }
.table-wrap { overflow-x: auto; background: #fff; border: 1px solid var(--line); border-radius: var(--card-radius); box-shadow: var(--shadow); }
table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 720px; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 12px; color: var(--ink-2); background: var(--bg); white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
td b { display: block; }
td small { color: var(--ink-2); font-size: 11px; }
.status { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--bg); white-space: nowrap; }
.status[data-s='online'] { background: #e8f5e9; color: #2e7d32; }
.status[data-s='draft'] { background: #fff8e1; color: #b28704; }
.status[data-s='offline'] { background: #eee; color: #777; }
.status[data-s='bundled'] { background: #e3f2fd; color: #1565c0; }
.ok { color: #2e7d32; }
.miss { color: var(--ink-2); font-size: 12px; }
.time { white-space: nowrap; color: var(--ink-2); font-size: 12px; }
.ops { white-space: nowrap; }
.mini { font-size: 12px; color: var(--brand); text-decoration: underline; margin-right: 8px; white-space: nowrap; }
.mini.danger { color: #c0392b; }
</style>
