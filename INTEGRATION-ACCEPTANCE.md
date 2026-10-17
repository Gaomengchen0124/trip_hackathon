# 本地内容优先的整合验收

整合基线：GitHub main `b085373`。分支：`integration/local-planning`。原正式工程与内容工作区未覆盖；改动在本目录，未推送、未部署。

## 保留与合并

- 路线、点位 ID、图片、门票资料以父目录当前内容工作区为准。相邻旧正式工程的点位编号存在差异，未以其旧数据覆盖当前内容。
- 保留本地对话式需求、时间滚轮、hybrid.v1 排程、AI 优化、部分行程、必去保护、修改预览、应用、撤销、追加、门票和结果页刷新恢复。
- 保留本地地图、详情卡片、景点选择卡片和夏洛克适配；补齐夏洛克推荐分类。
- 合入最新版首页推荐、兴趣引导、密码登录、管理后台与许愿墙；介绍页同时保留推荐返回与收藏星标。
- 账号与规划服务共用新版版本 8 的 auth-store 和同一 AUTH_DATA_FILE；路线收藏不混入景点收藏画像。
- 合并 package scripts、路由、代理、忽略规则；新增可复现的正式页面生产构建浏览器测试。

## 启动

在本目录运行：

```sh
npm ci --ignore-scripts
npm run dev:all
```

地址：`http://127.0.0.1:5180/`。规划入口示例：`/customize/fanhua-shanghai`、`/customize/sherlock-london`。

一键本地预览使用独立端口，避免影响用户已经运行的旧服务：推荐/许愿 18887，账号 18888，内容 18889，规划 18790，Vite 5180。代理读取对应环境变量。可用 WEB_PORT、INTEGRATED_WISH_PORT、INTEGRATED_AUTH_PORT、INTEGRATED_CONTENT_PORT、INTEGRATED_PLANNING_PORT 调整。

单独启动各服务时沿用原默认端口，规划单独默认改为 8790，内容仍为 8789，避免冲突。`npm run dev:content` 已改用 sh 执行原 shell 脚本。

已有模型/携程本地配置已在忽略提交的 .env.local 中复用，未输出密钥。运行数据使用本目录 var，不复制原用户数据库。账号数据默认独立，因此旧工程的登录账号不会自动出现在这里。

## 验证结果

- `node --test tests/*.test.mjs`：149/149。
- 规划界面浏览器回归五个文件：13/13，覆盖时间滚轮、自由文本、生成进度、失败自动降级、无密钥、部分行程保留、冲突重新核算、行内修改和门票查询状态。
- `npm run test:planning:browser`：2/2。真实生产构建页面与真实本地规划 API，模型和门票响应为合成测试数据。覆盖推荐 → 介绍 → 选点日期 → 排程与 AI 优化 → 追加预览/应用/撤销 → 自然语言修改/取消/应用/撤销 → 刷新恢复 → 门票查询；还验证详情跳转、返回选点、移动端无横向溢出和游客行程隔离。
- 生产构建成功；全线路数据校验合计 0 错误，保留资料与片区相关警告；git diff whitespace 检查通过。
- 配置状态接口确认 configured=true、tripConfigured=true，完整 intake/generate/validation/revisions/additions/commits/undo/trip_queries 已实现。

日志保存在父目录 `docs/integration/2026-10-17/`：merged-tests.log、merged-formal-flow.log、merged-planning-browser.log、merged-data-check.log。先前失败日志是定位过程，最终以上述通过记录为准。

## 真实模型验收与边界

一次真实 AI 生成命令被自动审批拦截，原因是使用现有凭据向外部模型服务发送规划输入需要用户明确批准。本次没有绕过拒绝，也没有成功发出该请求；模型真实连通性尚未验收，不能以模拟测试通过替代。

用户批准后可运行：`PLANNING_CHECK_BASE=http://127.0.0.1:5180 node scripts/check-planning.mjs --generate`。该脚本发送测试行程需求、轮询任务并验证保存结果，日志不输出凭据。

当前交通是距离估算，开放时间仍为资料未核验状态，前端保留参考说明。后台动态发布与各模块打包目录的统一读取属于原有架构待完善项，本次未重写内容源；本地已整合线路的推荐与规划均读取同一套打包 JSON。
