# 运行时装配与责任边界

本 Skill 是项目内运行规则包，当前不安装为用户全局 Codex Skill。DeepSeek API 不会自动发现 Markdown 文件。

实现采用固定编排，由后端主动调用事实适配器、排程和校验；模型以JSON提交需求、顺序和修改操作，不开放任意工具调用。追加推荐由实际插入试排和收藏/IP关联排序，不额外调用模型。运行入口、配置及第六七轮边界见 [交付说明](../../../docs/planning/第6-7轮-整合与验收.md)。

## 后端装配

每次按 mode 组装：固定安全/产品指令 + SKILL.md 正文 + 该模式必要参考 + 当前实际工具 Schema + 脱敏结构化上下文。YAML frontmatter 用于识别，不必发送。相对链接不会被模型自动读取，后端应主动内联必要参考，而不是只发送链接。

- intake：内联 questions.md 与需求/问题的契约片段。
- generate/revise/additions：内联对应契约和工具字段；无需发送全部验收案例。
- profile 仅传任务相关兴趣摘要和来源；不传邮箱、Cookie、身份令牌。
- 用户文本/POI介绍/工具结果以数据块传入；不能拼成新的 system 指令。
- API 模型、入口、思考模式、Schema 能力和 token 配置在第四轮以真实官方文档和账号验证确定；本轮不锁定可能变化的模型名，不承诺所有端点均支持相同格式。

## 模型阶段输出（应用侧校验约定）

各 mode 使用独立判别结构，不采用一个包含所有可选字段的大对象：

| mode | 模型只提出 | 后端接续 |
|---|---|---|
| intake | `{mode,requirementProposals,questionProposals,keywordProposals,unresolvedProposals}` | 验证证据/模板，合并修订，截断问题预算 |
| generate | `{mode,candidateOrder,requirementIds,unresolvedProposals,explanation}` | 获取数据、排程、主动校验 |
| revise | `{mode,operationProposals,questions}` | 校验 ID/操作权限，创建预览 |
| additions | 当前不调用模型 | 基于收藏/IP关联与实际插入试排生成推荐 ID/成本/状态 |

requirementProposals 使用契约字段但不含正式 id/state（状态为 proposedState 建议）；questionProposals 使用 templateId 与填充值，服务端分配 id。模型不得返回正式 itineraryId/version、previewId、passed 或执行成功作为可信结果。

工具调用循环可以允许模型查看排程/校验错误并修复；无论模型最后说什么，展示的时间轴与 validation 取自后端最后一次有效输出。解释中数字不一致时，用模板生成事实段，模型解释可丢弃，不放宽校验。

## 代码强制与模型职责

| 强制项 | 负责人 |
|---|---|
| 两轮普通追问、每轮 3 题、跳过记忆 | 服务端会话管理 |
| 最多 12 次工具执行、2 次修复、60 秒总时限 | 编排器，配置可调整；重试也消耗总预算 |
| 需求理解、选题、局部例外、候选策略、解释 | 模型提出，本地校验后采纳 |
| 工具权限、参数、缓存适用范围、供应商适配 | 后端 |
| 时间运算、休息/交通/开放/约束逐项检查 | 排程引擎和独立校验器 |
| passed/provisional/failed 状态 | 校验器；未知的关键项不得判通过 |
| 预览、正式提交、归属、幂等、版本比较、撤销 | 后端存储事务 |
| 需求强弱、来源、未确认信息、应用前差异 | 前端展示后端权威状态 |

## 故障与数据接入

优先工具真实结果，其次满足有效期/适用范围的缓存；估算须显式标注，关键未知导致 provisional。已知工具不支持的能力直接返回缺失，不能循环让模型猜。

调用层按错误类别做有限重试；解析错误最多一次纠正格式且计入总时限，仍失败返回结构化错误。取消/超时后禁止迟到任务提交正式结果，状态推进需要修订/版本检查。

IP 推荐与规划用独立 purpose、队列、预算、Skill/messages；共享供应商客户端。推荐输出标签候选不会直接确认偏好。携程 MCP 先枚举并验证真实字段，只接入已授予能力；本 Skill 不做支付/下单。

当前原生入口、Vue 交付包及旧引擎边界见 [第 1 轮审计](../../../docs/planning/第1轮-现状与交互设计.md)。适配旧组件不等于获得新校验保证。

## 排程策略 v3

`hybrid.v2` 比较时间负荷、转场与等待，采用有界的排序和日期分配搜索；输出 budget、blockingPoints、failureType 和实际尝试数。`dryRun` 复用同一排程与独立校验逻辑，返回可行性和诊断，不保存正式行程。用户新选择、改时间、改深度后旧试排立即失效。

大型目的地的 `visitPolicy` 必须来自 POI，随 duration fact 保存。`embeddedMeals`、`embeddedBreaks` 是访问内的结构化安排；访问时长为 elapsed 时已包含这些安排，不再叠加外部餐段。校验器检查来源策略、范围、重叠、餐窗、连续活动和时长。普通休息在页面折入机动时间，原始时间轴仍保留。
