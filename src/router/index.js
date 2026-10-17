import { createRouter, createWebHistory } from 'vue-router'
import { usePlanStore } from '../stores/plan'
import { getAuthSession } from '../auth/session.mjs'
import { openLoginDialog } from '../auth/login-dialog.mjs'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/line/:lineId', name: 'route-intro', component: () => import('../views/RouteIntroView.vue') },
    // 旧投稿审核入口：统一后台接管（/review/points 保持可达，防止旧链接失效）
    { path: '/review/points', redirect: '/manage/submissions' },
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/column/:key', name: 'column', component: () => import('../views/ColumnListView.vue') },
    { path: '/customize/:lineId', name: 'customize', component: () => import('../views/CustomizeView.vue') },
    { path: '/result/:tab', name: 'result', component: () => import('../views/ResultView.vue') },
    { path: '/result', redirect: '/result/map' },
    { path: '/poi/:poiId', name: 'poi-detail', component: () => import('../views/DetailView.vue') },
    { path: '/wishes', name: 'wishes', component: () => import('../views/WishBoardView.vue') },
    // 管理后台。⚠️ 不能用 /admin —— 评论区（Artalk）上线后 /admin 会被 nginx 整段反代走
    {
      path: '/manage',
      component: () => import('../views/admin/AdminLayout.vue'),
      meta: { admin: true },
      children: [
        { path: '', redirect: '/manage/dashboard' },
        { path: 'dashboard', name: 'admin-dashboard', component: () => import('../views/admin/DashboardView.vue') },
        { path: 'ips', name: 'admin-ips', component: () => import('../views/admin/IpsManageView.vue') },
        { path: 'ips/:ipId/edit', name: 'admin-ip-edit', component: () => import('../views/admin/IpWizardView.vue') },
        { path: 'ips/:ipId/preview', name: 'admin-ip-preview', component: () => import('../views/admin/PreviewView.vue') },
        // 旧线路管理入口迁移到 IP 管理
        { path: 'lines', redirect: '/manage/ips' },
        { path: 'lines/:lineId/edit', redirect: (to) => `/manage/ips/${String(to.params.lineId).split('-')[0]}/edit` },
        { path: 'wishes', name: 'admin-wishes', component: () => import('../views/admin/WishesPanel.vue') },
        { path: 'submissions', name: 'admin-submissions', component: () => import('../views/admin/SubmissionsPanel.vue') },
        { path: 'users', name: 'admin-users', component: () => import('../views/admin/UsersPanel.vue') },
        { path: 'comments', name: 'admin-comments', component: () => import('../views/admin/CommentsPanel.vue') },
        { path: 'audit', name: 'admin-audit', component: () => import('../views/admin/AuditLogView.vue') },
      ],
    },
  ],
})

// 栏目页只保留了「按城市」，旧的 figure / place 直达链接回落到城市栏
const ADMIN_RETURN_KEY = 'admin-return'
getAuthSession().subscribe((state) => {
  const go = sessionStorage.getItem(ADMIN_RETURN_KEY)
  if (state.user?.role === 'admin' && go) {
    sessionStorage.removeItem(ADMIN_RETURN_KEY)
    router.push(go)
  }
})
router.beforeEach(async (to) => {
  if (to.name === 'column' && to.params.key !== 'city') {
    return { name: 'column', params: { key: 'city' } }
  }
  // 防刷新/直达丢状态：没有规划结果时不允许进结果页
  if (to.name === 'result') {
    const store = usePlanStore()
    if (!store.result) return { name: 'home' }
    if (!['map', 'day', 'export'].includes(to.params.tab)) return '/result/map'
  }
  // 管理后台守卫：必须登录且 role=admin；未登录先弹登录框再回落首页
  if (to.meta.admin) {
    const session = getAuthSession()
    await session.refresh()
    const { user } = session.getSnapshot()
    if (!user) {
      sessionStorage.setItem(ADMIN_RETURN_KEY, to.fullPath)
      openLoginDialog()
      return { name: 'home' }
    }
    if (user.role !== 'admin') return true // AdminLayout 之上的守卫：渲染无权限由页面处理
  }
  return true
})

export default router
