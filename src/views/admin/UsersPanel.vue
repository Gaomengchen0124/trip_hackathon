<script setup>
// 用户与角色：列表（含偏好标签只读）、admin 角色切换。
import { ref, onMounted } from 'vue'
import { manage } from '../../api/manage.js'

const users = ref([])
const nextCursor = ref(null)
const prefsAvailable = ref(true)
const error = ref('')
const busy = ref(true)
const pwTarget = ref(null)      // 正在设置密码的用户
const pwValue = ref('')
const pwBusy = ref(false)

async function load(before) {
  busy.value = true; error.value = ''
  try {
    const data = await manage(`/api/manage/users${before ? `?before=${before}` : ''}`)
    users.value = before ? [...users.value, ...data.users] : data.users
    nextCursor.value = data.nextCursor
    prefsAvailable.value = data.preferencesAvailable
  } catch (e) { error.value = e.message } finally { busy.value = false }
}
onMounted(() => load())

async function setRole(user, role) {
  error.value = ''
  try {
    const { user: updated } = await manage('/api/manage/users', { method: 'PATCH', body: { id: user.id, role } })
    user.role = updated.role
  } catch (e) { error.value = e.message; user.role = user.role === 'admin' ? 'user' : 'admin' }
}

async function setPassword() {
  if (!pwTarget.value || pwBusy.value) return
  error.value = ''
  if (pwValue.value.length < 8) { error.value = '密码长度需为 8-128 位'; return }
  pwBusy.value = true
  try {
    await manage('/api/manage/users/password', { method: 'POST', body: { id: pwTarget.value.id, password: pwValue.value } })
    pwTarget.value = null; pwValue.value = ''
  } catch (e) { error.value = e.message } finally { pwBusy.value = false }
}

function fmtTime(ts) { return ts ? new Date(ts).toLocaleString('zh-CN') : '—' }
</script>

<template>
  <div>
    <h2 class="title">用户与角色</h2>
    <p class="hint">admin 可进入本后台；不能修改自己的角色，且至少保留一名管理员。</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="busy" class="hint">加载中…</p>

    <div class="table-wrap">
      <table>
        <thead><tr><th>昵称</th><th>邮箱</th><th>角色</th><th>偏好</th><th>评论数</th><th>注册时间</th></tr></thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.nickname }}</td>
            <td><code>{{ u.email ?? '—' }}</code></td>
            <td>
              <select :value="u.role" @change="setRole(u, $event.target.value)">
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
              <button class="mini" @click="pwTarget = u; pwValue = ''">设密码</button>
            </td>
            <td>
              <span v-if="!prefsAvailable" class="hint-cell">未接入</span>
              <template v-else-if="u.preferences?.length"><span v-for="t in u.preferences" :key="t" class="tag">{{ t }}</span></template>
              <span v-else class="hint-cell">—</span>
            </td>
            <td>{{ u.commentCount }}</td>
            <td class="time">{{ fmtTime(u.createdAt) }}</td>
          </tr>
          <tr v-if="!users.length && !busy"><td colspan="6" class="hint">还没有用户</td></tr>
        </tbody>
      </table>
    </div>
    <button v-if="nextCursor" class="btn-ghost more" :disabled="busy" @click="load(nextCursor)">加载更多</button>

    <div v-if="pwTarget" class="modal" @click.self="pwTarget = null">
      <form class="dialog" @submit.prevent="setPassword">
        <h3>为「{{ pwTarget.nickname }}」设置登录密码</h3>
        <p class="hint">设置后该用户可用邮箱 + 密码直接登录；重复设置会覆盖旧密码。</p>
        <input v-model="pwValue" type="password" minlength="8" maxlength="128" placeholder="8-128 位新密码" required autofocus />
        <div class="row">
          <button class="btn" type="submit" :disabled="pwBusy">{{ pwBusy ? '保存中…' : '保存' }}</button>
          <button class="btn-ghost" type="button" @click="pwTarget = null">取消</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.title { font-size: 20px; letter-spacing: 2px; margin-bottom: 8px; }
.hint { color: var(--ink-2); font-size: 12px; margin-bottom: 12px; }
.error { color: var(--brand); margin-bottom: 10px; font-size: 14px; }
.table-wrap { overflow-x: auto; background: #fff; border: 1px solid var(--line); border-radius: var(--card-radius); box-shadow: var(--shadow); }
table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 640px; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 12px; color: var(--ink-2); background: var(--bg); white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
code { font-size: 12px; background: var(--brand-light, #f7f3ee); padding: 2px 6px; border-radius: 6px; }
select { font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
.tag { display: inline-block; font-size: 11px; background: var(--brand-light, #f7f3ee); border-radius: 999px; padding: 2px 8px; margin: 0 4px 4px 0; }
.hint-cell { color: var(--ink-2); font-size: 12px; }
.time { white-space: nowrap; color: var(--ink-2); font-size: 12px; }
.more { margin-top: 12px; }
.modal { position: fixed; inset: 0; background: #0006; display: grid; place-items: center; z-index: 100; }
.dialog { background: #fff; border-radius: 16px; padding: 24px; width: min(92vw, 400px); display: grid; gap: 12px; }
.dialog h3 { font-size: 16px; }
.dialog input { padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; font: inherit; }
.row { display: flex; gap: 10px; }
</style>
