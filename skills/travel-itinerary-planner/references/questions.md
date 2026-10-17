# 递进问题库与关键词规则

用于 Skill 模式 A。问题 ID、字段和允许值由后端注册，模型只选题和填有依据的文案。本文件为模板规范，前端显示可调整措辞。

## 选题规则

- 普通最多两轮，每轮 1–3 题；已有完整答案不再问。没有高价值问题时直接准备生成。
- fixed_event/date 歧义优先，其次影响路线与体验的因素。购物/拍照风格等通常留可选展开。
- 直接生成停止普通追问；用户跳过不能等同于否定。新事实引出具体冲突时允许协商一次具体取舍，不重开整套问卷。
- 身体情况只问规划所需的步行/休息偏好，不要求疾病或健康隐私。同行关系不推断年龄或行动能力。
- 第一层选项卡可并列提供，实际追问题目仍按价值筛选；人数与“情侣/亲子”等关系不混成一个字段。

## 模板注册表

| templateId | 触发与题意 | fields / options | 跳过策略 |
|---|---|---|---|
| party | 同行未明确，且适配活动有收益 | count:正整数可空；companions:solo/friends/couple/children/elders/other，多选但 solo 不与其他并存 | 不推断人数年龄 |
| pace | 希望安排密度未知 | preference:more_places/balanced/fewer_deeper/unsure | 使用可见标准策略，保持自由时间 |
| mobility | 少走/走慢/常休息需区分 | preferences:less_walking/slower_walking/frequent_breaks/no_special_preference，可多选但最后项互斥 | 不套“低精力”统一参数 |
| walking_budget | 用户希望选择步行量 | walkingLevel:low/moderate/high；maxLegWalkMinutes/maxDailyWalkMinutes可空，均指交通步行 | 不猜景点内部步数，不选则不设数字上限 |
| rest_detail | 用户要求休息且会改变排程 | intervalMinutes/durationMinutes:可空正整数；保留 freeText | 用配置默认并说明，可修改 |
| wake_departure | 作息对日程有影响 | wakeTime/departureTime:HH:mm 可空；flexibility:usual_only/day_specific_ok/unsure | 起床不等于出门 |
| fixed_event | 有飞机/火车/预约/会面 | eventType, date, location, startsAt, bookingState:booked/interested/unknown | 仅保留有依据部分 |
| flight_details | 航班机场/时间缺失 | date,departureAirport,departureTime:起飞时间,flightNumber:可空 | 相关返程时段待确认，不能保证赶机 |
| child_activity | 亲子且影响适龄/午休 | ageBands:0_2/3_6/7_12/13_plus/unspecified；nap:yes/no/unsure | 不保证活动适龄性，不猜孩子数量 |
| coverage_depth | 少走又多点，或深度不明确 | strategy:fewer_deeper/more_quick/more_transport/auto_propose | 提候选，不默认全部快游 |
| poi_depth | 已选点需要逐点分配 | poiId:确认ID；depth:deep/normal/quick/unsure | 用库中正常时长，未知区间不编造 |
| transport | 交通会影响路线或步行 | modes:transit/taxi/walk/bike/mixed；strength:prefer/only | 混合草案，标假设；自行车适用性需核实 |
| shopping | 明确兴趣或目的地特色 | preference:none/on_the_way/dedicated/unsure | 不安排专门购物，不等于用户拒绝 |
| meals | 影响固定时间或体验 | preference:simple/local/dedicated；lunchStart/lunchEnd为午餐开始窗口；durationMinutes可空 | 默认30/45/60分钟，窗口11:30–13:30；餐厅和排队仍待确认 |
| queue | 表达排队偏好 | tolerance:avoid/selected_highlights/accept/unsure | 错峰或预约建议，不保证无队 |
| budget | 用户提价格或交通有取舍 | currency,amountMinor:可空；scope:per_person/trip；style:save/balanced/experience | 不虚构金额，估算标来源 |
| free_time | 留白影响安排 | preference:structured/some_free/flexible | 留合理余量，不因低利用率催加点 |
| activity_details | 想参加陶艺等活动 | activityQuery,date/window,bookingState,venueId可空 | 待预约体验块，场次未知不确认 |
| early_day_choice | 已有事实证明某日早起有收益 | proposalId；choice:accept/keep_usual/undecided | 保持原作息，或草案标待协商 |

HH:mm 仅为输入显示格式；后端转为含日期/偏移的时间。空字段不生成假的数值。系统政策默认只作为 assumed，不转换为 confirmed。

## 动态关键词

每项 `{id,label,insertText,source,relatedRequirementIds}`。未提交标签不进入需求。

| 上下文 | 可推荐文字 | 避免 |
|---|---|---|
| 未表达偏好 | 想要出片、轻松慢游、少排队、有返程安排 | 预设用户已订航班 |
| 已说带孩子 | 需要午休、想多些互动体验、尽量少换乘 | 未知年龄却写“三岁宝宝” |
| 已说步行少 | 多用交通接驳、少去几个慢慢玩、增加休息 | 默认快速打卡所有景点 |
| 景德镇且特色已确认 | 想体验陶艺、想逛陶瓷市集 | 编某工作室空余场次 |
| 文学主题且点位已确认 | 想了解原著关联、书中地点优先 | 生成无来源引文 |

点击后以分隔符插入，重复点击去重。提交时解析最终文本；用户编辑后不强行保留原标签含义。对确定选项卡，保存 optionId 与真实提交值。
