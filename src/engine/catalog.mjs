// 首页目录层 —— 纯函数、零依赖，浏览器和 Node 都能直接跑。
// 输入是 data/lines/index.json + 各条线的 data/lines/*.json，输出是首页要的东西。
// 不读文件、不访问网络：读文件那步由调用方（demo / 前端 fetch）负责。

export const SECTIONS = [{ key: '城市', label: '城市' }];

// 搜不到时首页显示的原话，不要改
export const EMPTY_SEARCH_HINT = '抱歉，暂时未收录该圣地巡礼内容';

const PLACEHOLDER = /【[^】]*】/;
const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

// ---------------------------------------------------------------
// 数据就绪度：这一条线能不能点进去
// 卡片元数据（标题 / 城市 / 别名）齐了就能上首页；
// 但要点进 S3 定制页，点位必须填够。
// ---------------------------------------------------------------
export const pointReady = (p) =>
  !blank(p.name) &&
  !PLACEHOLDER.test(p.name) &&
  typeof p.lng === 'number' &&
  typeof p.lat === 'number' &&
  !blank(p.cluster) &&
  !PLACEHOLDER.test(p.cluster);

export const quoteReady = (q) => !!q && !blank(q.source) && !blank(q.full);

export function lineReadiness(doc = {}) {
  const ipStops = doc.ipStops ?? [];
  const cityStops = doc.cityStops ?? [];
  const ipDone = ipStops.filter((p) => pointReady(p) && (p.quotes ?? []).some(quoteReady)).length;
  const spDone = cityStops.filter(pointReady).length;
  const missing = [];
  if (ipDone < ipStops.length) missing.push(`IP 点位 ${ipDone}/${ipStops.length}`);
  if (spDone < cityStops.length) missing.push(`城市景点 ${spDone}/${cityStops.length}`);
  return {
    ipDone,
    ipTotal: ipStops.length,
    spDone,
    spTotal: cityStops.length,
    ready: ipStops.length > 0 && cityStops.length > 0 && missing.length === 0,
    missing,
  };
}

// ---------------------------------------------------------------
// 卡片
// ---------------------------------------------------------------
export function toCard(line, sectionKey, doc) {
  const r = doc ? lineReadiness(doc) : null;
  return {
    lineId: line.lineId,
    title: line.title,                 // 「繁花·上海」
    city: line.city,
    ipName: line.ipName,
    cover: line.cover,
    coverText: { title: line.title, city: line.city },
    matched: line.tags?.[sectionKey] ?? [],
    ready: r?.ready ?? false,
    note: r && !r.ready ? `数据筹备中（${r.missing.join(' · ')}）` : null,
  };
}

// ---------------------------------------------------------------
// 首页 S1：只按城市一栏，前 N 组 + 省略号；同一城市的线路在同一组里
// ---------------------------------------------------------------
export function buildHomepage(index, docsById = {}, { perSection = 3 } = {}) {
  const lines = [...(index.lines ?? [])].sort((a, b) => a.priority - b.priority);
  const sections = SECTIONS.map(({ key, label }) => {
    const hit = lines.filter((l) => (l.tags?.[key] ?? []).length > 0);
    return {
      key,
      label,
      cards: hit.slice(0, perSection).map((l) => toCard(l, key, docsById[l.lineId])),
      omitted: Math.max(0, hit.length - perSection),
      total: hit.length,
    };
  });
  return { primary: index._primary, sections };
}

// ---------------------------------------------------------------
// 搜索：线路名 > 别名 > 人物/地名标签 > 点位名
// ---------------------------------------------------------------
export function searchLines(query, index, docsById = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  const hits = [];

  for (const l of index.lines ?? []) {
    const reasons = [];
    if (l.title.toLowerCase().includes(q)) reasons.push({ field: '线路名', score: 100 });
    if ((l.aliases ?? []).some((a) => String(a).toLowerCase().includes(q))) {
      reasons.push({ field: '别名', score: 80 });
    }
    for (const [key, list] of Object.entries(l.tags ?? {})) {
      if (list.some((t) => String(t).toLowerCase().includes(q))) {
        reasons.push({ field: `${key}标签`, score: 60 });
      }
    }
    const doc = docsById[l.lineId];
    const all = [...(doc?.ipStops ?? []), ...(doc?.cityStops ?? [])];
    const poiHit = all.find((p) => !blank(p.name) && p.name.toLowerCase().includes(q));
    if (poiHit) reasons.push({ field: `点位「${poiHit.name}」`, score: 40 });

    if (!reasons.length) continue;
    const score = Math.max(...reasons.map((r) => r.score));
    hits.push({
      lineId: l.lineId,
      title: l.title,
      city: l.city,
      cover: l.cover,
      score,
      reasons: reasons.map((r) => r.field),
      ready: doc ? lineReadiness(doc).ready : false,
    });
  }

  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------
// 喂给行程引擎：把用户勾的编号变成 plan() 要的形状
// ---------------------------------------------------------------
export function toPlanInput(doc, { poiIds, ipIds = [], spIds = [] } = {}) {
  const ipStops = doc.ipStops ?? [];
  const cityStops = doc.cityStops ?? [];
  const wantIp = poiIds ? poiIds.filter((id) => ipStops.some((p) => p.poiId === id)) : ipIds;
  const wantSp = poiIds ? poiIds.filter((id) => cityStops.some((p) => p.poiId === id)) : spIds;
  return {
    pois: [
      ...ipStops.filter((p) => wantIp.includes(p.poiId)),
      ...cityStops.filter((p) => wantSp.includes(p.poiId)),
    ],
    allPois: [...ipStops, ...cityStops],
  };
}
