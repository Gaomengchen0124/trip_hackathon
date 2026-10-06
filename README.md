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
- **规划引擎已经接上了**：`src/api/mock/index.js` 的 `plan()` 直接调 `src/engine/plan-result.mjs`。
  引擎无论留前端（本地模块）还是挪后端（HTTP），只要返回同一个 `PlanResult`，页面零改动。
- 内容源是 `data/lines/*.json`，改完刷新页面就生效（mock 用 `import.meta.glob` 直接读）。

### 内容组

- **生产源是 `data/lines/*.json`**（每个城市一条线）。`src/api/mock/index.js` 只是读它 + 转形状，不要往里写内容。
- 照 `data/填写模板.md` 填；字段含义见 `data/字段规范.md`。
- 填完跑 `npm run data:check`，退出码 0 才算过关。
- 图片放 `public/img/`，数据里写 `img/xxx.jpg`，文件名 = poiId。
- ⚠️ 红线：引文必须逐字来自原著/剧集并标注出处，写不出来就留空，绝不编造。

## 骨架已实现 / 待接入

| 已完成（骨架） | 待队友接入 |
| --- | --- |
| 全部路由与页面跳转、S4 抽屉流程、S6 浮层流程 | 真实地图（MapContainer 替换） |
| Pinia 全局状态与导航守卫 | 卡片/详情视觉（组件替换） |
| mock 数据 + 可切换适配层 + 接口契约文档 | 真实后端（可选） |
| 搜索联想、三栏目卡片墙、时间窄条、双栏勾选、日程时间轴、行程单文本导出 | 行程单图片导出（现为打印兜底） |
| **行程规划引擎（已接入，非假算法）** | — |

---

## 内容与引擎

引擎是纯 ESM、零依赖，前端直接 import，不需要后端。

```
data/
  gen-template.mjs        生成点位库空模板 + 首页目录（npm run data:gen）
  validate.mjs            校验器，24 条规则（npm run data:check）
  lines/
    index.json            首页目录（生成物，不要手改）
    fanhua-shanghai.json  《繁花》·上海   ← 主推
    longzu-beijing.json   龙族·北京
    longzu-japan.json     龙族·日本
  填写模板.md  /  字段规范.md  /  候选点位.md

src/engine/
  planner.mjs             行程规划算法（片区聚类 / 时段折算 / 穷举排序 / 孤点效应 / 压缩降级）
  catalog.mjs             首页数据层（三栏分组 / 搜索 / 就绪度）
  plan-result.mjs         引擎输出 → PlanResult（契约）
  demo.mjs                引擎自测，7 个场景（npm run engine:test）
  demo-home.mjs           首页数据层演示 + 自检（npm run engine:home）
```

### 引擎的规则（不用 AI，可解释）

| 情况 | 系统怎么反应 |
| --- | --- |
| 全按正常时长排得下 | 直接出行程 |
| 排不下 | 按重要度 B → A → S 逐个改压缩档，改到装得下为止 |
| 压缩也装不下 | 出舍弃清单，按性价比排序，每条带算术理由 |
| 用掉 < 70% | 出追加建议，顺路的排前面 |
| 全压缩都装不下 | 提示"减少景点或增加天数" |

远郊点位（迪士尼、朱家角）单独成片区，砍掉它们省一整个往返，所以会被优先建议放弃——
这是 S4 取舍抽屉最好看的一幕。
