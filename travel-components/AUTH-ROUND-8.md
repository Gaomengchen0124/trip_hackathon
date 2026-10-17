# 第八轮：评论列表与发布

GET /api/comments?entityKey=line:线路编号 或 poi:点位编号，匿名可读，按 ID 倒序每页 20 条，nextCursor 用于加载更多；非法分页参数拒绝。

POST /api/comments 需要真实会话及同源 Origin，字段 entityKey、content、requestId。评论 1–1000 个字符，服务端确定作者；同用户同 requestId 重试不重复发布，改变正文或对象复用编号会冲突。每用户每分钟十次、每连接 IP 每分钟三十次发布限制。数据库 v2 → v3 新增 comments 表和索引，评论与用户持久保存。

原生 demo 的路线定制页底部挂“巡礼交流”；Vue 景点详情页挂 CommentSection.vue。共用 comments.mjs 使用 textContent 渲染评论正文与昵称，输入不会作为 HTML 执行。支持空列表、加载更多、失败重试、发布等待及错误提示。未登录点发布触发登录，取消保留当前草稿；页面关闭或组件卸载取消未执行操作。草稿仅在当前组件内，不保证刷新或离开后恢复。

服务端预览 http://127.0.0.1:8001/demo.html?auth=server。旧 8000 静态演示不具备评论 API，不能用于验证评论持久化。

测试总计 29 项通过。评论新增测试覆盖重启持久化、按对象隔离、分页、重复请求、身份、匿名写入拒绝、来源校验、字数和限流。浏览器确认评论空列表、输入、触发登录、取消后草稿保留。实际邮件登录后浏览器发布仍待配置 Resend 完成后验收；HTTP 发布由测试会话验证。

下一轮：本人删除评论与服务端权限校验。回复、举报、审核和用户内容列表尚未实现；本轮不是完整社区上线版。完整 Vue 应用不在目录中，未进行其生产构建。

合并：server/auth-store.mjs、server/auth.mjs、server/preview.mjs、tests/comments.test.mjs；Vue 的 auth/comments.mjs、auth/comments.css、components/CommentSection.vue、views/DetailView.vue；代理 /api/comments 到账号服务。wish-feature 包同步了评论模块和组件。
