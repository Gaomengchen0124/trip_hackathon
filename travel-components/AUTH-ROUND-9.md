# 第九轮：本人评论删除与权限

前端只给当前用户自己的评论显示“删除评论”。后端根据 Cookie 会话核对作者，不信任客户端 user_id。DELETE /api/comments?entityKey=...&id=... 隐藏本人评论；PATCH /api/comments（entityKey、id、action:restore）恢复本人评论。匿名返回 401，他人或不存在的评论统一返回 404，同源来源检查沿用原逻辑。

删除使用 deleted_at 标记，公共列表和分页均排除已删除评论。删除后显示“撤销删除”；当前页面可立即恢复，后续“我的评论”页面和更完整的回收站不在本轮。恢复仍校验当前用户归属。重复删除幂等，原发布请求重试不会重新公开被删除的评论。

数据库 v3 → v4：仅增加可空 deleted_at 列，迁移放在事务中，不清空旧表。应用本地迁移前通过 SQLite VACUUM INTO 创建 var/backups/auth-before-round9-*.sqlite 备份，权限 600；备份含用户数据且由 var/ 忽略规则保护。

32 项自动化测试通过，包括 v3 用户与评论保留、匿名/越权删除拒绝、来源校验、本人删除、重复删除、他人恢复拒绝、本人恢复、重启后隐藏状态保持。未用真实用户评论执行删除测试。当前目录缺完整 Vue 工程，未做其生产构建。

合并 server/auth-store.mjs、server/auth.mjs、tests/comments.test.mjs、auth/comments.mjs。两个交付包共享账号模块一致。预览服务已使用 scripts/start-preview.sh 重启，发信配置继续沿用。

下一轮：举报入口及发布限制进一步完善；之后个人中心接入收藏和评论，再整体联调。邮件实际送达状态与 Resend 环境配置独立，代码测试不代替真实收信验收。
