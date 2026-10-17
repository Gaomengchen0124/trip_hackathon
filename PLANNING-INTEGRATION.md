# 智能规划正式页面接入

定制入口：`/customize/:lineId`。结果入口：`/itinerary/:id`，支持刷新恢复、部分行程待安排、修改预览/应用/撤销和追加建议。原 `/result/:tab` 留给旧流程兼容。

时间改为小时/分钟滚轮，支持鼠标滚动、触屏拖动、数字键、上下键、Home/End；Enter 提交。开始/结束仍是允许游览的边界。

## 本地启动

在正式工程目录运行：

```sh
npm run dev:planning
```

另一个终端：

```sh
npm run dev
```

规划服务端口8790；Vite开发和preview均将 `/api/planning`、`/api/itineraries` 代理过去。账号功能沿用原8788接口及同一 `AUTH_DATA_FILE`，收藏画像复用真实收藏，游客使用独立HttpOnly会话。

## 模型配置

本次只迁入代码，没有复制另一个项目的密钥或数据库。正式工程在根目录 `.env.local` 或 `server/.env.local` 配置：

```dotenv
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
TRIP_MCP_TOKEN=
```

已有配置不要覆盖；修改后重启 `npm run dev:planning`。缺少密钥时仍自动进入基础行程页，不伪装AI成功。携程凭据为空时只影响查询。

## 部署

这是代码整合与本地验证，没有执行线上发布。生产环境需反向代理上述路径至规划服务，设置 `PLANNING_ALLOWED_ORIGINS` 为实际前端HTTPS域名，规划和账号服务使用同一个 `AUTH_DATA_FILE`。密钥仅服务端读取，不使用VITE前缀。

## 范围与验证

未覆盖并行任务的地图、景点、图片、首页和路线介绍文件。正式定制页由同一套 `src/planning` 模块驱动，没有维护第二套问答规则。

构建使用 `vite build`，未运行图片清单生成钩子。浏览器测试验证实际Vue选点、滚轮、同源API、跳转、刷新、移动端和返回保留选点；模型优化请求在测试中被拦截，不产生付费调用。正式工程尚未配置真实模型密钥，真实AI优化需配置后验收。

最终验证：92项单元/API及浏览器测试通过；正式页面滚轮与刷新/返回恢复闭环最终复测2/2通过，Vite生产构建成功。

界面修订：关键词区使用小号淡字“你的旅行keywords”；调整区只保留宽输入框和发送箭头，餐馆入口移除，撤销/换一批为文字操作，追加仅在选择后出现。滚轮Enter会先同步当前滚动位置；回归93/93通过。
