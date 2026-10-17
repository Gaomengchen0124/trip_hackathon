/**
 * 行程规划领域层：入参校验、时间换算、时间预算核算。
 * 这里不依赖网络，所有算术都在本地完成，避免把时间计算交给大模型导致不可校验的结果。
 */

export const DEFAULTS = Object.freeze({
  dailyStart: '09:00',
  dailyEnd: '18:00',
  transferMinutes: 30,
  pace: 'normal',
});

const CLOCK_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const PACES = ['relaxed', 'normal', 'packed'];
const MAX_VISIT_MINUTES = 24 * 60;
const MAX_DAYS = 365;

export class PlanError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'PlanError';
    this.code = code;
    Object.assign(this, extra);
  }
}

/** "09:30" -> 570（分钟） */
export function parseClock(value, field = '时间') {
  if (typeof value !== 'string') {
    throw new PlanError('INVALID_INPUT', `${field} 必须是 "HH:MM" 格式的字符串。`);
  }
  const matched = CLOCK_PATTERN.exec(value.trim());
  if (!matched) {
    throw new PlanError('INVALID_INPUT', `${field} 格式不合法：${JSON.stringify(value)}（应为 "HH:MM"，24 小时制）。`);
  }
  return Number(matched[1]) * 60 + Number(matched[2]);
}

/** 570 -> "09:30" */
export function formatClock(minutes) {
  if (!Number.isFinite(minutes)) return '';
  const day = 24 * 60;
  const normalized = ((Math.round(minutes) % day) + day) % day;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

/** 150 -> "2 小时 30 分" */
export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours && rest) return `${hours} 小时 ${rest} 分`;
  if (hours) return `${hours} 小时`;
  return `${rest} 分钟`;
}

/**
 * 名称归一化，仅用于匹配模型输出的景点名。
 * 真实模型常把「上海博物馆」写成「上海博物馆（人民广场馆）」或在名称中改标点，
 * 归一化后仍然匹配不上才判定为幻觉景点。
 */
export function normalizeName(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[（）()【】\[\]{}·・\-—–_~、,，.。:：;；!！?？'’"“”]/g, '');
}

/**
 * 严格解析 YYYY-MM-DD，非法日期（含 2026-02-31、2026-13-01）返回 null。
 * 注意不能直接用 Date.UTC(y, ...)：年份 0–99 会被映射到 1900+。
 */
export function parseDateOnly(value) {
  if (typeof value !== 'string') return null;
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** 校验并补齐入参，返回后续流程使用的规范化请求。 */
export function normalizeRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PlanError('INVALID_INPUT', '输入必须是 JSON 对象。');
  }

  const city = typeof input.city === 'string' ? input.city.trim() : '';
  if (!city) throw new PlanError('INVALID_INPUT', '缺少 city（城市名称）。');

  const days = input.days;
  if (!Number.isInteger(days) || days < 1) {
    throw new PlanError('INVALID_INPUT', `days 必须是 ≥ 1 的整数，当前为 ${JSON.stringify(input.days)}。`);
  }
  if (days > MAX_DAYS) {
    throw new PlanError('INVALID_INPUT', `days 最多支持 ${MAX_DAYS} 天，当前为 ${days}。`);
  }

  if (!Array.isArray(input.attractions) || input.attractions.length === 0) {
    throw new PlanError('INVALID_INPUT', 'attractions 必须是非空数组，每项形如 { "name": "外滩", "durationMinutes": 90 }。');
  }

  const byNormalizedName = new Map();
  const attractions = input.attractions.map((raw, index) => {
    const where = `attractions[${index}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new PlanError('INVALID_INPUT', `${where} 必须是对象。`);
    }
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) throw new PlanError('INVALID_INPUT', `${where}.name 不能为空。`);

    const duration = Number(raw.durationMinutes);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new PlanError('INVALID_INPUT', `${where}.durationMinutes 必须是正数（分钟），当前为 ${JSON.stringify(raw.durationMinutes)}。`);
    }
    if (duration > MAX_VISIT_MINUTES) {
      throw new PlanError('INVALID_INPUT', `${where}.durationMinutes 为 ${duration}，超过 1440 分钟，请确认单位是分钟。`);
    }
    if (Math.round(duration) < 1) {
      throw new PlanError('INVALID_INPUT', `${where}.durationMinutes 为 ${duration}，不足 1 分钟，请用整数分钟。`);
    }

    const key = normalizeName(name);
    if (byNormalizedName.has(key)) {
      throw new PlanError('INVALID_INPUT', `景点名称重复：${name}（与 ${byNormalizedName.get(key).name} 在忽略大小写和标点后相同）。`);
    }

    const attraction = {
      id: index + 1,
      name,
      durationMinutes: Math.round(duration),
      notes: typeof raw.notes === 'string' ? raw.notes.trim() : '',
    };
    byNormalizedName.set(key, attraction);
    return attraction;
  });

  const dailyStartMinute = parseClock(input.dailyStart ?? DEFAULTS.dailyStart, 'dailyStart');
  const dailyEndMinute = parseClock(input.dailyEnd ?? DEFAULTS.dailyEnd, 'dailyEnd');
  if (dailyEndMinute <= dailyStartMinute) {
    throw new PlanError(
      'INVALID_INPUT',
      `dailyEnd(${formatClock(dailyEndMinute)}) 必须晚于 dailyStart(${formatClock(dailyStartMinute)})。`,
    );
  }

  const transferMinutes = input.transferMinutes === undefined ? DEFAULTS.transferMinutes : Number(input.transferMinutes);
  if (!Number.isFinite(transferMinutes) || transferMinutes < 0) {
    throw new PlanError('INVALID_INPUT', 'transferMinutes 必须是 ≥ 0 的数字。');
  }

  const pace = input.pace ?? DEFAULTS.pace;
  if (!PACES.includes(pace)) {
    throw new PlanError('INVALID_INPUT', `pace 只能是 ${PACES.join(' / ')}，当前为 ${JSON.stringify(input.pace)}。`);
  }

  if (input.startDate !== undefined && parseDateOnly(input.startDate) === null) {
    throw new PlanError('INVALID_INPUT', `startDate 必须是真实存在的日期，格式 YYYY-MM-DD，当前为 ${JSON.stringify(input.startDate)}。`);
  }

  const mustUseAll = input.mustUseAll !== false;
  const allowOverflow = input.allowOverflow === true;

  return {
    city,
    days,
    attractions,
    byNormalizedName,
    dailyStart: formatClock(dailyStartMinute),
    dailyEnd: formatClock(dailyEndMinute),
    dailyStartMinute,
    dailyEndMinute,
    dailyWindowMinutes: dailyEndMinute - dailyStartMinute,
    transferMinutes: Math.round(transferMinutes),
    pace,
    mustUseAll,
    allowOverflow,
    // 注意：allowOverflow 只表示「时间确实不够时允许放弃」，不能解除「必须用完所有景点」。
    // 是否真的允许放弃由 planner 结合预算结果决定（预算放得下时仍然要求用完）。
    requiresAllAttractions: mustUseAll,
    startDate: input.startDate ? input.startDate.trim() : null,
    extraRequirements: typeof input.extraRequirements === 'string' ? input.extraRequirements.trim() : '',
  };
}

/**
 * 时间预算。
 *
 * 注意：只比「总时长 vs 总可用时间」是不够的。景点必须按天装箱，而每天还有窗口上限：
 * 例如 3 个各 5 小时的景点、每天可用 8 小时、共 2 天，总时长 15 小时 < 16 小时，
 * 但任何一天塞 2 个景点都会到 10 小时而超窗，实际无解。
 * 因此这里对景点数较少的情况做精确搜索（子集可行性 + 按天装箱的 DP），
 * 景点数超过上限时退化为下界估算，并用 exact 标记。
 */
const EXACT_SEARCH_LIMIT = 14;

function popcount(value) {
  let count = 0;
  let rest = value;
  while (rest) {
    rest &= rest - 1;
    count += 1;
  }
  return count;
}

/**
 * 用「先排短的」贪心算出最多能真正安排下多少个景点，并返回这个可达的数量。
 * 这是构造性的（贪心本身就能排出来），所以可以放心把它作为提示词里的硬上限告诉模型，
 * 用于时间确实不够时明确「最多排几个、其余进 unscheduled」。
 */
export function maxSchedulableAttractions(request) {
  const window = request.dailyWindowMinutes;
  const transfer = request.transferMinutes;
  const durations = request.attractions.map((item) => item.durationMinutes).sort((a, b) => a - b);

  let remainingDays = request.days;
  let index = 0;
  let placed = 0;

  while (remainingDays > 0 && index < durations.length) {
    let usedInDay = 0;
    let countInDay = 0;
    while (index < durations.length) {
      const cost = countInDay === 0 ? durations[index] : durations[index] + transfer;
      if (usedInDay + cost > window) break;
      usedInDay += cost;
      countInDay += 1;
      index += 1;
      placed += 1;
    }
    if (countInDay === 0) break; // 最短的景点都放不进这一天
    remainingDays -= 1;
  }

  return placed;
}

/** 精确求解「最少需要几天」；景点数超过上限时返回 null。 */
function exactMinimumDays(request) {
  const durations = request.attractions.map((item) => item.durationMinutes);
  const count = durations.length;
  if (count > EXACT_SEARCH_LIMIT) return null;

  const window = request.dailyWindowMinutes;
  const transfer = request.transferMinutes;
  const size = 1 << count;
  const groupMinutes = new Int32Array(size);
  const groupFeasible = new Uint8Array(size);

  for (let mask = 1; mask < size; mask += 1) {
    const lowest = mask & -mask;
    const index = 31 - Math.clz32(lowest);
    groupMinutes[mask] = groupMinutes[mask ^ lowest] + durations[index];
    const cost = groupMinutes[mask] + (popcount(mask) - 1) * transfer;
    groupFeasible[mask] = cost <= window ? 1 : 0;
  }

  const INFINITE = 255;
  const best = new Uint8Array(size).fill(INFINITE);
  best[0] = 0;

  for (let mask = 1; mask < size; mask += 1) {
    const lowest = mask & -mask;
    let value = INFINITE;
    // 只枚举包含最低位的子集，避免同一分组被重复枚举
    for (let subset = mask; subset > 0; subset = (subset - 1) & mask) {
      if ((subset & lowest) === 0 || groupFeasible[subset] === 0) continue;
      const rest = best[mask ^ subset];
      if (rest + 1 < value) value = rest + 1;
    }
    best[mask] = value;
  }

  const total = best[size - 1];
  return total === INFINITE ? Number.POSITIVE_INFINITY : total;
}

/** 下界估算：景点数很多时的兜底，用总时长推最少天数。 */
function lowerBoundDays(request, totalVisitMinutes) {
  const count = request.attractions.length;
  for (let candidate = 1; candidate <= count; candidate += 1) {
    const need = totalVisitMinutes + Math.max(0, count - candidate) * request.transferMinutes;
    if (need <= candidate * request.dailyWindowMinutes) return candidate;
  }
  return count;
}

export function computeBudget(request) {
  const count = request.attractions.length;
  const totalVisitMinutes = request.attractions.reduce((sum, item) => sum + item.durationMinutes, 0);
  const minTransfers = Math.max(0, count - request.days);
  const transferMinutes = minTransfers * request.transferMinutes;
  const requiredMinutes = totalVisitMinutes + transferMinutes;
  const capacityMinutes = request.days * request.dailyWindowMinutes;
  const deficitMinutes = Math.max(0, requiredMinutes - capacityMinutes);
  const oversized = request.attractions
    .filter((item) => item.durationMinutes > request.dailyWindowMinutes)
    .map((item) => item.name);

  const exactDays = exactMinimumDays(request);
  const minimumDays = exactDays === null ? lowerBoundDays(request, totalVisitMinutes) : exactDays;

  return {
    attractionCount: count,
    dailyWindowMinutes: request.dailyWindowMinutes,
    totalVisitMinutes,
    transferMinutes,
    minTransfers,
    requiredMinutes,
    capacityMinutes,
    deficitMinutes,
    oversized,
    minimumDays,
    // exact 为 true 表示 minimumDays 是精确解；false 表示只是下界（景点数超过精确搜索上限）
    exact: exactDays !== null,
    fits: oversized.length === 0 && minimumDays <= request.days,
  };
}

export function describeBudget(request, budget) {
  const parts = [
    `景点游玩合计 ${formatDuration(budget.totalVisitMinutes)}`,
  ];
  if (budget.minTransfers > 0) {
    parts.push(`最少 ${budget.minTransfers} 次转场共 ${formatDuration(budget.transferMinutes)}`);
  }
  parts.push(`需求 ${formatDuration(budget.requiredMinutes)}`);
  parts.push(`${request.days} 天 × 每天 ${formatDuration(budget.dailyWindowMinutes)} = 可用 ${formatDuration(budget.capacityMinutes)}`);
  return parts.join('，');
}

export function insufficientTimeMessage(request, budget) {
  const base = `${request.city}：${describeBudget(request, budget)}`;
  const daysHint = budget.exact ? `至少安排 ${budget.minimumDays} 天` : `至少安排约 ${budget.minimumDays} 天`;
  const overflowHint = '确实要压缩行程，可设置 allowOverflow: true，未安排的景点会进入 unscheduled。';

  if (budget.oversized.length > 0) {
    return `${base}。「${budget.oversized.join('、')}」所需时长已超过单日可用时间，即使增加天数也无法安排。`;
  }
  if (budget.deficitMinutes > 0) {
    return `${base}，缺口 ${formatDuration(budget.deficitMinutes)}。建议${daysHint}，`
      + `或延长每日可用时间、缩短景点游玩时长；${overflowHint}`;
  }
  // 总时长不超额但仍排不下：受「每天塞几个景点」的窗口限制
  return `${base}。总时长虽不超额，但受每日可用时间限制，`
    + `${budget.attractionCount} 个景点无法放进 ${request.days} 天，建议${daysHint}；${overflowHint}`;
}
