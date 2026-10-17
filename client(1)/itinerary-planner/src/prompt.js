/**
 * 提示词构造。约束全部写成模型可自检的硬性规则，便于后续用本地校验器逐条核对。
 */

import { formatDuration, maxSchedulableAttractions } from './itinerary.js';

const PACE_HINT = {
  relaxed: '轻松：每天安排的景点数量偏少，景点之间留较宽裕的缓冲，不早于开始时间太多、不拖到结束时间。',
  normal: '正常：每天安排紧凑但可行，尽量把时间用满而不过载。',
  packed: '紧凑：在硬性规则允许范围内尽量多排景点，减少空档。',
};

export const SYSTEM_PROMPT = [
  '你是一名资深的城市行程规划师，擅长把有限的景点清单排成逐日可执行的行程。',
  '',
  '硬性规则（必须全部满足，任何一条不满足都视为不合格）：',
  '1. 只能使用用户清单中的景点，不得新增、改名或遗漏；景点名称必须与清单原文完全一致。',
  '2. 每个景点的游玩时长必须与清单给出的时长完全一致。',
  '   ⚠ 这是最容易犯的错误：时间紧张时宁可少排景点，也绝对不能为了让行程"排得下"而把某个景点的',
  '   durationMinutes 改小、或让它提前结束。时长是用户给定的硬约束，不是可以协商的目标。',
  '3. 时间用 24 小时制 "HH:MM" 表示，且必须满足：结束时间 = 开始时间 + durationMinutes。',
  '4. 每天所有安排必须落在用户给出的每日可用时间段内。',
  '5. 同一天内相邻两个景点之间必须留出至少用户要求的转场时间（用空档表示，或显式插入 transfer 安排）。',
  '6. 每个景点最多出现一次。某天时间有剩余时，用 kind "break" 的自由活动表示，',
  '   不要为了填满时间而把已经排过的景点再排一遍。',
  '7. 逐日安排要均衡，避免某天过载而另一天全空。',
  '8. 只输出 JSON 对象，不要输出任何解释、寒暄或 Markdown 代码块标记。',
].join('\n');

/** 输出 JSON 结构说明，同时用于初始提示和修复提示。 */
export const OUTPUT_CONTRACT = [
  '输出 JSON 结构：',
  '{',
  '  "city": "城市名",',
  '  "summary": "一句话总览，不超过 60 字",',
  '  "days": [',
  '    {',
  '      "day": 1,',
  '      "theme": "当天主题，例如 外滩—豫园老城厢",',
  '      "stops": [',
  '        { "kind": "visit", "name": "景点名（必须与清单一致）", "start": "09:30", "end": "11:00", "durationMinutes": 90, "note": "可选备注" },',
  '        { "kind": "transfer", "name": "地铁 2 号线", "start": "11:00", "end": "11:40", "durationMinutes": 40, "note": "可选" }',
  '      ]',
  '    }',
  '  ],',
  '  "unscheduled": ["放不下的景点名，按清单原名"],',
  '  "tips": ["可选提示，例如地铁线路、门票预约"]',
  '}',
  'kind 取值：visit（景点游玩）、transfer（转场）、meal（用餐）、break（休息）。',
].join('\n');

function attractionLines(request) {
  return request.attractions
    .map((item, index) => {
      const note = item.notes ? `（备注：${item.notes}）` : '';
      return `${index + 1}. ${item.name} | ${formatDuration(item.durationMinutes)}（${item.durationMinutes} 分钟）${note}`;
    })
    .join('\n');
}

/** 首次请求的用户提示。 */
export function buildUserPrompt(request, budget) {
  // 与 planner 保持一致：只有时间确实不够且开了 allowOverflow 时才允许放弃景点
  const overflowAllowed = request.allowOverflow && !budget.fits;
  const mustUseAll = request.requiresAllAttractions && !overflowAllowed;
  const blocks = [
    '请根据以下需求安排行程，并只返回 JSON。',
    '',
    `城市：${request.city}`,
    `总天数：${request.days} 天`,
    `每日可用时间：${request.dailyStart}–${request.dailyEnd}（每天 ${formatDuration(request.dailyWindowMinutes)}）`,
    `转场时间：同一天内相邻景点之间至少 ${request.transferMinutes} 分钟`,
    `节奏要求：${PACE_HINT[request.pace] ?? PACE_HINT.normal}`,
    `是否必须用完所有景点：${mustUseAll ? `是，全部 ${budget.attractionCount} 个景点都要安排` : '否，可以放弃部分景点并写入 unscheduled'}`,
    `开始日期：${request.startDate ?? '未指定'}`,
    '',
    `时间预算（已核算，请以此为准）：${request.days} 天每天可用 ${formatDuration(request.dailyWindowMinutes)}，`
      + `景点游玩合计 ${formatDuration(budget.totalVisitMinutes)}，`
      + `最少转场 ${budget.minTransfers} 次共 ${formatDuration(budget.transferMinutes)}，`
      + `合计需求 ${formatDuration(budget.requiredMinutes)}，可用 ${formatDuration(budget.capacityMinutes)}。`,
    '',
    `景点清单（名称 | 游玩时长）：`,
    attractionLines(request),
    '',
  ];

  if (request.extraRequirements) {
    blocks.push(`补充要求：${request.extraRequirements}`, '');
  }
  if (overflowAllowed) {
    const maxCount = maxSchedulableAttractions(request);
    blocks.push(
      `⚠ 重要：这组需求的总时间超出每日可用时间 ${formatDuration(budget.deficitMinutes)}，不可能全部安排完。`,
      `按当前「每天 ${formatDuration(request.dailyWindowMinutes)}、景点间至少 ${request.transferMinutes} 分钟转场」的限制，`
        + `最多只能安排 ${maxCount} 个景点（清单共 ${request.attractions.length} 个）。`,
      `- 请只安排 ${maxCount} 个景点，把其余 ${request.attractions.length - maxCount} 个按清单原名写入 unscheduled；每个景点仍只能出现一次。`,
      '- 绝对不要为了让更多景点排进来而缩短任何景点的游玩时长；每个景点的 durationMinutes 必须与清单完全一致。',
      '- 如果某个景点放不下，正确做法是把它放进 unscheduled，而不是压缩它、把它挪到超出可用时间的时段、或重复排两次。',
      '',
    );
  }

  blocks.push(OUTPUT_CONTRACT);
  return blocks.join('\n');
}

/** 校验失败后的修复提示：把具体错误回传给模型。 */
export function buildRepairPrompt(errors, request) {
  const listed = errors.map((item, index) => `${index + 1}. ${item}`).join('\n');
  return [
    '你上一次的输出没有通过校验，请修正后重新输出**完整**的 JSON（只输出 JSON，不要解释）。',
    '',
    '发现的问题：',
    listed,
    '',
    '再次强调：',
    `- 景点名称必须与清单原文一致，且每个景点只能出现一次（清单：${request.attractions.map((item) => item.name).join('、')}）。`,
    '- 结束时间必须等于开始时间 + durationMinutes，游玩时长必须与清单完全一致；不得改小任何景点的时长。',
    `- 所有安排必须落在 ${request.dailyStart}–${request.dailyEnd} 之内。`,
    `- 同一天内相邻景点之间的空档不得少于 ${request.transferMinutes} 分钟。`,
    '- 不要用「重复安排景点」或「缩短游玩时长」来解决时间不够：放不下的景点应移除，或用 kind "break" 表示空档。',
    '',
    OUTPUT_CONTRACT,
  ].join('\n');
}

/** 模型返回的不是合法 JSON 时的修复提示。 */
export function buildJsonRepairPrompt(preview) {
  const blocks = [
    '你上一次的回复不是合法的 JSON，无法解析。',
  ];
  if (preview) blocks.push('', `上一次回复的开头是：${String(preview).slice(0, 200)}`);
  blocks.push('', '请只输出一个合法的 JSON 对象，不要包含任何解释文字或 Markdown 代码块标记。', '', OUTPUT_CONTRACT);
  return blocks.join('\n');
}
