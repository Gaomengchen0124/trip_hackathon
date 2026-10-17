# 第六、七轮：邮箱验证码与按用户收藏

## 当前状态

代码和本地自动化验证已完成；实际邮件送达尚未验证。缺少邮件 API Key 与验证过的发信地址，不会使用固定码替代真实发码。发送器暂采用 Resend HTTP API，无新增运行时依赖，后续可以替换发送器而不改账号与收藏接口。

## 启动与配置

在 server/.env.local 本地填写 RESEND_API_KEY、AUTH_EMAIL_FROM。AUTH_CODE_SECRET 已自动生成且不输出到聊天或日志。配置文件被 Git 忽略、权限 600。完成后重启：

```sh
node --env-file=server/.env.local server/preview.mjs
```

访问 http://127.0.0.1:8001/demo.html?auth=server。

Resend 需准备可用 API Key 和有权限发信的域名/发件地址，不能任意填个人邮箱作为发件地址。配置修改不热加载，需要重启服务。邮件和验证码不会记录在日志中。没有配置时获取验证码显示服务未配置，不签发会话。

独立 API 启动：node --env-file=server/.env.local server/auth.mjs；通过 nginx 或 Vite 同源代理 /api/auth 和 /api/favorites。AUTH_ORIGIN 必须等于浏览器实际来源。生产默认 Secure Cookie，需 HTTPS；本地 HTTP API 调试可 AUTH_LOCAL_HTTP=1。preview.mjs 仅监听本机，是开发预览服务，不作生产部署入口。

## 第六轮

POST /api/auth/email/send：规范化邮箱，随机生成六位码、HMAC 摘要保存、调用真实邮件接口。验证码五分钟有效，同邮箱六十秒冷却，每小时单邮箱六次、连接 IP 二十次；发送失败作废本次验证码。

POST /api/auth/email/verify：最多五次验证码失败，连接 IP 每分钟三十次校验限制；正确码只消费一次；匹配或建立站内用户，撤销浏览器当前旧会话，签发 HttpOnly、SameSite=Lax Cookie。代理场景目前按连接 IP 限制，应在网关补充真实来源限流，不信任任意 X-Forwarded-For。

前端真实模式接入邮箱登录、服务端用户资料、退出和刷新恢复，回到标签页时刷新会话。mode=server 不读取旧的 demo-reader 状态，不把演示昵称和图片自动归属给任何真实邮箱。

## 第七轮

数据库迁移 v1 → v2，新增 favorites、email_codes、request_limits 表；既有 users、identities、sessions 保留。迁移不接受更高版本数据库；升级前备份。

GET /api/favorites 返回当前用户的收藏键；PUT /api/favorites 传 entityKey（line:线路编号或 poi:点位编号）、saved（布尔值），幂等写入。用户 ID 来自服务端 Cookie 会话，忽略客户端身份声明。

前端路线收藏和 Vue 景点收藏接到共用模块。登录后自动继续收藏；成功回执才更新，失败显示错误。切换用户先清界面，响应按请求代次过滤，防止旧请求覆盖新用户数据；服务端数据按 user_id 隔离，刷新与重启后恢复。

旧 http://127.0.0.1:8000/demo.html 保留演示流程，其收藏仅保存在演示身份的浏览器数据中，不是多用户验证结果。真实模式使用 8001 带 auth=server 的地址。个人中心“我的收藏”列表属于第十一轮，不在本轮中。

## 检查

27 项自动测试通过，使用注入测试发信器校验真实的服务端验证码逻辑和 HTTP Cookie 登录，不发送测试邮件。包括数据库重启恢复（用户、会话、收藏）、验证码错误/过期/一次使用/次数限制、发信失败、无配置报错、用户隔离、幂等添加、取消收藏及退出拒绝请求。实际邮件送达和真实邮箱端到端登录仍待配置后验证。

当前目录缺完整 Vue 应用，没有进行 Vue 生产构建。Vue 交付需合并 auth/ 下新增 server-session.mjs、favorites.mjs 及改过的 session、登录与个人中心模块，AuthStatus.vue、FavoriteButton.vue 和服务端。wish-feature/vite.config.js 已增加收藏代理；两个交付包账号模块一致。
