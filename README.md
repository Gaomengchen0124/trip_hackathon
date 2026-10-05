# 跟着书本去旅行 · 前端骨架

> Vue 3 + Vite + vue-router + Pinia。无 UI 组件库、无地图 SDK 依赖（mock 全本地，可离线演示）。
> 业务代码只通过 `src/api/adapter.js` 取数，mock / 真实后端一键切换。

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 产物在 dist/
```

## 环境开关（.env）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `VITE_USE_MOCK` | `true` | true = 本地 mock 数据；false = 请求真实后端 |
| `VITE_API_BASE` | `/api` | 真实后端地址（改完需重启 dev server） |

## 路由表

| 路径 | 页面 | 备注 |
| --- | --- | --- |
| `/` | S1 首页 | 搜索联想 + 三栏目卡片墙 |
| `/column/:key` | S2 栏目列表 | key = city / figure / place |
| `/customize/:lineId` | S3 定制页 | S4 取舍抽屉是内部状态，非路由 |
| `/result/:tab` | S5 结果页 | tab = map / day / export；`/result` 重定向到 map |
| `/poi/:poiId` | S7 详情页 | S6 卡片浮层是结果页内部状态，非路由 |

导航守卫：无规划结果直接访问 `/result/*` 会被重定向回首页（刷新丢状态的兜底）。

## 给队友的交接

### 前端同学（地图 + 组件，同一人）

替换以下文件即可，**props/emits 契约不变，页面代码不用动**：

**组件类**
- `src/components/PoiCardOverlay.vue` —— S6 浮层（图片区 + 引文 brief + 出处 + 事件）
- `src/components/TimeBar.vue` —— S3 时间窄条
- `src/components/PoiCheckList.vue` —— S3 双栏勾选列表
- `src/views/DetailView.vue` —— S7 详情页（full 引文在这里展示）

**地图类**
- `src/components/MapContainer.vue` —— 唯一要动的地图文件，**必须保持契约**（详见该文件头注释）：
  ```js
  props:  { pois: POI[], selectedIds: string[], plan?: PlanResult, interactive: boolean }
  emits:  { 'marker-click': poiId, 'marker-hover': poiId }
  ```
  当前占位实现无 SDK 依赖（对应执行方案"四次救命降级"第 3 条），接入真实底图前所有页面都能跑。

### 后端同学

- 接口契约唯一依据：`src/api/contract.md`（数据模型 + 4 个端点的输入输出）。
- **改契约必须先改 contract.md**，再改 `adapter.js` 与 `mock/index.js`。
- 规划引擎无论在前端（本地模块）还是后端（HTTP），只要填满 `plan()` 返回的 `PlanResult` 结构，页面零改动。
- 当前 `mock/index.js` 里的 `plan()` 是假引擎（贪心切分），标了 TODO，等真引擎替换。

### 内容组

- mock 数据在 `src/api/mock/index.js`（内联，方便开发）；定稿后建议拆到 `public/data/*.json`（见该目录 README）。
- 图片放在 `public/img/`，路径与数据里的 `realPhoto` / `cover` 字段对应。
- ⚠️ 红线：引文必须逐字来自原著/剧集并标注出处，写不出来就留空，绝不编造。

## 骨架已实现 / 待接入

| 已完成（骨架） | 待队友接入 |
| --- | --- |
| 全部路由与页面跳转、S4 抽屉流程、S6 浮层流程 | 真实地图（MapContainer 替换） |
| Pinia 全局状态与导航守卫 | 真实规划引擎（plan() 替换） |
| mock 数据 + 可切换适配层 + 接口契约文档 | 卡片/详情视觉（组件替换） |
| 搜索联想、三栏目卡片墙、时间窄条、双栏勾选、日程时间轴、行程单文本导出 | 行程单图片导出（现为打印兜底） |
