# 智能推荐：运行、接口与维护

## 用户流程

首页搜索框下的智能推荐卡片进入 `/recommend`。只保留旅行灵感推荐，按指定作品找路线使用已有首页。输入包括内容类型、题材、故事氛围；“偏好补充”将作品／人物偏好与自由描述合并为一个可选文本框，并可点选已收录作品。所有兴趣均可留空。目的地为明确限制，其他标签为排序偏好。

首次进入筛选展开；推荐成功后自动折叠。精简条件栏吸顶，整条摘要可点击展开／收起；点击面板外空白区域可收起，Esc 也可收起并将焦点移回摘要按钮。手机端一行摘要；展开的表单有独立滚动范围。修改、清空和反馈不会自动发起模型请求，点击重新推荐才生效。旧结果会显示待更新提示。草稿条件与结果在当前标签页按账号保存两小时，返回和刷新可恢复；游客登录时保留当前输入。旧 by_work 缓存迁移为 discover，原作品转为可选偏好，旧结果作废，避免隐藏的作品限制。

首次登录且没有兴趣记录时出现可跳过弹窗。兴趣弹窗和推荐页带入按钮统一叫“我的兴趣”。个人中心的编辑由对应同学负责；推荐页不再提供“编辑长期兴趣”。游客兴趣存在当前浏览器。长期兴趣与本次输入分开，“我的兴趣”按钮显式带入已保存选择；本次反馈不自动改画像。

推荐结果最多三条，包括真实目录中的路线、可核对的匹配理由、代表地点、资料提示、查看路线入口。灵感模式支持更想看这类和暂不感兴趣，反馈需重新推荐后生效。只传 lineId 进入已有介绍页顶部；浏览器返回保留之前的滚动位置。日期、时长、活动和景点留给规划页。

## 启动与 Key

现有 Node 24 环境可用，未增加 npm 依赖。

1. 根目录 `.env.local` 已留好空的 `DEEPSEEK_API_KEY=`，仅在本机填写。新环境从 `.env.example` 复制，保留其他已有配置。
2. 默认 `DEEPSEEK_MODEL=deepseek-flash`、`DEEPSEEK_BASE_URL=https://api.deepseek.com`、`DEEPSEEK_TIMEOUT_MS=20000`。模型名可按账户可用模型修改。
3. `npm run dev:api`：现有 8787 服务承载推荐、许愿等接口。修改 Key 后重启该服务。
4. 按原账号说明启动 `node server/auth.mjs`，使用 8788。PowerShell 本地前端为 127.0.0.1 时，先设置 `$env:AUTH_ORIGIN='http://127.0.0.1:5178'`、`$env:AUTH_LOCAL_HTTP='1'`。原有邮箱服务配置保持不变。
5. `npm run dev -- --host 127.0.0.1 --port 5178 --strictPort`，访问 `http://127.0.0.1:5178/recommend`。端口被其他项目占用时不自动换端口或结束其他进程。

Key 只由 Node 读取，不使用 VITE_ 前缀；`.env.local` 被 Git 忽略。前端不会接触 Key。真实模型尚需填 Key 后验收；没有 Key 或上游异常会标为基础推荐，并明确自由描述未被应用。

接口采用 DeepSeek 官方 Chat Completions 与 JSON Output，模型只排序服务端候选并选择服务端给出的理由 key。返回未知路线、无效理由、重复路线、截断或错误结构都会降级，展示文案由已验证资料生成，模型不生成坐标、引文或排程。

官方参考：[首次调用](https://api-docs.deepseek.com/)、[JSON Output](https://api-docs.deepseek.com/guides/json_mode/)。

## 新增接口

`GET /api/recommendations/catalog` 返回 dictionaries（kinds/themes/moods）、works（ipId/name/kind/aliases）、cities。

`POST /api/recommendations`：

```json
{
  "mode": "discover",
  "ipId": "",
  "city": "厦门",
  "text": "喜欢悬疑故事里的反转",
  "interests": { "kinds": [], "themes": ["mystery"], "moods": [], "ipIds": [] },
  "excludedIpIds": []
}
```

当前前端固定发送 mode: discover、ipId: ""。服务端暂保留 by_work 以兼容旧客户端（其 ipId 必须是已收录作品），不再提供该模式的前端入口。city 空字符串表示不限。描述最多 500 字，各组兴趣最多 20 个。响应为 `{source,notice,items}`，source 为 ai/basic/empty。items 含现有路线字段、ip、themes、moods、reasons 文本数组、highlights、caveat、dataNotice。排除作品与目的地在调用模型前由服务端过滤。文本用于 AI 排序，目的地硬限制通过下拉选项指定，点选作品属于软偏好；基础推荐不理解自由描述。

HTTP 返回 400（输入无效）、403（来源不允许）、413（超过 12KB）、415（非 JSON）、429（每来源地址每分钟超过 12 次或全局超过 4 个并发）。上游超时最多 30 秒，前端等待 35 秒；用户切换账号或离开页面会放弃旧响应。

`GET /api/me/interests` 返回 `{profile:null}` 或 `{profile:{interests,status,updatedAt}}`。

`PUT /api/me/interests` 接收 `{interests,status}`，status 为 saved / skipped。身份来自原有 HttpOnly session cookie，忽略客户端 userId；写入沿用原账号来源检查。

## 数据与数据库交接

`data/lines/*.json` 为已有路线源；`data/recommendation-tags.json` 按现有 ipId 保存 Demo 编辑分类。字典在 `src/recommendation/options.mjs`。分类不是作品取景事实或旅行能力保证。

扩充路线后，无需修改前端；补齐分类后重启 8787 服务即可读取。缺失分类的作品仍可按作品／目的地发现，标签匹配保留未知。单条路线可用 `recommendationEnabled:false` 从推荐候选中下线。本地现有目录包含草稿资料，因此卡片展示资料仍在完善的提示，不能把进入推荐视为内容核验完成。

账号 SQLite 自动增量新增 recommendation_profiles 表：user_id（关联 users）、interests（JSON）、status、updated_at。数据库兼容原有版本 5／推荐版 6／密码登录版 7，增量升至 user_version 8，保留原有用户、密码、会话、兴趣、收藏和评论。回滚旧服务前注意旧代码会拒绝版本 8；应保留兼容迁移，不直接删除用户数据。

数据库同学后续接管时，保持上述接口形状，替换 loadRecommendationCatalog 和兴趣 store 实现即可。数据字典、标签表及 API 以这份说明和 src/api/contract.md 的引用为准。

## 验证

- `node --test tests/recommendation.test.mjs tests/recommendation-migration.test.mjs tests/auth-password.test.mjs tests/auth-server.test.mjs tests/email-favorites.test.mjs tests/comments.test.mjs tests/travel-ui.test.mjs`
- `npm run build`
- 前后端启动后 `node scripts/test-recommendation-ui.mjs`。默认 Windows Edge，可用 BROWSER_PATH 指定浏览器，用 TEST_BASE_URL 指定站点；测试截图在忽略提交的 test-output/。浏览器测试将推荐请求交给显式 apiKey 为空的本地规则实现，拦截目录和账号接口，保证不调用真实 DeepSeek 或使用本机 Key；真实身份隔离由 HTTP 测试验证。

不在测试中使用真实 Key 或发送真实登录邮件。上游成功、格式错误、失败等由可控模拟响应验证，真实 DeepSeek 联通需填 Key 后确认。
