# 第十至十二轮交付

## 第十轮：举报与防刷

评论列表新增举报按钮，作者看不到自己评论的举报入口。可选垃圾广告、不实信息、人身攻击、其他；未登录需先登录。POST /api/comment-reports 从会话确定举报人；同一人同一评论仅保存一次，不能举报自己，每人每小时最多十次。举报不会自动隐藏评论。

评论发布保留原用户/IP 频控，并新增同人同对象一分钟内相同正文禁止重复发布。相同 requestId 的网络重试仍幂等，不重复保存。评论草稿可在本页重新渲染时保留，不持久上传。

新增 comment_reports 表、comments.moderated_at 列，版本 v4 → v5。迁移前已以 SQLite VACUUM INTO 备份至 var/backups/auth-before-round10-12-*.sqlite，文件权限 600。原账号、收藏、评论保留。

处理举报使用受服务器文件权限保护的命令，不开放匿名管理接口：

```sh
node server/reports.mjs list
node server/reports.mjs hide 举报编号
node server/reports.mjs dismiss 举报编号
```

使用部署数据时通过 AUTH_DATA_FILE 指定同一数据库。list 输出待处理举报和评论内容，仅供有服务器权限的运营人员使用；输出不要公开发布。hide 隐藏评论并标记处理，dismiss 驳回举报；均校验待处理状态。被管理员隐藏的评论，作者不能自行恢复。当前不包含网页管理后台、申诉工作流及通知推送。

## 第十一轮：个人中心

个人中心保留原资料表单，新增“我的收藏”“我的评论”两个独立页签。收藏展示路线/景点名称，可以取消；评论展示当前用户内容，可删除或恢复自己的评论，管理员隐藏内容标明状态且不提供恢复。评论分页每页20条；未登录返回401，不接受 user_id 参数切换用户。

GET /api/me/comments 返回本人评论（包括软删除），不包含其他用户数据。公共列表继续排除已删除内容。收藏/评论名称来自站点现有点位库，未找到名称时显示通用标签，不将数据库编号当作主要文案。切换页签、关闭弹窗或更换用户会丢弃旧请求响应，避免串号展示。

## 第十二轮：联调

35 项自动化测试通过，覆盖邮箱验证码、发信适配器、会话、个人资料、头像、收藏、评论发布/分页/删除恢复、举报去重和处理、重复发布限制、权限、数据库迁移与重启恢复、401登录失效及断网错误。

HTTP测试使用临时数据库与注入的测试邮件发送器；不额外向真实邮箱发信。浏览器实际检查现有真实登录会话刷新恢复、三毛账号的资料/头像显示、收藏与评论列表空态、三个页签切换；控制台无错误。未修改现有用户内容做破坏性测试。截图 /private/tmp/book-travel-round10-12.jpg。

本地预览已更新：http://127.0.0.1:8001/demo.html?auth=server 。启动仍使用 sh scripts/start-preview.sh，保留已有 Resend 环境变量和本机证书修复。

## 部署及合并

新增 auth/profile-library.mjs、auth/entity-names.mjs，更新 auth/profile-dialog.mjs、auth/comments.mjs、auth/server-session.mjs、auth/login-dialog.css；两个交付包同名模块已同步。server/auth-store.mjs、auth.mjs、preview.mjs 更新，新增 server/reports.mjs、tests/community.test.mjs、tests/session-errors.test.mjs。Vite代理补充 /api/me 和 /api/comment-reports。

nginx 在既有 /api/auth、/api/comments、/api/favorites 代理之外，再代理 /api/me/ 和精确的 /api/comment-reports 到127.0.0.1:8788，避免拦截许愿等其他接口。

当前目录不是完整Vue应用，未执行Vue生产构建。正式服务器部署、真实邮件本轮重发验证、网页审核后台不在本次本地验收范围。完整运行配置参见 server/RESEND-SETUP.md。
