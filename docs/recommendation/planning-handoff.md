# 智能推荐与规划模块对接：字段和文档

2026-10-16，根据本地 main（4ccca27）的接口、调用代码和数据文件核对。本文替代上一版复杂草稿方案；推荐功能已实现；规划接口按当前版本沿用，后续以规划同学的变更为准。

## 1 推荐模块需要交给规划模块什么

首版只需要用户选中的 **lineId**。推荐结果进入现有 `/line/:lineId`，用户点击“定制行程”进入 `/customize/:lineId`；已有页面已支持这条路径。

| 字段 | 是否需要传 | 说明 |
| --- | --- | --- |
| lineId | 必需 | 已有路线 ID，例如 kaiduan-xiamen |
| timeRange | 不传 | 用户已确认统一在规划页填写 |
| hoursPerDay | 不传 | 用户已确认统一在规划页填写 |

首版跳转示例：`/line/kaiduan-xiamen?from=recommend`。from 仅用于展示返回推荐筛选的导航，不进入 plan 请求；路线页刷新后也可返回已有推荐条件与结果。不需要新增推荐专用规划接口或草稿系统。

ipId、路线标题、封面和候选景点可由 getLineDetail(lineId) 获取，无需重复传递。推荐方不生成 poiIds；Citywalk、购物等活动偏好和景点选择由规划方负责。长期内容兴趣留在推荐模块。

只有“玩两天”不能直接当作具体日期，recommendDays 也只是路线建议天数。本版推荐页没有日期和每天时长表单，也不预填或修改规划状态。

## 2 现有规划接口需要哪些字段

以下是规划页最终提交给 api.plan 的参数，不是推荐模块必须全部提供的字段。

| 字段 | 格式 | 来源 |
| --- | --- | --- |
| lineId | string | 推荐选中或用户直接浏览的路线 |
| poiIds | string[] | 规划页选择；页面要求至少一个已知点位 |
| timeRange.startDate | YYYY-MM-DD | 规划页填写 |
| timeRange.startSlot | 上午 / 中午 / 晚上 | 规划页填写，当前默认上午 |
| timeRange.endDate | YYYY-MM-DD | 规划页填写 |
| timeRange.endSlot | 上午 / 中午 / 晚上 | 规划页填写，当前默认晚上 |
| hoursPerDay | 6 / 8 / 10 | 规划页填写，当前默认 8 |
| protectedIds | 可选 string[] | 契约和引擎支持；当前 store.submit 尚未传入 |

调用链：CustomizeView → stores/plan.js → api/adapter.js → 本地 mock + 引擎，或真实后端 POST /plan。推荐模块无需修改 PlanResult。

如果以后接时间预填，注意 loadLine 会清空景点和结果但保留旧时间；同一路线已经加载时 CustomizeView 会跳过加载。这是实现注意事项，无需让同学逐条回答。

## 3 推荐模块读取哪些现有数据

已有 listColumns() 可取得按城市分组的路线；getLineDetail(lineId) 返回 `{ line, ip, pois }`。开发通过 api/adapter.js 访问数据，避免业务页面直接依赖 mock 导出。

| 对象 | 可复用字段 | 推荐用途 |
| --- | --- | --- |
| IP | ipId、name、author、kind、cover、aliases | 识别作品、内容类型、名称和人物搜索 |
| 路线 | lineId、ipId、title、city、cover、recommendDays | 候选路线和推荐卡片 |
| 标签 | 数据中的 ip.tags；mock 的 Line.tags 来自 index.json | 当前主要为城市、人物、地名；不等同于题材标签 |
| 景点 | poiId、lineId、type、name、intro、realPhoto | 展示已有路线亮点，不自动勾选 |
| 作品依据 | quotes 及其 source | 有可靠内容时用于解释关联；空缺时不编造 |

规划已有的 cluster、经纬度、durationNormal、durationRush、tier、popularity 等继续由原引擎使用，推荐交接无需重复传递。

需要数据库同学补齐或统一的内容：

- **内容类型 kind 的字典**：contract.md 写 novel / film / poetry / history，但实际数据已有 tv、prose，需同步文档与数据。
- **题材标签字典与 IP 关联**：例如悬疑、科幻、青春；建议稳定 tagId + 名称、IP 与标签关联。具体字段名由数据库方确定，尚非现有字段。
- **可推荐状态和依据**：部分 JSON 自注为草稿，存在空引文、待核坐标；需明确哪些路线可正式作为推荐候选，不能把“文件存在”当作资料已核实。

标签字典、内容维护与用户画像存储属于数据库对接，不要求规划同学重做。

画像新增可选字段 `interests.favoriteWorks: string`（最多 500 字，缺省空字符串），保存用户自填的任意作品／作者／版本和喜欢的原因；不要求在 IP 表中存在，不生成新 ipId。与原有 kinds/themes/moods/ipIds 一并通过 GET/PUT /api/me/interests 读写，当前存于 recommendation_profiles.interests JSON，无需新表。推荐响应的 preferenceAnalysis 为本次 AI 推测，不回写画像，也不交给规划模块。

## 4 直接复用哪些文档

| 文件 | 用途与注意事项 |
| --- | --- |
| [src/api/contract.md](../../src/api/contract.md) | 主接口文档：IP、Line、POI、plan 输入及 PlanResult；接口变动优先同步这里 |
| [data/字段规范.md](../../data/字段规范.md) | 点位字段含义与内容要求；部分示例仍以早期三条线为背景，结合实际 JSON 使用 |
| [data/填写模板.md](../../data/填写模板.md) | 内容同学扩充路线和景点的填写材料 |
| [README.md](../../README.md) | 启动与 mock / 后端切换说明；页面路径以当前 router 为准 |
| [feature-scope.md](feature-scope.md) | 推荐功能范围及与规划方的分工 |

核对代码：[adapter.js](../../src/api/adapter.js)、[mock/index.js](../../src/api/mock/index.js)、[plan.js](../../src/stores/plan.js)、[CustomizeView.vue](../../src/views/CustomizeView.vue)、[RouteIntroView.vue](../../src/views/RouteIntroView.vue)。实际数据示例：[开端·厦门](../../data/lines/kaiduan-xiamen.json)。

根目录的《接口对齐.md》是早期合并提案，其中多项问题当前已解决，不作为此次最新接口依据。无需规划同学重新写一份完整文档；若他有未合并的变化，只需提供对应分支或更新后的 contract.md。

需要发给同学的问题见[简短提问](planning-questions.md)。


## 本地整合更新（b085373 + planning.v1）

推荐交接仍只传 lineId：介绍页 `/line/:lineId?from=recommend`，规划入口 `/customize/:lineId`。日期、选点和旅行要求由规划端处理。当前规划使用 `/api/planning/sessions`、`/api/itineraries` 等 planning.v1 接口，结果页 `/itinerary/:id`，支持刷新恢复、修改预览/应用/撤销与追加。上述旧 api.plan / PlanResult 说明仅对应保留的兼容流程，不是新规划页面实际调用链。AI 的 preferenceAnalysis 不作为用户已确认要求。
