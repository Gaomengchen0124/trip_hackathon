<script setup>
// 评论管理：举报队列（隐藏/忽略）+ 按对象浏览评论（删除/恢复）
import { ref, onMounted } from 'vue'
import { manage } from '../../api/manage.js'

const tab = ref('reports')
const reports = ref([])
const nextReports = ref(null)
const reportFilter = ref('pending')
const comments = ref([])
const nextComments = ref(null)
const browseKey = ref('')
const error = ref('')
const busy = ref(false)

async function loadReports(before) {
  busy.value = true; error.value = ''
  try {
    const data = await manage(`/api/manage/reports?status=${reportFilter.value}${before ? `&before=${before}` : ''}`)
    reports.value = before ? [...reports.value, ...data.reports] : data.reports
    nextReports.value = data.nextCursor
  } catch (e) { error.value = e.message } finally { busy.value = false }
}
onMounted(() => loadReports())

function switchFilter() { reports.value = []; nextReports.value = null; loadReports() }

async function resolve(r, action) {
  error.value = ''
  try {
    await manage('/api/manage/reports', { method: 'PATCH', body: { id: r.id, action } })
    reports.value = reports.value.filter((x) => x.id !== r.id)
  } catch (e) { error.value = e.message }
}

async function browse() {
  const key = browseKey.value.trim()
  if (!/^(poi|line):[a-zA-Z0-9_-]{1,100}$/.test(key)) { error.value = '对象格式：poi:<id> 或 line:<id>'; return }
  error.value = ''; busy.value = true
  comments.value = []; nextComments.value = null
  try {
    const data = await manage(`/api/comments?entityKey=${encodeURIComponent(key)}`)
    comments.value = data.comments
    nextComments.value = data.nextCursor
  } catch (e) { error.value = e.message } finally { busy.value = false }
}

async function moderate(c, action) {
  error.value = ''
  try {
    if (action === 'hide') await manage(`/api/manage/comments?id=${c.id}`, { method: 'DELETE' })
    else await manage('/api/manage/comments', { method: 'PATCH', body: { id: c.id, action: 'restore' } })
    if (action === 'hide' && tab.value === 'browse') comments.value = comments.value.filter((x) => x.id !== c.id)
  } catch (e) { error.value = e.message }
}

const fmt = (ts) => new Date(ts).toLocaleString('zh-CN')
</script>

<template>
  <div>
    <h2 class="title">评论管理</h2>
    <div class="tabs">
      <button :class="{ on: tab === 'reports' }" @click="tab = 'reports'">举报队列</button>
      <button :class="{ on: tab === 'browse' }" @click="tab = 'browse'">评论浏览</button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <template v-if="tab === 'reports'">
      <div class="filter">
        <select v-model="reportFilter" @change="switchFilter">
          <option value="pending">待处理</option>
          <option value="all">全部</option>
        </select>
        <span class="hint-inline">{{ reports.length }} 条</span>
      </div>
      <article v-for="r in reports" :key="r.id" class="report">
        <header>
          <b>#{{ r.id }} · {{ r.reason }}</b>
          <span class="status" :data-s="r.status">{{ r.status }}</span>
        </header>
        <p class="content">“{{ r.content }}”</p>
        <p class="meta">{{ r.author }} · {{ r.entityKey }} · {{ fmt(r.createdAt) }}</p>
        <div v-if="r.status === 'pending'" class="ops">
          <button class="btn-ghost danger" :disabled="busy" @click="resolve(r, 'hide')">隐藏评论</button>
          <button class="btn-ghost" :disabled="busy" @click="resolve(r, 'dismiss')">忽略</button>
        </div>
      </article>
      <p v-if="!reports.length" class="hint">没有{{ reportFilter === 'pending' ? '待处理' : '' }}举报。</p>
      <button v-if="nextReports" class="btn-ghost more" @click="loadReports(nextReports)">加载更多</button>
    </template>

    <template v-else>
      <form class="browse" @submit.prevent="browse">
        <input v-model="browseKey" placeholder="poi:sh-ip-01 或 line:fanhua-shanghai" required />
        <button class="btn" type="submit">查询</button>
      </form>
      <article v-for="c in comments" :key="c.id" class="report">
        <p class="content">“{{ c.content }}”</p>
        <p class="meta">{{ c.nickname }} · {{ c.entityKey }} · {{ fmt(c.createdAt) }}</p>
        <div class="ops"><button class="btn-ghost danger" @click="moderate(c, 'hide')">删除评论</button></div>
      </article>
      <p v-if="!comments.length && browseKey" class="hint">该对象下没有（未删除的）评论。</p>
    </template>
  </div>
</template>

<style scoped>
.title { font-size: 20px; letter-spacing: 2px; margin-bottom: 12px; }
.tabs { display: flex; gap: 8px; margin-bottom: 14px; }
.tabs button { padding: 8px 18px; border: 1px solid var(--line); border-radius: 999px; background: #fff; font-size: 14px; }
.tabs button.on { border-color: var(--brand); color: var(--brand); font-weight: 600; }
.error { color: var(--brand); margin-bottom: 10px; font-size: 14px; }
.filter { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.hint-inline { font-size: 12px; color: var(--ink-2); }
.report { background: #fff; border: 1px solid var(--line); border-radius: var(--card-radius); padding: 14px 18px; margin-bottom: 10px; box-shadow: var(--shadow); }
.report header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.status { font-size: 12px; padding: 2px 10px; border-radius: 999px; background: var(--bg); }
.status[data-s='pending'] { background: #fff8e1; color: #b28704; }
.status[data-s='hide'] { background: #ffebee; color: #c62828; }
.status[data-s='dismiss'] { background: #e8f5e9; color: #2e7d32; }
.content { font-size: 14px; margin: 6px 0; overflow-wrap: anywhere; }
.meta { font-size: 12px; color: var(--ink-2); margin-bottom: 8px; }
.ops { display: flex; gap: 8px; }
.btn-ghost.danger { color: #c0392b; }
.hint { color: var(--ink-2); font-size: 13px; padding: 14px 0; }
.more { margin-top: 8px; }
.browse { display: flex; gap: 10px; margin-bottom: 14px; }
.browse input { flex: 1; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; font: inherit; background: #fff; }
select { font: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
</style>
