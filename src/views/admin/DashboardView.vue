<script setup>
// 仪表盘：社区统计 + 路线数据完整度 + 心愿需求排行 + 用户偏好分布
import { ref, computed, onMounted } from 'vue'
import { manage } from '../../api/manage.js'
import { lineReadiness } from '../../engine/catalog.mjs'

const stats = ref(null)          // auth 域：用户/评论/举报/偏好
const wishes = ref(null)         // 8787 overview
const ips = ref([])              // content 域：全部 IP + readiness
const error = ref('')
const busy = ref(true)

onMounted(async () => {
  error.value = ''
  try {
    const [s, w, c] = await Promise.allSettled([
      manage('/api/manage/stats'),
      manage('/api/wishes/overview'),
      manage('/api/manage/content/ips'),
    ])
    if (s.status === 'fulfilled') stats.value = s.value
    if (w.status === 'fulfilled') wishes.value = w.value
    if (c.status === 'fulfilled') ips.value = c.value.ips
    if (s.status === 'rejected') throw s.reason
  } catch (e) {
    error.value = e.message || '加载失败'
  } finally { busy.value = false }
})

const readinessRows = computed(() => ips.value.flatMap((ip) => Object.entries(ip.doc?.lines ?? {}).map(([city, line]) => ({
  ipId: ip.ipId,
  ipName: ip.doc?.ip?.name ?? ip.ipId,
  city,
  title: line?.line?.title ?? city,
  status: ip.status,
  readiness: line ? lineReadiness({ ...line, ip: ip.doc.ip }) : null,
}))))

const cards = computed(() => [
  { label: '注册用户', value: stats.value?.users },
  { label: '评论总数', value: stats.value?.comments },
  { label: '待处理举报', value: stats.value?.pendingReports, warn: (stats.value?.pendingReports ?? 0) > 0 },
  { label: '许愿总数', value: wishes.value?.total },
  { label: '累计赞', value: wishes.value?.likes },
])
</script>

<template>
  <div>
    <h2 class="title">仪表盘</h2>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="busy" class="hint">加载中…</p>

    <section class="cards">
      <div v-for="c in cards" :key="c.label" class="card" :class="{ warn: c.warn }">
        <b>{{ c.value ?? '—' }}</b><span>{{ c.label }}</span>
      </div>
    </section>

    <section v-if="stats && !stats.preferencesAvailable" class="panel">
      <h3>用户偏好分布</h3>
      <p class="hint">偏好表尚未接入（由推荐服务创建后自动显示）。</p>
    </section>
    <section v-else-if="stats?.preferenceStats" class="panel">
      <h3>用户偏好分布（{{ stats.preferenceStats.total }} 人设置）</h3>
      <ol class="tags">
        <li v-for="t in stats.preferenceStats.tags.slice(0, 15)" :key="t.tag">
          <span>{{ t.tag }}</span><b>{{ t.count }}</b>
        </li>
      </ol>
    </section>

    <section class="panel">
      <h3>路线数据完整度（按 IP · 城市线）</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>IP</th><th>城市线</th><th>状态</th><th>IP 点位</th><th>城市景点</th><th>就绪</th></tr></thead>
          <tbody>
            <tr v-for="r in readinessRows" :key="r.ipId + r.city">
              <td>《{{ r.ipName }}》</td>
              <td>{{ r.title }}</td>
              <td><span class="status" :data-s="r.status">{{ { draft: '草稿', online: '已上线', offline: '已下架', bundled: '线上·打包' }[r.status] ?? r.status }}</span></td>
              <td>{{ r.readiness ? `${r.readiness.ipDone}/${r.readiness.ipTotal}` : '—' }}</td>
              <td>{{ r.readiness ? `${r.readiness.spDone}/${r.readiness.spTotal}` : '—' }}</td>
              <td>
                <span v-if="r.readiness?.ready" class="ok">✓ 可上线</span>
                <span v-else class="miss">{{ r.readiness?.missing.join(' · ') ?? '—' }}</span>
              </td>
            </tr>
            <tr v-if="!readinessRows.length"><td colspan="6" class="hint">内容库还没有 IP</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.title { font-size: 20px; letter-spacing: 2px; margin-bottom: 16px; }
.error { color: var(--brand); margin-bottom: 12px; }
.hint { color: var(--ink-2); font-size: 13px; }
.cards { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 20px; }
.card { background: #fff; border: 1px solid var(--line); border-radius: var(--card-radius); padding: 14px 26px; display: grid; text-align: center; box-shadow: var(--shadow); }
.card b { font-size: 24px; color: var(--brand); font-family: serif; }
.card.warn b { color: #c0392b; }
.card span { font-size: 12px; color: var(--ink-2); }
.panel { background: #fff; border: 1px solid var(--line); border-radius: var(--card-radius); padding: 18px 20px; margin-bottom: 20px; box-shadow: var(--shadow); }
.panel h3 { font-size: 15px; margin-bottom: 12px; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--line); }
th { font-size: 12px; color: var(--ink-2); background: var(--bg); white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
.status { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--bg); }
.status[data-s='online'] { background: #e8f5e9; color: #2e7d32; }
.status[data-s='draft'] { background: #fff8e1; color: #b28704; }
.status[data-s='offline'] { background: #eee; color: #777; }
.ok { color: #2e7d32; }
.miss { color: var(--ink-2); font-size: 12px; }
.tags { list-style: none; counter-reset: n; display: grid; gap: 6px; }
.tags li { counter-increment: n; display: flex; justify-content: space-between; background: var(--bg); border-radius: 8px; padding: 8px 14px; font-size: 14px; }
.tags li::before { content: counter(n); color: var(--brand); font-weight: 600; margin-right: 10px; }
.tags li span { flex: 1; }
</style>
