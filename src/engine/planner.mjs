// 行程规划引擎 —— 纯函数、零依赖、可跑在浏览器里
// 规则来源：最终执行方案.md 第三节 / 行程规划与取舍机制.md 第四节
// 设计原则：确定性算法，不用 AI；同样的输入永远同样的输出。

// ===============================================================
// 配置
// ===============================================================
export const DEFAULTS = {
  dayHours: 8,          // 用户可选 6 / 8 / 10
  roadFactor: 1.35,     // 直线距离 → 实际路程的放大系数
  speedKmh: 22,         // 市内平均通行速度
  clusterSplitLimit: 8, // 每天超过这个点数就不穷举，改用最近邻
  addThreshold: 0.7,    // 使用率低于这个值 → 建议追加景点
};

export const TIER_WEIGHT = { S: 100, A: 40, B: 10 };

// 一天切成三段：上午 / 中午 / 晚上。
// 用「时段在一天中的起止位置」折算可用时间，比拍脑袋定比例更自洽：
//   上午 09:00-12:12 / 中午 12:12-14:36 / 晚上 14:36-17:00（以 8h 的一天归一）
const SLOT_START = { 上午: 0.0, 中午: 0.4, 晚上: 0.7 };
const SLOT_END = { 上午: 0.4, 中午: 0.7, 晚上: 1.0 };

export const DAY_START_MIN = 9 * 60; // 每天从 09:00 开始

// ===============================================================
// 基础工具
// ===============================================================
const R = 6371;
const rad = (d) => (d * Math.PI) / 180;

export function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function makeTravelFn(opts = {}) {
  const { roadFactor, speedKmh } = { ...DEFAULTS, ...opts };
  return (a, b) => Math.round(((haversineKm(a, b) * roadFactor) / speedKmh) * 60);
}

export const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const diffDays = (a, b) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

// 分钟 → 「1.5 小时」，给人看的
export const fmtHours = (min) => `${Math.round(min / 6) / 10} 小时`;

// ===============================================================
// 第 1 步：日期区间 → 每天可用分钟数
//   startMin  = 这一天从几点开始作数（首日按到达时段顺延）
//   available = 这一天真正可用的分钟数
// ===============================================================
export function buildDays({ startDate, startSlot, endDate, endSlot, dayHours }) {
  const startAt = SLOT_START[startSlot];
  const endAt = SLOT_END[endSlot];
  if (startAt === undefined || endAt === undefined) {
    throw new Error(`时段必须是 上午/中午/晚上，收到：${startSlot} / ${endSlot}`);
  }
  const span = diffDays(startDate, endDate);
  if (span < 0) throw new Error('结束日期不能早于开始日期');

  const perDay = dayHours * 60;
  const mk = (date, ratio, offset) => ({
    date,
    ratio,
    available: Math.round(ratio * perDay),
    startMin: DAY_START_MIN + Math.round(offset * perDay),
  });

  if (span === 0) {
    if (endAt <= startAt) throw new Error('同一天内结束时段不能早于或等于开始时段');
    return [mk(startDate, endAt - startAt, startAt)];
  }

  const days = [];
  for (let i = 0; i <= span; i++) {
    if (i === 0) days.push(mk(addDays(startDate, i), 1 - startAt, startAt));
    else if (i === span) days.push(mk(addDays(startDate, i), endAt, 0));
    else days.push(mk(addDays(startDate, i), 1, 0));
  }
  return days;
}

// ===============================================================
// 第 2 步：片区聚类 + 时长解析
// ===============================================================
export function groupByCluster(pois) {
  const map = new Map();
  for (const p of pois) {
    if (!map.has(p.cluster)) map.set(p.cluster, []);
    map.get(p.cluster).push(p);
  }
  return map;
}

export const rushMinutes = (poi) =>
  poi.durationRush ?? Math.round(poi.durationNormal * 0.5);

export const durationOf = (poi, mode = 'normal') =>
  mode === 'rush' ? rushMinutes(poi) : poi.durationNormal;

// 点位重要度，统一到 0-100：IP 点看 tier，城市景点看知名度
export const importanceOf = (p) =>
  p.type === 'ip' ? TIER_WEIGHT[p.tier] ?? 50 : (p.popularity ?? 3) * 20;

// 「这个点位实际要待多久」的解析函数：在 rushSet 里的走压缩时长
const makeResolve = (rushSet) => (poi) =>
  durationOf(poi, rushSet.has(poi.poiId) ? 'rush' : 'normal');

// 片区内部的最短连接（用作"最小交通"下界）：最近邻
function intraTravel(points, travel) {
  if (points.length < 2) return 0;
  const [first, ...rest] = points;
  let total = 0;
  let cur = first;
  const left = [...rest];
  while (left.length) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = travel(cur, left[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    total += bestD;
    cur = left.splice(best, 1)[0];
  }
  return total;
}

// ===============================================================
// 第 3 步：每天内部的访问顺序
// 点数少时直接穷举 —— 8! = 40320，不到 1 毫秒，拿到的是真最优解
// ===============================================================
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) out.push([arr[i], ...perm]);
  }
  return out;
}

function nearestNeighbor(points, travel) {
  const left = [...points];
  const out = [left.shift()];
  while (left.length) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = travel(out[out.length - 1], left[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    out.push(left.splice(best, 1)[0]);
  }
  return out;
}

export function bestOrder(points, travel, limit = DEFAULTS.clusterSplitLimit) {
  if (points.length <= 1) return { order: [...points], travelMinutes: 0 };
  const candidates =
    points.length <= limit ? permutations(points) : [nearestNeighbor(points, travel)];
  let best = null;
  let bestCost = Infinity;
  for (const order of candidates) {
    let cost = 0;
    for (let i = 1; i < order.length; i++) cost += travel(order[i - 1], order[i]);
    if (cost < bestCost) {
      bestCost = cost;
      best = order;
    }
  }
  return { order: best, travelMinutes: bestCost };
}

// ===============================================================
// 第 4 步：把片区分配到各天
// 片区是行程的最小单位（片内交通共享）：按 cost 从大到小，
// 每次丢给「当前最闲的一天」，让每天负担尽量均衡。
// 返回：每天的点位数组。
// ===============================================================
function assignClustersToDays(pois, dayCount, resolve, travel) {
  const groups = groupByCluster(pois);
  const clusters = [...groups.entries()].map(([name, points]) => ({
    name,
    points,
    cost: points.reduce((s, p) => s + resolve(p), 0) + intraTravel(points, travel),
  }));

  clusters.sort((a, b) => b.cost - a.cost);
  const buckets = Array.from({ length: dayCount }, () => []);

  for (const c of clusters) {
    let target = 0;
    let minLoad = Infinity;
    buckets.forEach((pts, i) => {
      const load = pts.reduce((s, p) => s + resolve(p), 0) + intraTravel(pts, travel);
      if (load < minLoad) {
        minLoad = load;
        target = i;
      }
    });
    buckets[target].push(...c.points);
  }
  return buckets;
}

// ===============================================================
// 第 4.5 步：整片搬完之后，还要能「拆片」
// 一个片区里塞了 7 个点、超过一天容量时，整片分派会让某天爆掉、其他天空着。
// 这里按「价值最低的先搬」把点挪到最闲的一天，直到没有超载或搬不动为止。
// 用最近邻估算代价（不穷举），只做决策；最终顺序仍由 bestOrder 算。
// ===============================================================
function fastCost(points, resolve, travel) {
  return points.reduce((s, p) => s + resolve(p), 0) + intraTravel(points, travel);
}

function rebalance(buckets, days, resolve, travel, maxMoves = 40) {
  const pts = buckets.map((p) => [...p]);
  const cost = pts.map((p) => fastCost(p, resolve, travel));
  const over = (i) => Math.max(0, cost[i] - days[i].available);

  for (let step = 0; step < maxMoves; step++) {
    let from = -1;
    let worst = 0;
    for (let i = 0; i < pts.length; i++) {
      if (over(i) > worst) {
        worst = over(i);
        from = i;
      }
    }
    if (from < 0) break; // 没有超载了

    let to = -1;
    let bestIdle = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i === from) continue;
      const idle = days[i].available - cost[i];
      if (idle > bestIdle) {
        bestIdle = idle;
        to = i;
      }
    }
    if (to < 0) break; // 别的一天也没空

    // 优先搬走「价值最低 + 停留最短」的点
    const order = [...pts[from]].sort(
      (a, b) => importanceOf(a) - importanceOf(b) || resolve(a) - resolve(b)
    );
    let moved = false;
    for (const p of order) {
      const nextFrom = pts[from].filter((x) => x !== p);
      const nextTo = [...pts[to], p];
      const cf = fastCost(nextFrom, resolve, travel);
      const ct = fastCost(nextTo, resolve, travel);
      const before = over(from) + Math.max(0, cost[to] - days[to].available);
      const after =
        Math.max(0, cf - days[from].available) + Math.max(0, ct - days[to].available);
      if (after < before) {
        pts[from] = nextFrom;
        pts[to] = nextTo;
        cost[from] = cf;
        cost[to] = ct;
        moved = true;
        break;
      }
    }
    if (!moved) break; // 搬谁都更糟，收手
  }

  // 第二阶段：均衡。拆片之后可能出现 5 个点 / 2 个点这种一头沉，
  // 在不制造新超载的前提下，把最忙的一天匀一个点给最闲的一天。
  for (let step = 0; step < 20; step++) {
    let busy = 0;
    let free = 0;
    for (let i = 0; i < pts.length; i++) {
      if (cost[i] > cost[busy]) busy = i;
      if (cost[i] < cost[free]) free = i;
    }
    if (busy === free || cost[busy] - cost[free] <= 60) break; // 差不到 1 小时就不折腾了

    const order = [...pts[busy]].sort((a, b) => resolve(a) - resolve(b));
    let moved = false;
    for (const p of order) {
      const nextBusy = pts[busy].filter((x) => x !== p);
      const nextFree = [...pts[free], p];
      const cb = fastCost(nextBusy, resolve, travel);
      const cf = fastCost(nextFree, resolve, travel);
      if (cb > days[busy].available || cf > days[free].available) continue; // 会撑爆就不搬
      if (cost[busy] - cost[free] - (cb - cf) < 30) continue; // 均衡收益太小
      pts[busy] = nextBusy;
      pts[free] = nextFree;
      cost[busy] = cb;
      cost[free] = cf;
      moved = true;
      break;
    }
    if (!moved) break;
  }

  return pts;
}

const clock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// ===============================================================
// 单次求解（固定一套 rushSet）
// ===============================================================
function attempt(pois, days, rushSet, travel) {
  const resolve = makeResolve(rushSet);
  const planned = days.map((d) => ({ ...d, stops: [], used: 0, travel: 0 }));
  const buckets = assignClustersToDays(pois, days.length, resolve, travel);
  const perDay = rebalance(buckets, days, resolve, travel);

  for (let i = 0; i < planned.length; i++) {
    const d = planned[i];
    const points = perDay[i];
    if (!points.length) {
      d.idle = d.available;
      continue;
    }
    const { order, travelMinutes } = bestOrder(points, travel);
    let cursor = d.startMin ?? DAY_START_MIN;
    const stops = [];
    let prev = null;
    for (const p of order) {
      const leg = prev ? travel(prev, p) : 0;
      cursor += leg;
      const mode = rushSet.has(p.poiId) ? 'rush' : 'normal';
      const stay = durationOf(p, mode);
      stops.push({
        poiId: p.poiId,
        name: p.name,
        type: p.type,
        tier: p.tier,
        cluster: p.cluster,
        arrive: clock(cursor),
        leave: clock(cursor + stay),
        stayMinutes: stay,
        legMinutes: leg,
        mode,
      });
      cursor += stay;
      prev = p;
    }
    d.stops = stops;
    d.travel = travelMinutes;
    d.used = points.reduce((s, p) => s + resolve(p), 0) + travelMinutes;
    d.idle = Math.max(0, d.available - d.used);
  }

  const used = planned.reduce((s, d) => s + d.used, 0);
  const available = planned.reduce((s, d) => s + d.available, 0);
  const overDays = planned.filter((d) => d.used > d.available).map((d) => d.date);

  return { days: planned, used, available, fit: overDays.length === 0, overDays };
}

// ===============================================================
// 建议舍弃 —— 按性价比（价值 / 节省）升序砍
//   节省 = 压缩档停留时长 +（孤点效应）整个往返交通
// 一个点若单独待在一个片区，砍掉它能省下一整趟往返，所以优先被砍。
// ===============================================================
export function suggestDrop(
  selected,
  { rushSet = new Set(), protectedIds = [], travel, shortage = 0 } = {}
) {
  const resolve = makeResolve(rushSet);
  const items = selected.map((p) => {
    const others = selected.filter((x) => x.poiId !== p.poiId);
    let nearest = Infinity;
    for (const o of others) nearest = Math.min(nearest, travel(p, o));
    const isolated = !others.some((o) => o.cluster === p.cluster) && Number.isFinite(nearest);
    const detourMinutes = isolated ? Math.round(2 * nearest) : 0;
    const savesMinutes = resolve(p) + detourMinutes;
    const protectedByUser = protectedIds.includes(p.poiId);
    const value = protectedByUser ? Infinity : importanceOf(p);
    return {
      poiId: p.poiId,
      name: p.name,
      type: p.type,
      tier: p.tier,
      cluster: p.cluster,
      isolated,
      protected: protectedByUser,
      savesMinutes,
      detourMinutes,
      score: value / Math.max(1, savesMinutes),
      reason: isolated
        ? `它单独在「${p.cluster}」，往返约 ${fmtHours(detourMinutes)}，放弃能省 ${fmtHours(savesMinutes)}。`
        : `和「${p.cluster}」的其他点同去同回，交通省不下来，放弃只省 ${fmtHours(savesMinutes)}。`,
    };
  });

  items.sort((a, b) => a.score - b.score || b.savesMinutes - a.savesMinutes);

  let acc = 0;
  for (const it of items) {
    it.mustDrop = !it.protected && acc < shortage;
    if (it.mustDrop) acc += it.savesMinutes;
  }

  return {
    shortage,
    savedIfAllDropped: items.reduce((s, i) => s + i.savesMinutes, 0),
    items,
  };
}

// ===============================================================
// 建议追加 —— 按 IP 重要度 + 知名度排序，顺路的排前面
// ===============================================================
export function suggestAdd(allPois, selected, { travel, headroom = 0, limit = 5 } = {}) {
  const chosen = new Set(selected.map((p) => p.poiId));
  const inPlay = new Set(selected.map((p) => p.cluster));

  const items = allPois
    .filter((c) => !chosen.has(c.poiId))
    .map((c) => {
      let nearest = Infinity;
      for (const s of selected) nearest = Math.min(nearest, travel(s, c));
      const sameCluster = inPlay.has(c.cluster);
      const detourMinutes = sameCluster ? Math.min(nearest, 20) : Math.round(2 * nearest);
      const stay = durationOf(c, 'normal');
      const addsMinutes = stay + detourMinutes;
      const score = importanceOf(c);
      return {
        poiId: c.poiId,
        name: c.name,
        type: c.type,
        tier: c.tier,
        cluster: c.cluster,
        popularity: c.popularity,
        sameCluster,
        addsMinutes,
        fits: addsMinutes <= headroom,
        score,
        reason: sameCluster
          ? `就在「${c.cluster}」，顺路多花 ${fmtHours(addsMinutes)}。`
          : `要新开「${c.cluster}」片区，来回约 ${fmtHours(addsMinutes)}。`,
      };
    })
    .sort(
      (a, b) =>
        Number(b.sameCluster) - Number(a.sameCluster) ||
        Number(b.fits) - Number(a.fits) ||
        b.score - a.score
    );

  return { headroom, items: items.slice(0, limit) };
}

// ===============================================================
// 主函数
// ===============================================================
export function plan({
  pois,
  dayHours = DEFAULTS.dayHours,
  startDate,
  startSlot,
  endDate,
  endSlot,
  allPois = [],
  protectedIds = [],
  options = {},
}) {
  const cfg = { ...DEFAULTS, dayHours, ...options };
  const travel = makeTravelFn(cfg);

  if (!pois.length) {
    return { ok: false, reason: '一个点位都没选', days: [], suggestion: null };
  }

  // ---- 1. 日期 → 每天可用时间 ----
  const baseDays = buildDays({ startDate, startSlot, endDate, endSlot, dayHours });
  const totalAvailable = baseDays.reduce((s, d) => s + d.available, 0);

  // ---- 2. 先判死：全 rush 也装不下，就是物理上不可能 ----
  const clusterTravel = [...groupByCluster(pois).values()].reduce(
    (s, pts) => s + intraTravel(pts, travel),
    0
  );
  const needNormal = pois.reduce((s, p) => s + durationOf(p, 'normal'), 0) + clusterTravel;
  const needRush = pois.reduce((s, p) => s + durationOf(p, 'rush'), 0) + clusterTravel;
  const impossible = needRush > totalAvailable;

  // ---- 3. 先全部按 normal 排 ----
  let result = attempt(pois, baseDays, new Set(), travel);
  const degraded = [];

  // ---- 4. 装不下 → 按优先级从低到高逐个改 rush，直到装得下 ----
  if (!result.fit) {
    const order = [...pois].sort(
      (a, b) => (TIER_WEIGHT[a.tier] ?? 50) - (TIER_WEIGHT[b.tier] ?? 50)
    );
    const rushSet = new Set();
    for (const p of order) {
      rushSet.add(p.poiId);
      degraded.push(p.poiId);
      result = attempt(pois, baseDays, rushSet, travel);
      if (result.fit) break;
    }
  }

  const usage = result.available ? result.used / result.available : 0;
  const shortage = Math.max(0, result.used - result.available);
  const overload = shortage > 0;
  const rushSet = new Set(degraded);

  // ---- 5. 给建议 ----
  let suggestion = null;
  if (overload) {
    suggestion = {
      kind: 'drop',
      ...suggestDrop(pois, { rushSet, protectedIds, travel, shortage }),
    };
  } else if (usage < cfg.addThreshold) {
    suggestion = {
      kind: 'add',
      ...suggestAdd(allPois, pois, { travel, headroom: result.available - result.used }),
    };
    if (!suggestion.items.length) suggestion = null;
  }

  let message = null;
  if (overload) {
    message = impossible
      ? '已选景点没法在给定时间内走完，即便全部压缩也排不下——请减少景点或增加天数。'
      : `还差约 ${fmtHours(shortage)} 排不下，请放弃部分景点或增加天数。`;
  }

  return {
    ok: !overload,
    overload,
    shortage,
    usage,
    totalAvailable,
    totalUsed: result.used,
    minNeed: needRush,
    needNormal,
    daysNeeded: Math.ceil(needNormal / (dayHours * 60)),
    impossible,
    compressed: degraded.length > 0,
    degraded,
    days: result.days,
    suggestion,
    message,
    config: { dayHours, ...cfg },
  };
}
