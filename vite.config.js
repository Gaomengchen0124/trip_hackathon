import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 代理注意：'/api/manage/content' → 8789 必须排在 '/api/manage' → 8788 前面（前缀匹配顺序敏感）
const PROXY = {
  '/api/recommendations': 'http://127.0.0.1:8787', // AI 路线推荐（挂在 wishes 服务上）
  '/api/manage/content': 'http://127.0.0.1:8789',  // 内容服务（后台 IP 管理）
  '/api/manage': 'http://127.0.0.1:8788',          // 管理端用户/评论（auth 服务）
  '/api/auth': 'http://127.0.0.1:8788',
  '/api/favorites': 'http://127.0.0.1:8788',
  '/api/comments': 'http://127.0.0.1:8788',
  '/api/me': 'http://127.0.0.1:8788',
  '/api/comment-reports': 'http://127.0.0.1:8788',
  '/api/wishes': 'http://127.0.0.1:8787',
  '/api/places': 'http://127.0.0.1:8787',
  '/api/poi-submissions': 'http://127.0.0.1:8787',
  '/api/content': 'http://127.0.0.1:8789',
}

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: PROXY,
    host: true, // 局域网可访问，方便真机调试
  },
  preview: {
    port: 4173,
    proxy: PROXY,
    host: true, // 预览打包产物时同样允许局域网访问
  },
})
