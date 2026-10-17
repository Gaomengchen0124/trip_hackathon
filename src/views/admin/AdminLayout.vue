<script setup>
// 管理后台布局：左侧导航 + 当前管理员 + 退出。
// ⚠️ 路由全部挂在 /manage/* —— /admin 被 Artalk 的 nginx 反代占用。
import { computed } from 'vue'
import { getAuthSession } from '../../auth/session.mjs'

const session = getAuthSession()
const user = computed(() => session.getSnapshot().user)
const isAdmin = computed(() => user.value?.role === 'admin')
const NAV = [
  { to: '/manage/dashboard', label: '仪表盘' },
  { to: '/manage/ips', label: 'IP 管理' },
  { to: '/manage/wishes', label: '心愿单' },
  { to: '/manage/submissions', label: '投稿审核' },
  { to: '/manage/users', label: '用户与角色' },
  { to: '/manage/comments', label: '评论管理' },
  { to: '/manage/audit', label: '操作日志' },
]
</script>

<template>
  <div class="admin-shell">
    <aside class="side">
      <router-link to="/" class="back">← 返回站点</router-link>
      <h1>管理后台</h1>
      <nav>
        <router-link v-for="item in NAV" :key="item.to" :to="item.to">{{ item.label }}</router-link>
      </nav>
      <footer v-if="user">
        <span class="who">{{ user.nickname }}</span>
        <button class="mini" @click="session.logout()">退出</button>
      </footer>
    </aside>
    <main class="main">
      <p v-if="!isAdmin" class="denied" role="alert">该账号没有管理员权限。</p>
      <router-view v-else />
    </main>
  </div>
</template>

<style scoped>
.admin-shell { display: flex; min-height: 100vh; background: var(--bg); }
.side { width: 200px; flex: none; background: #fff; border-right: 1px solid var(--line); padding: 20px 0; display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; }
.back { padding: 0 20px 14px; font-size: 13px; color: var(--ink-2); }
h1 { font-size: 18px; letter-spacing: 2px; padding: 0 20px 16px; }
nav { display: grid; }
nav a { padding: 10px 20px; font-size: 14px; color: var(--ink); border-left: 3px solid transparent; }
nav a.router-link-active { color: var(--brand); border-left-color: var(--brand); background: var(--brand-light, #f7f3ee); font-weight: 600; }
footer { margin-top: auto; padding: 16px 20px 0; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
.who { color: var(--ink-2); }
.mini { font-size: 12px; color: var(--brand); text-decoration: underline; }
.main { flex: 1; padding: 24px 28px 60px; max-width: 1080px; }
.denied { background: #fff8e1; border: 1px solid #f0d68a; color: #8a6d1a; border-radius: 12px; padding: 18px 22px; }
@media (max-width: 760px) {
  .admin-shell { flex-direction: column; }
  .side { width: 100%; height: auto; position: static; border-right: 0; border-bottom: 1px solid var(--line); }
  nav { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 12px; }
  nav a { border-left: 0; border-radius: 8px; padding: 8px 12px; }
  nav a.router-link-active { border-left-color: transparent; }
}
</style>
