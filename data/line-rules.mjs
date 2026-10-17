// 线路 doc 校验规则 —— 纯函数、零依赖，CLI（data/validate.mjs）和服务端（server/content-validate.mjs）共用。
// 规则表是唯一真源；S01（文件存在/JSON 解析）是 CLI 层面的检查，不在此处。

export const RULES = [
  ['S01', 'error', '数据文件存在且为合法 JSON'],
  ['S02', 'error', '顶层字段齐全：_bounds / ip / line / clusters / ipStops / cityStops'],
  ['S03', 'error', 'clusters 是非空字符串数组'],
  ['S04', 'error', 'ipStops / cityStops 是数组'],
  ['S05', 'error', 'poiId 唯一，且形如 sh-ip-01 / bj-sp-03'],
  ['S06', 'error', 'poiId 前缀与 type 匹配（ip 对应 -ip-，classic 对应 -sp-）'],
  ['S07', 'error', '每个点位的 lineId 与 line.lineId 一致'],
  ['S08', 'error', '必填字段非空：name / cluster / intro / realPhoto / photoCredit'],
  ['S09', 'error', '没有残留占位符【…】'],
  ['S10', 'warn', 'IP 点位数量在 _expected.ipStops 区间内'],
  ['S11', 'warn', '城市景点数量在 _expected.cityStops 区间内'],
  ['S12', 'warn', 'IP 点位不少于 6 个（太少撑不起主题）；本线 _expected.ipStops 更小时以它为准'],
  ['C01', 'error', 'lng / lat 不为 null'],
  ['C02', 'error', '坐标落在 _bounds 范围内'],
  ['C03', 'error', 'cluster 在 clusters 列表中'],
  ['C04', 'error', 'tier 属于 {S, A, B}'],
  ['C05', 'error', 'durationRush < durationNormal'],
  ['C06', 'error', 'durationNormal 合理（IP 30-180 分钟；classic 30-480，>300 视为"要玩一整天"）'],
  ['C07', 'warn', 'tier = S 的点位不超过 _expected.maxTierS'],
  ['C08', 'warn', 'durationRush 约为 durationNormal 的 50%（±15%）'],
  ['C09', 'warn', '同一 cluster 的点位不超过 4 个（超过也能排，引擎会自动拆到多天）'],
  ['C10', 'warn', 'popularity 属于 1-5'],
  ['C11', 'warn', 'realPhoto 指向的图片文件存在（图片放 public/img/）'],
  ['C12', 'error', 'quotes[].kind 只能是「原著」或「台词」（前后端契约）'],
  ['C13', 'warn', 'photos[] 每张图都存在，且 photos[0] 与 realPhoto 一致（首图）'],
];

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const PLACEHOLDER = /【[^】]*】/;
const RUSH_TOLERANCE = 0.15;

/**
 * 校验单份线路 doc（data/lines/*.json 的形状）。
 * @param data 已解析的 doc 对象
 * @param fileChecker 可选 (path:string)=>boolean，用于 C11 图片存在性；缺省则跳过 C11
 * @returns issues: [{ level:'error'|'warn', ruleId, msg, where }]
 */
export function validateLineDoc(data, fileChecker = null) {
  const issues = [];
  const add = (level, ruleId, msg, where = '') => issues.push({ level, ruleId, msg, where });

  // ---------- S02 ----------
  const topRequired = ['_bounds', 'ip', 'line', 'clusters', 'ipStops', 'cityStops'];
  const missing = topRequired.filter((k) => data[k] === undefined);
  missing.forEach((k) => add('error', 'S02', `顶层缺少字段 ${k}`));
  if (missing.length) return issues;

  // ---------- S03 / S04 ----------
  if (!Array.isArray(data.clusters) || !data.clusters.length || data.clusters.some(isBlank)) {
    add('error', 'S03', 'clusters 必须是非空字符串数组');
  }
  for (const key of ['ipStops', 'cityStops']) {
    if (!Array.isArray(data[key])) add('error', 'S04', `${key} 必须是数组`);
  }
  if (issues.some((i) => i.level === 'error')) return issues;

  const clusters = new Set(data.clusters);
  const expect = data._expected || {};
  const bounds = data._bounds;
  const all = [
    ...data.ipStops.map((p) => ({ p, kind: 'ip' })),
    ...data.cityStops.map((p) => ({ p, kind: 'classic' })),
  ];

  // ---------- S05 / S06 ----------
  const seen = new Set();
  for (const { p } of all) {
    const id = p.poiId;
    if (isBlank(id)) {
      add('error', 'S05', '存在没有 poiId 的点位');
      continue;
    }
    if (seen.has(id)) add('error', 'S05', 'poiId 重复', id);
    seen.add(id);
    const want = p.type === 'ip' ? '-ip-' : p.type === 'classic' ? '-sp-' : null;
    if (!want) add('error', 'S06', `type 非法：${p.type}（只能是 ip / classic）`, id);
    else if (!id.includes(want)) add('error', 'S06', `poiId 与 type 不匹配，应含 ${want}`, id);
  }

  // ---------- S07 ----------
  for (const { p } of all) {
    if (p.lineId !== data.line.lineId) {
      add('error', 'S07', `lineId 不一致：${p.lineId} 应为 ${data.line.lineId}`, p.poiId);
    }
  }

  // ---------- S08 ----------
  for (const { p, kind } of all) {
    for (const f of ['name', 'cluster', 'intro', 'realPhoto', 'photoCredit']) {
      if (isBlank(p[f])) add('error', 'S08', `必填字段为空：${f}`, p.poiId || '(无名)');
    }
    if (kind === 'ip' && isBlank(p.tier)) add('error', 'S08', 'tier 为空', p.poiId);
    if (kind === 'classic' && isBlank(p.popularity)) add('error', 'S08', 'popularity 为空', p.poiId);
  }

  // ---------- S09 ----------
  for (const { p } of all) {
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === 'string' && PLACEHOLDER.test(v)) {
        add('error', 'S09', `残留占位符：${k} = ${v}`, p.poiId || '(无名)');
      }
    }
  }

  // ---------- S10 / S11 / S12 ----------
  const nIp = data.ipStops.length;
  const nCity = data.cityStops.length;
  if (expect.ipStops) {
    const [lo, hi] = expect.ipStops;
    if (nIp < lo || nIp > hi) add('warn', 'S10', `IP 点位 ${nIp} 个，期望 ${lo}-${hi} 个`);
  }
  // 默认认为一条线至少 6 个 IP 点才撑得起主题；
  // 但《我与地坛》这类作品本身就只有 1 个真实地点，_expected 说了算。
  const minIp = Math.min(6, expect.ipStops?.[0] ?? 6);
  if (nIp < minIp) add('warn', 'S12', `IP 点位只有 ${nIp} 个，撑不起主题（本线期望至少 ${minIp} 个）`);
  if (expect.cityStops) {
    const [lo, hi] = expect.cityStops;
    if (nCity < lo || nCity > hi) add('warn', 'S11', `城市景点 ${nCity} 个，期望 ${lo}-${hi} 个`);
  }

  // ---------- C01 / C02 ----------
  for (const { p } of all) {
    if (isBlank(p.lng) || isBlank(p.lat)) {
      add('error', 'C01', '坐标为空', p.poiId);
    } else if (p.lng < bounds.lng[0] || p.lng > bounds.lng[1] || p.lat < bounds.lat[0] || p.lat > bounds.lat[1]) {
      add('error', 'C02', `坐标 (${p.lng}, ${p.lat}) 超出范围 lng ${bounds.lng.join('~')} / lat ${bounds.lat.join('~')}`, p.poiId);
    }
  }

  // ---------- C03 / C04 ----------
  for (const { p, kind } of all) {
    if (!isBlank(p.cluster) && !PLACEHOLDER.test(p.cluster) && !clusters.has(p.cluster)) {
      add('error', 'C03', `cluster "${p.cluster}" 不在允许列表里`, p.poiId);
    }
    if (kind === 'ip' && !isBlank(p.tier) && !['S', 'A', 'B'].includes(p.tier)) {
      add('error', 'C04', `tier 非法：${p.tier}`, p.poiId);
    }
  }

  // ---------- C05 / C06 ----------
  for (const { p, kind } of all) {
    // 主题乐园这类要玩一整天的点，上限放到 480
    const [lo, hi] = kind === 'ip' ? [30, 180] : [30, 480];
    if (typeof p.durationNormal !== 'number') add('error', 'C06', 'durationNormal 不是数字', p.poiId);
    else if (p.durationNormal < lo || p.durationNormal > hi) add('error', 'C06', `durationNormal ${p.durationNormal} 超出 ${lo}-${hi}`, p.poiId);
    if (typeof p.durationRush !== 'number') add('error', 'C05', 'durationRush 不是数字', p.poiId);
    else if (typeof p.durationNormal === 'number' && p.durationRush >= p.durationNormal) {
      add('error', 'C05', `durationRush ${p.durationRush} ≥ durationNormal ${p.durationNormal}`, p.poiId);
    }
  }

  // ---------- C07 ----------
  const tierS = data.ipStops.filter((p) => p.tier === 'S');
  const maxS = expect.maxTierS ?? 3;
  if (tierS.length > maxS) {
    add('warn', 'C07', `S 级点位 ${tierS.length} 个，超过上限 ${maxS}：${tierS.map((p) => p.poiId).join(', ')}`);
  }

  // ---------- C08 ----------
  for (const { p } of all) {
    if (typeof p.durationNormal !== 'number' || typeof p.durationRush !== 'number') continue;
    const ratio = p.durationRush / p.durationNormal;
    if (Math.abs(ratio - 0.5) > RUSH_TOLERANCE) {
      add('warn', 'C08', `durationRush 是 normal 的 ${Math.round(ratio * 100)}%，偏离 50% 较多`, p.poiId);
    }
  }

  // ---------- C09 ----------
  const byCluster = {};
  for (const { p } of all) {
    if (isBlank(p.cluster) || PLACEHOLDER.test(p.cluster)) continue;
    (byCluster[p.cluster] ||= []).push(p.poiId);
  }
  for (const [c, ids] of Object.entries(byCluster)) {
    if (ids.length > 4) {
      add('warn', 'C09', `片区「${c}」有 ${ids.length} 个点位。引擎会自动拆到多天，但若想这片一天走完，建议不超过 4 个`);
    }
  }

  // ---------- C10 ----------
  for (const p of data.cityStops) {
    if (typeof p.popularity === 'number' && (p.popularity < 1 || p.popularity > 5)) {
      add('warn', 'C10', `popularity ${p.popularity} 不在 1-5`, p.poiId);
    }
  }

  // ---------- C11 ----------
  // 数据里写 img/x.jpg，文件实际在 public/img/x.jpg（CLI）或 var/content-uploads/（服务端）
  // photos[] 是可选的多图字段；老数据只有 realPhoto 时按单图处理
  if (fileChecker) {
    const photosOf = (p) =>
      Array.isArray(p.photos) && p.photos.length ? p.photos : [p.realPhoto];
    const missingImgs = [
      ...new Set(all.flatMap(({ p }) => photosOf(p)).filter((f) => f && !fileChecker(f))),
    ];
    if (missingImgs.length) {
      const head = missingImgs.slice(0, 3).join('、');
      add(
        'warn',
        'C11',
        `缺少 ${missingImgs.length} 张图片：${head}${missingImgs.length > 3 ? ` 等 ${missingImgs.length - 3} 张` : ''}`
      );
    }
  }

  // ---------- C12 ----------
  const KINDS = ['原著', '台词'];
  for (const p of data.ipStops) {
    (p.quotes ?? []).forEach((q, i) => {
      if (!isBlank(q.kind) && !KINDS.includes(q.kind)) {
        add('error', 'C12', `quotes[${i}].kind = "${q.kind}"，只能是 原著 / 台词`, p.poiId);
      }
    });
  }

  // ---------- C13 ----------
  for (const { p } of all) {
    const list = Array.isArray(p.photos) && p.photos.length ? p.photos : [p.realPhoto]
    if (list[0] !== p.realPhoto) {
      add('warn', 'C13', `photos[0] 与 realPhoto 不一致（首图）：${list[0]} ≠ ${p.realPhoto}`, p.poiId)
    }
    if (new Set(list).size !== list.length) {
      add('warn', 'C13', 'photos 里有重复图片', p.poiId)
    }
  }

  return issues;
}
