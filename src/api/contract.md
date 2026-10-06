# 接口契约（前后端 / 引擎对接的唯一依据）

> 改契约必须先改本文档，再改 `adapter.js` 与 `mock/index.js`。
> `.env` 中 `VITE_USE_MOCK=true` 时走本地 mock（直连真引擎），`false` 时走 `VITE_API_BASE` 指向的真实后端。
>
> **数据源**：`data/lines/*.json`（内容组生产源，`data/validate.mjs` 把关）。
> mock 层直接 `import.meta.glob` 这些文件，所以改完 JSON 刷新页面就生效，不用重新生成。

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
 * @property {'原著'|'台词'} kind   只有这两个值，不要自创
 * @property {string} brief   卡片显示 ~20 字
 * @property {string} full    详情页显示 80-120 字
 * @property {string} source  出处，必须具体到章 / 集
 */

/**
 * @typedef {Object} POI
 * @property {string} poiId
 * @property {string} lineId
 * @property {'ip'|'classic'} type
 * @property {string} name
 * @property {number} lng @property {number} lat
 * @property {string} cluster     片区，从该条线的 clusters 里选
 * @property {'S'|'A'|'B'} [tier] 仅 ip 点；S 全线路最多 3 个
 * @property {number} popularity  仅 classic 点，1-5，前端按它排序
 * @property {number} durationNormal  正常时长（分钟）
 * @property {number} durationRush    快速打卡时长（分钟）
 * @property {string} intro    ≤50 字
 * @property {Quote[]} [quotes] ip 点必填
 * @property {string} realPhoto    写 'img/xxx.jpg'，文件放 public/img/
 * @property {string} [skipNote]   被建议舍弃时给用户看的理由
 */
```

---

## 端点 1：搜索联想

```
search(keyword: string) → Line[]
```

匹配范围：线路名 / aliases（人物）/ 城市 / 地名 / POI 名。命中不了返回 `[]`，
页面显示「抱歉，暂时未收录该圣地巡礼内容」。

真实后端建议：`GET /search?keyword=xx`

---

## 端点 2：首页三栏目卡片墙

```
listColumns() → { city: Column[], figure: Column[], place: Column[] }
// Column = { label: string, lines: Line[] }
```

**一条线在每个栏目里最多出现一次**，命中的多个标签合成 `label`（如「阿宝 / 汪小姐 / 玲子 / 李李」），
不要拆成多个 Column，否则首页会出现好几张一模一样的卡片。

真实后端建议：`GET /columns`

---

## 端点 3：路线详情（S3 进入时拉取）

```
getLineDetail(lineId: string) → { line: Line, ip: IP, pois: POI[] }
```

`pois` = 该线全部候选点（ip 点 + classic 点）。页面用 `p.type` 分左右两栏：
左栏按 `tier`（S→A→B）排，右栏按 `popularity` 降序排。

真实后端建议：`GET /lines/:lineId`

---

## 端点 4：行程规划

```
plan(params: {
  lineId: string,
  poiIds: string[],              // 用户勾选的点；S4 抽屉协商后重新提交时传"最终保留"的列表
  timeRange: { startDate: string, startSlot: '上午'|'中午'|'晚上',
               endDate: string,   endSlot: '上午'|'中午'|'晚上' },
  hoursPerDay: 6 | 8 | 10,
  protectedIds?: string[]        // 可选：用户在抽屉里明确"要保留"的点
}) → PlanResult
```

**PlanResult：**

```js
{
  // ---------- 状态 ----------
  status: 'ok' | 'overload' | 'under70',
    // ok        排得下且利用率 ≥70%  → 直接出结果
    // overload  压缩档也排不下       → 弹 S4 抽屉，suggestions 是舍弃建议
    // under70   排得下但利用率 <70%  → 弹 S4 抽屉，suggestions 是追加建议
    // ⚠️ 判定顺序：overload 优先。under70 时 days 仍然有值，用户可以先看行程再决定加不加点

  message: string | null,        // 直接可显示的人话，如"还差约 3.2 小时排不下，请放弃部分景点"
  impossible: boolean,           // true = 全压缩也走不完，文案要换成"请减少景点或增加天数"
  daysNeeded: number,            // 这个行程需要几天。提交前就能提示"该行程需 4 天 ⚠️"

  // ---------- 时间账 ----------
  totalMin: number,              // 已用分钟
  totalAvailableMin: number,     // 总可用分钟（日期区间 + 时段 + 每天时长折算出来的）
  usage: number,                 // 0-1，totalMin / totalAvailableMin
  shortage: number,              // 超载多少分钟；没超载是 0

  // ---------- 档位 ----------
  compressed: boolean,           // 有没有做过"正常档 → 压缩档"降级
  degraded: string[],            // 被降级的 poiId 列表

  // ---------- 行程 ----------
  days: [{
    day: number,                 // 1, 2, 3...
    date: 'YYYY-MM-DD',
    availableMin: number,        // 这天可用多少分钟
    usedMin: number,             // 用掉多少
    idleMin: number,             // 空闲多少
    items: [{
      poiId: string,
      order: number,             // 这天里的第几个，地图上标 D1-1 / D1-2
      duration: number,          // 停留分钟
      arrive: 'HH:MM',           // 到达时间
      leave: 'HH:MM',            // 离开时间
      legMinutes: number,        // 从上一点过来花了多久
      mode: 'normal' | 'rush',   // 压缩档的标记
    }],
  }],

  // ---------- 取舍建议 ----------
  suggestions: [{
    poiId: string,
    name: string,
    reason: string,              // 「它单独在「密云·古北水镇」，往返约 2.1 小时，放弃能省 2.8 小时。」
    kind: 'drop' | 'add',
    mustDrop: boolean,           // drop 专用：不砍它凑不够时间 → 抽屉里置灰不可取消
    savesMinutes: number,        // drop 专用：放弃能省多少（含孤点往返）
    addsMinutes: number,         // add 专用：加上要多花多少
    isolated: boolean,           // drop 专用：是不是单独在一个片区的孤点
    fits: boolean,               // add 专用：剩下的时间装不装得下
  }],
}
```

**S4 抽屉的正确用法**：用户在里面调整取舍 → 把"最终保留的 poiIds"重新 `plan()` 一次 →
`status` 变成 `ok` / `under70` 才允许进结果页。引擎是纯函数，重算没有副作用。
`mustDrop` 的点如果没被砍掉、余额还是负的，确认按钮要保持禁用。

**若引擎留在前端实现**，adapter 里改为 `import { runPlan } from '../engine/plan-result.mjs'`，契约不变。
真实后端建议：`POST /plan`。

---

## 引擎规则（`src/engine/planner.mjs`，无 AI，可解释）

| 情况 | 系统怎么反应 |
| --- | --- |
| 全按正常时长排得下 | 直接出行程 |
| 排不下 | 按重要度 B → A → S 逐个改压缩档，改到装得下为止 |
| 压缩也装不下 | `overload` + 舍弃清单，按性价比排序，每条带算术理由 |
| 用掉 < 70% | `under70` + 追加建议，顺路的排前面 |
| 全压缩都装不下 | `impossible: true`，提示减少景点或增加天数 |

远郊点位（迪士尼、朱家角、环球影城、古北水镇、富士山）单独成片区，
砍掉它们能省一整个往返，所以会被优先建议放弃——这是取舍抽屉最好看的一幕。
