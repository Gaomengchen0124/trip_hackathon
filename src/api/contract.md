# 接口契约（前后端 / 引擎对接的唯一依据）

> 改契约必须先改本文档，再改 `adapter.js` 与 `mock/index.js`。
> `.env` 中 `VITE_USE_MOCK=true` 时走本地 mock，`false` 时走 `VITE_API_BASE` 指向的真实后端。

## 数据模型（与《最终执行方案》§2 一致）

```js
/**
 * @typedef {Object} IP
 * @property {string} ipId      如 'fanhua'
 * @property {string} name      作品名
 * @property {string} author    作者
 * @property {'novel'|'film'|'poetry'|'history'} kind
 * @property {string} cover     封面图路径
 * @property {string[]} aliases 搜索别名（书名、人物、地名）
 */

/**
 * @typedef {Object} Line
 * @property {string} lineId
 * @property {string} ipId
 * @property {string} title     如 '繁花·上海'
 * @property {string} city
 * @property {string} cover
 * @property {number} recommendDays
 */

/**
 * @typedef {Object} Quote
 * @property {'原著'|'台词'} kind
 * @property {string} brief   卡片显示 ~20 字
 * @property {string} full    详情页显示 ~100 字
 * @property {string} source  出处，如 '《繁花》第 X 章'
 */

/**
 * @typedef {Object} POI
 * @property {string} poiId
 * @property {string} lineId
 * @property {'ip'|'classic'} type
 * @property {string} name
 * @property {number} lng @property {number} lat
 * @property {string} cluster   片区
 * @property {'S'|'A'|'B'} [tier]   仅 ip 点
 * @property {number} durationNormal  正常时长（分钟）
 * @property {number} durationRush    快速打卡时长（分钟）
 * @property {string} intro     ≤50 字
 * @property {Quote[]} [quotes] ip 点必填
 * @property {string} realPhoto
 * @property {string} [skipNote] 被建议舍弃时给用户看的理由
 */
```

## 端点 1：搜索联想

```
search(keyword: string) → Line[]
```

匹配范围：作品名 / aliases（人物）/ 城市 / 地名（POI 名）。
真实后端建议：`GET /search?keyword=xx`

## 端点 2：首页三栏目卡片墙

```
listColumns() → { city: Column[], figure: Column[], place: Column[] }
// Column = { label: string, lines: Line[] }
```

真实后端建议：`GET /columns`

## 端点 3：路线详情（S3 进入时拉取）

```
getLineDetail(lineId: string) → { line: Line, ip: IP, pois: POI[] }
```

真实后端建议：`GET /lines/:lineId`

## 端点 4：行程规划

```
plan(params: {
  lineId: string,
  poiIds: string[],
  timeRange: { startDate: string, startSlot: '上午'|'中午'|'晚上',
               endDate: string,   endSlot: '上午'|'中午'|'晚上' },
  hoursPerDay: 6 | 8 | 10
}) → PlanResult
```

**PlanResult（⚠️ 待与引擎同学对齐，字段可议）：**

```js
{
  status: 'ok' | 'overload' | 'under70',
    // ok        装得下且时间利用率 ≥70% → 直接出结果
    // overload  装不下 → 前端弹 S4 抽屉让用户舍弃（suggestions 为舍弃建议）
    // under70   装得下但利用率 <70% → 前端弹 S4 抽屉建议追加（suggestions 为追加建议）
  days: [{
    day: number,
    items: [{ poiId: string, order: number, duration: number /*分钟*/ }]
  }],
  suggestions: [{ poiId: string, reason: string }],
  totalMin: number
}
```

真实后端建议：`POST /plan`。若引擎留在前端实现，则 adapter 中改为调用本地引擎模块，契约不变。
