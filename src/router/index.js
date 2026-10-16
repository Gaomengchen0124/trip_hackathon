import { createRouter, createWebHistory } from 'vue-router'
import { usePlanStore } from '../stores/plan'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.name === 'route-intro') return { left: 0, top: 0 }
  },
  routes: [
    { path: '/recommend', name: 'recommend', component: () => import('../views/RecommendationView.vue') },
    { path: '/line/:lineId', name: 'route-intro', component: () => import('../views/RouteIntroView.vue') },
    { path: '/review/points', name: 'submission-review', component: () => import('../views/SubmissionReviewView.vue') },
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/column/:key', name: 'column', component: () => import('../views/ColumnListView.vue') },
    { path: '/customize/:lineId', name: 'customize', component: () => import('../views/CustomizeView.vue') },
    { path: '/result/:tab', name: 'result', component: () => import('../views/ResultView.vue') },
    { path: '/result', redirect: '/result/map' },
    { path: '/poi/:poiId', name: 'poi-detail', component: () => import('../views/DetailView.vue') },
  ],
})

// 栏目页只保留了「按城市」，旧的 figure / place 直达链接回落到城市栏
router.beforeEach((to) => {
  if (to.name === 'column' && to.params.key !== 'city') {
    return { name: 'column', params: { key: 'city' } }
  }
  // 防刷新/直达丢状态：没有规划结果时不允许进结果页
  if (to.name === 'result') {
    const store = usePlanStore()
    if (!store.result) return { name: 'home' }
    if (!['map', 'day', 'export'].includes(to.params.tab)) return '/result/map'
  }
  return true
})

export default router
