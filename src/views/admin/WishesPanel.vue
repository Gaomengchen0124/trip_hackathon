<script setup>
// 心愿单审核：需求排行 / 许愿明细（改状态、复制邮箱）/ CSV 导出。
// 鉴权 = 管理员 cookie 会话（原 ManageWishesView 的密钥登录已随统一后台移除）。
// 注意：export 数据含用户邮箱，仅限团队使用，勿外传。
import { computed, ref, onMounted } from 'vue'
import { manage } from '../../api/manage.js'

const rows = ref([])
const summary = ref([])
const overview = ref(null)
const error = ref('')
const busy = ref(false)

const STATUSES = ['待整理', '筹备中', '已收录', '已拒绝']

async function load() {
  busy.value = true; error.value = ''
  try {
    const [e, s, o] = await Promise.all([
      manage('/api/wishes/export'),
      manage('/api/wishes/summary'),
      manage('/api/wishes/overview'),
    ])
    rows.value = e.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    summary.value = s
    overview.value = o
  } catch (e) { error.value = e.message } finally { busy.value = false }
}
onMounted(load)

async function setStatus(row, status) {
  if (row._busy || row.status === status) return
  row._busy = true
  try {
    await manage(`/api/wishes/${row.id}/status`, { method: 'PATCH', body: { status } })
    row.status = status
  } catch { error.value = '状态保存失败，请重试' } finally { row._busy = false }
}

async function copyEmail(email) {
  if (!email) return
  try { await navigator.clipboard.writeText(email); error.value = '' } catch { error.value = '复制失败，请手动选择复制' }
}

function csvCell(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
function exportCsv() {
  const head = ['愿望编号', '作品', '城市', '打卡点', '想重温的一幕', '巡礼方式', '补充线索', '邮箱', '状态', '赞数', '提交时间']
  const lines = [head.join(',')].concat(rows.value.map((r) => [
    r.id, r.ip, r.city || '城市待定', r.points.join(' / '), r.scene, r.styles.join(' / '), r.clues,
    r.notify ? r.email : '', r.status, r.likes, r.createdAt,
  ].map(csvCell).join(',')))
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `wishes-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

const totalLikes = computed(() => rows.value.reduce((n, r) => n + (r.likes || 0), 0))
</script>

<template>
  <div>
    <div class="head">
      <h2 class="title">心愿单</h2>
      <button class="btn csv" @click="exportCsv">导出 CSV</button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }} <button class="retry" @click="load">重试</button></p>
    <p v-if="busy" class="hint">加载中…</p>

    <template v-if="!busy && rows.length">
      <section class="stats">
        <div><b>{{ overview?.total ?? rows.length }}</b><span>许愿总数</span></div>
        <div><b>{{ summary.length }}</b><span>作品×城市</span></div>
        <div><b>{{ totalLikes }}</b><span>累计赞</span></div>
        <div v-for="(n, s) in overview?.byStatus ?? {}" :key="s"><b>{{ n }}</b><span>{{ s }}</span></div>
      </section>

      <section class="panel">
        <h3>需求排行</h3>
        <ol class="summary">
          <li v-for="s in summary" :key="s.ip + s.city"><span>《{{ s.ip }}》{{ s.city }}</span><b>{{ s.count }} 人</b></li>
        </ol>
      </section>

      <section class="panel">
        <h3>许愿明细</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>作品</th><th>城市</th><th>点位 / 场景</th><th>邮箱</th><th>时间</th><th>状态</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.id">
                <td class="ip">《{{ r.ip }}》</td>
                <td>{{ r.city || '城市待定' }}</td>
                <td class="detail-cell">
                  <span v-if="r.points.length" class="cell-pts">{{ r.points.join(' / ') }}</span>
                  <span v-if="r.scene" class="cell-scene">“{{ r.scene }}”</span>
                </td>
                <td>
                  <template v-if="r.notify && r.email">
                    <code>{{ r.email }}</code>
                    <button class="mini" @click="copyEmail(r.email)">复制</button>
                  </template>
                  <template v-else>—</template>
                </td>
                <td class="time">{{ r.createdAt.slice(0, 10) }}</td>
                <td>
                  <select :value="r.status" :disabled="r._busy" @change="setStatus(r, $event.target.value)">
                    <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
    <p v-else-if="!busy" class="hint">还没有许愿数据</p>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.title { font-size: 20px; letter-spacing: 2px; }
.error { color: var(--brand); font-size: 14px; margin-bottom: 10px; }
.retry { text-decoration: underline; margin-left: 6px; }
.hint { color: var(--ink-2); text-align: center; padding: 24px 0; }
.stats { display: flex; gap: 14px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.stats div { background: #fff; border: 1px solid var(--line); border-radius: var(--card-radius); padding: 12px 22px; display: grid; text-align: center; box-shadow: var(--shadow); }
.stats b { font-size: 22px; color: var(--brand); font-family: serif; }
.stats span { font-size: 12px; color: var(--ink-2); }
.csv { padding: 8px 20px; font-size: 14px; }
.panel { background: #fff; border: 1px solid var(--line); border-radius: var(--card-radius); padding: 18px 20px; margin-bottom: 18px; box-shadow: var(--shadow); }
.panel h3 { font-size: 15px; margin-bottom: 12px; }
.summary { list-style: none; counter-reset: n; display: grid; gap: 6px; }
.summary li { counter-increment: n; display: flex; justify-content: space-between; background: var(--bg); border-radius: 8px; padding: 8px 14px; font-size: 14px; }
.summary li::before { content: counter(n); color: var(--brand); font-weight: 600; margin-right: 10px; }
.summary li span { flex: 1; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 720px; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 12px; color: var(--ink-2); background: var(--bg); white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
.ip { font-family: serif; white-space: nowrap; }
.detail-cell { max-width: 280px; }
.cell-pts { display: block; }
.cell-scene { display: block; color: var(--ink-2); font-size: 12px; margin-top: 2px; }
code { font-size: 12px; background: var(--brand-light, #f7f3ee); padding: 2px 6px; border-radius: 6px; }
.mini { font-size: 12px; color: var(--brand); margin-left: 6px; text-decoration: underline; white-space: nowrap; }
.time { white-space: nowrap; color: var(--ink-2); }
select { font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
</style>
