# 账号体系 · 第一轮

本轮提供前端演示账号，不代表真实身份验证。没有采集手机号、邮箱或第三方凭据。

## 本地验收

从项目根目录用静态 HTTP 服务打开 `/demo.html`（例如 `python3 -m http.server 8000` 后访问 http://localhost:8000/demo.html）。不要使用 file://，页面依赖模块与数据请求。

1. 初次访问显示“游客 · 未登录”。
2. 点击“体验登录（演示）”，显示“巡礼体验官 · 演示账号已登录”。
3. 刷新页面，七天内恢复同一个演示用户。
4. 同源另开一个标签页，登录和退出在标签页之间同步。
5. 退出后刷新，保持游客状态。

存储不可用时仍可体验当前页面登录，并显示提示。所有演示用户共用固定的 demo-reader 标识，仅限演示，不可用来隔离真实用户数据。七天期限在重新加载时校验，不是服务端会话有效期。

## Vue 工程合并

本目录是增量交付包，没有 package.json，不能单独运行 Vite 构建。将以下文件按相同相对路径合并至完整 Vue 工程：

- src/auth/session.mjs、src/auth/session.d.mts
- src/components/AuthStatus.vue
- HomeView.vue 的 AuthStatus 导入与模板入口两处改动

若首页已集成许愿功能，以 wish-feature/src/views/HomeView.vue 为参考；wish-feature 内也附有相同的账号组件和模块，两包合并时保留一份即可。不要用旧首页覆盖队友的新改动。

本轮没有重新生成 travel-components/changes.patch 和 manifest.json；它们描述此前的组件交付。请按本说明手工合并本轮增量。生产项目应在接入真实登录后移除演示入口。

任意 Vue 页面均可用 getAuthSession() 订阅同一账号状态；组件卸载时调用 subscribe 返回的取消订阅函数。User 类型包含 id、nickname、avatar、provider，AuthState 包含 user、isLoggedIn、mode、notice。未来真实登录应由后端会话确认身份，禁止信任此 localStorage 内容作为发布权限依据。

## 自动检查

在当前工作目录执行：

```sh
node --test travel-components/tests/auth-session.test.mjs travel-components/tests/travel-ui.test.mjs
```

覆盖恢复、退出、无效及过期存储、存储不可用、跨标签页同步和取消订阅。当前环境没有完整 Vue 应用与构建依赖，尚未进行 Vue 生产构建或浏览器视觉验收。

## 下一轮

登录弹窗、手机号／邮箱切换、验证码表单、倒计时和错误状态；验证码服务接入留到真实登录轮次。
