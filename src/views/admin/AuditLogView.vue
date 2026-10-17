<script setup>
// 操作日志：auth 侧与 content 侧审计并行拉取、浏览器合并排序
import { ref, computed, onMounted } from 'vue'
import { manage } from '../../api/manage.js'

const authItems = ref([])
const contentItems = ref([])
const nextAuth = ref(null)
const nextContent = ref(null)
const error = ref('')
const busy = ref(true)

async function load() {
  busy.value = true; error.value = ''
  const [a, c] = await Promise.allSettled([manage('/api/manage/audit'), manage('/api/manage/content/audit')])
  if (a.status === 'fulfilled') { authItems.value = a.value.items; nextAuth.value = a.value.nextCursor }
  if (c.status === 'fulfilled') { contentItems.value = c.value.items; nextContent.value = c.value.nextCursor }
  if (a.status === 'rejected' && c.status === 'rejected') error.value = a.reason.message
  busy.value = false
}
onMounted(load)

const ACTION_TEXT = {
  'line.create': '新建线路', 'line.publish': '上线线路', 'line.unpublish': '下架线路', 'line.draft': '转草稿',
  'line.featured': '推荐位调整', 'line.delete': '删除线路', 'poi.promote': '投稿转正',
  'user.set-role': '修改角色', 'report.hide': '隐藏被举报评论', 'report.dismiss': '忽略举报',
  'comment.hide': '删除评论', 'comment.restore': '恢复评论',
}

const merged = computed(() => [...authItems.value.map((i) => ({ ...i, source: '社区' })), ...contentItems.value.map((i) => ({ ...i, source: '内容' }))]
  .sort((a, b) => b.createdAt - a.createdAt))

const fmt = (ts) => new Date(ts).toLocaleString('zh-CN')
</script>

<template>
  <div>
    <h2 class="title">操作日志</h2>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="busy" class="hint">加载中…</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>对象</th><th>摘要</th><th>来源</th></tr></thead>
        <tbody>
          <tr v-for="i in merged" :key="i.source + i.id">
            <td class="time">{{ fmt(i.createdAt) }}</td>
            <td><code>{{ i.actor || '—' }}</code></td>
            <td>{{ ACTION_TEXT[i.action] ?? i.action }}</td>
            <td class="target">{{ i.target }}</td>
            <td class="detail">{{ i.detail || '—' }}</td>
            <td><span class="src" :data-s="i.source">{{ i.source }}</span></td>
          </tr>
          <tr v-if="!merged.length && !busy"><td colspan="6" class="hint">还没有操作记录</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.title { font-size: 20px; letter-spacing: 2px; margin-bottom: 14px; }
.error { color: var(--brand); margin-bottom: 10px; font-size: 14px; }
.hint { color: var(--ink-2); text-align: center; padding: 20px 0; font-size: 13px; }
.table-wrap { overflow-x: auto; background: #fff; border: 1px solid var(--line); border-radius: var(--card-radius); box-shadow: var(--shadow); }
table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 720px; }
th, td { padding: 9px 12px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 12px; color: var(--ink-2); background: var(--bg); white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
.time { white-space: nowrap; color: var(--ink-2); font-size: 12px; }
code { font-size: 12px; background: var(--brand-light, #f7f3ee); padding: 2px 6px; border-radius: 6px; }
.target { font-family: monospace; font-size: 12px; }
.detail { color: var(--ink-2); font-size: 12px; max-width: 280px; overflow-wrap: anywhere; }
.src { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--bg); }
.src[data-s='内容'] { background: #e3f2fd; color: #1565c0; }
.src[data-s='社区'] { background: #f3e5f5; color: #6a1b9a; }
</style>
