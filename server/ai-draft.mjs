// AI 草稿生成：epub 原文提取 → LLM 填《填写模板》→ Photon 地理搜索补坐标
// 红线（写进 prompt）：引文必须逐字摘自喂入原文并标章/集，查不到就留空，绝不编造。
import JSZip from 'jszip'

const MAX_UNZIP_BYTES = 30 * 1024 * 1024
const MAX_FILES = 300
// DeepSeek 64K 上下文：喂入原文控制在 ~12 万字内（可用 AI_MAX_CHARS 调）
const MAX_TEXT_CHARS = Number(process.env.AI_MAX_CHARS || 120000)
const GEOCODE_DELAY_MS = 1100 // Photon 公共实例全实例 1 次/秒，留余量

const hasAiConfig = (env = process.env) => Boolean(env.AI_BASE_URL?.trim() && env.AI_API_KEY?.trim() && env.AI_MODEL?.trim())

// ---------------------------------------------------------------
// epub → 纯文本
// ---------------------------------------------------------------
export async function extractEpub(buffer) {
  let zip
  try { zip = await JSZip.loadAsync(buffer) } catch { throw Object.assign(new Error('EPUB 文件无效'), { status: 400 }) }
  const entries = Object.values(zip.files).filter((f) => !f.dir)
  if (!entries.length || entries.length > MAX_FILES) throw Object.assign(new Error('EPUB 文件无效或条目过多'), { status: 400 })
  let total = 0
  for (const f of entries) {
    total += f._data?.uncompressedSize ?? 0
    if (total > MAX_UNZIP_BYTES) throw Object.assign(new Error('EPUB 解压后过大（>30MB）'), { status: 400 })
  }
  // 找到 OPF（容器描述文件），按 spine 顺序取正文 xhtml
  let opfPath = null
  const container = zip.file('META-INF/container.xml')
  if (container) {
    const xml = await container.async('string')
    opfPath = xml.match(/full-path="([^"]+\.opf)"/i)?.[1] ?? null
  }
  let orderedPaths = null
  if (opfPath) {
    const opf = await zip.file(opfPath)?.async('string')
    if (opf) {
      const manifest = {}
      // 属性顺序不敏感 + 兼容 opf: 命名空间前缀
      for (const tag of opf.matchAll(/<(?:\w+:)?item\b[^>]*>/gi)) {
        const id = tag[0].match(/\bid="([^"]+)"/i)?.[1]
        const href = tag[0].match(/\bhref="([^"]+)"/i)?.[1]
        if (id && href) manifest[id] = href
      }
      const spineIds = [...opf.matchAll(/<(?:\w+:)?itemref\b[^>]*>/gi)]
        .map((t) => t[0].match(/\bidref="([^"]+)"/i)?.[1]).filter(Boolean)
      const base = opfPath.split('/').slice(0, -1).join('/')
      orderedPaths = spineIds.map((id) => manifest[id]).filter(Boolean)
        .map((href) => (base ? `${base}/${href}` : href).replace(/^\.\//, ''))
    }
  }
  const htmlPaths = orderedPaths ?? entries.map((f) => f.name).filter((n) => /\.(x?html?)$/i.test(n)).sort()
  const parts = []
  for (const p of htmlPaths.slice(0, MAX_FILES)) {
    const file = zip.file(p)
    if (!file) continue
    const html = await file.async('string')
    const text = stripHtml(html)
    if (text) parts.push(text)
  }
  // spine 解析失败/路径对不上时，退回扫描全部 xhtml（保持文件名排序近似章节序）
  if (!parts.length) {
    for (const f of entries.filter((e) => /\.(x?html?)$/i.test(e.name)).slice(0, MAX_FILES)) {
      const text = stripHtml(await f.async('string'))
      if (text) parts.push(text)
    }
  }
  const full = parts.join('\n')
  return full.length > MAX_TEXT_CHARS ? full.slice(0, MAX_TEXT_CHARS) + '\n……（原文过长，已截断）' : full
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------
// LLM 调用（OpenAI 兼容 /chat/completions）
// ---------------------------------------------------------------
export async function callLlm(messages, { env = process.env, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${env.AI_BASE_URL.trim().replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(120000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.AI_API_KEY.trim()}` },
    body: JSON.stringify({ model: env.AI_MODEL.trim(), messages, temperature: 0.2, response_format: { type: 'json_object' } }),
  })
  if (!res.ok) throw Object.assign(new Error(`AI 服务返回 HTTP ${res.status}`), { status: 502 })
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw Object.assign(new Error('AI 服务响应为空'), { status: 502 })
  return content
}

/** 从模型输出中提取 JSON 对象（支持 ```json 围栏或直接输出） */
export function parseJsonLoose(content) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? content).trim()
  try { return JSON.parse(candidate) } catch { /* fallthrough */ }
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1))
  throw Object.assign(new Error('AI 输出不是合法 JSON'), { status: 502 })
}

// ---------------------------------------------------------------
// Prompt：填《填写模板》
// ---------------------------------------------------------------
export function buildMessages({ ipName, author, kind, sourceText }) {
  const kindText = { novel: '小说', film: '影视/剧本', poetry: '诗词', history: '史传' }[kind] ?? '小说'
  const system = `你是"圣地巡礼"内容生产助手。用户会喂给你一部${kindText}的原文${ipName ? `《${ipName}》` : ''}，你要产出一份 JSON 文档：把书中/剧中真实出现的地点整理成巡礼点位卡，供旅行规划网站使用。

严格规则（违反任意一条这份文档就作废）：
1. 只收录原文中真实出现的地点；查不到的候选一律不要编。
2. 引文必须逐字摘自喂入的原文（一字不改），并标注出处到章/集。原文里找不到对应原文的地点，quotes 留空数组。绝不自己撰写或改写引文。
3. 台词必须是对话形式（"……" "……"），不能写成叙述。
3.5 虚构地名或现实中查无此处的地点：设置 "filmingLocation" 字段为你所知道的现实取景地/原型地最佳猜测（如某小区的原型），坐标保持 null；完全不知道就留空字符串。
4. 自动划分片区：按城市地理分区（如"黄浦·外滩""静安"这类"区·地标"格式）给每个点位一个 cluster，同一片区的点尽量相邻；把用到的片区放进 clusters 数组。
4.1 已知城市必须原样使用下列标准片区（不要自创），_bounds 用标准坐标范围：
   上海：片区=黄浦·外滩/黄浦·老城厢/黄浦·打浦桥/静安/徐汇·衡复/虹口·北外滩/普陀/浦东/近郊；范围 lng 121.0~121.9 lat 30.6~31.5
   北京：片区=东城·故宫/西城·什刹海/朝阳·三里屯/海淀·中关村/丰台·城南/怀柔·长城/通州·环球影城/密云·古北水镇；范围 lng 115.4~117.5 lat 39.4~41.1
   东京：片区=新宿/涩谷/台东·浅草/千代田·银座/港区·台场/近郊·富士箱根；范围 lng 138.5~140.9 lat 34.9~36.3
   其他已知城市参考：杭州 lng 119.9~120.8 lat 30.1~30.6；桂林 lng 109.5~110.8 lat 24.5~25.9
   完全未知的城市：_bounds 取全市行政范围，片区用「区·地标」格式且覆盖全部点位。
5. 按原文涉及的城市分线：lines 的 key 用城市名（如"上海"）。每个城市一条线，lineId 格式 "<ipId>-<拼音或英文城市名>"，title 为"作品名·城市"。
6. 时长合理：正常游玩 30-180 分钟（IP 点），快速打卡约为其一半。重要度 S 最多 3 个/线。
7. 只输出 JSON，不要任何解释。输出结构（_schema 固定）：
{
  "_schema": "ip-v1",
  "ip": { "ipId": "小写字母数字连字符", "name": "作品名", "author": "作者", "kind": "${kind}", "cover": "", "aliases": ["书中人物名/常见称呼"] },
  "lines": { "<城市名>": {
    "_bounds": { "lng": [经度最小,最大], "lat": [纬度最小,最大] },
    "_expected": { "ipStops": [最少,最多], "cityStops": [10,20], "maxTierS": 3 },
    "line": { "lineId": "...", "ipId": "...", "title": "作品名·城市", "city": "城市名", "cover": "", "recommendDays": 2 },
    "clusters": ["片区1","片区2"],
    "ipStops": [ { "poiId": "<lineId>-ip-01", "lineId": "...", "type": "ip", "name": "现用地名", "alias": "书中叫法或空", "lng": null, "lat": null, "cluster": "片区", "tier": "S|A|B", "durationNormal": 60, "durationRush": 30, "intro": "≤50字介绍", "quotes": [ { "kind": "原著", "brief": "≤20字卡片短句", "full": "80-120字详情长文，逐字摘自原文", "source": "《作品名》第X章" } ], "realPhoto": "", "photos": [], "photoCredit": "", "skipNote": "≤30字放弃理由", "tips": "打卡贴士" } ],
    "cityStops": []
  } }
}
经纬度一律输出 null（系统会自动补）。城市景点不用你生成。`
  const user = `作品信息：${ipName ? `《${ipName}》` : '（未知名称）'}${author ? `，作者：${author}` : ''}\n\n原文：\n${sourceText}`
  return [{ role: 'system', content: system }, { role: 'user', content: user }]
}

// ---------------------------------------------------------------
// 坐标补全：经 8787 /api/places（Photon）。/api/places 要求 lineId 必须是
// 系统已登记的线路，所以按城市在打包数据里找一条同城既有线做上下文，
// AI 自编的 lineId 不直接传给 8787。
// ---------------------------------------------------------------
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export function findContextLineId(city, bundledLinesDir) {
  if (!city || !bundledLinesDir || !existsSync(bundledLinesDir)) return null
  try {
    for (const f of readdirSync(bundledLinesDir)) {
      if (!f.endsWith('.json') || f === 'index.json') continue
      const doc = JSON.parse(readFileSync(join(bundledLinesDir, f), 'utf8'))
      if (doc?.line?.city === city) return doc.line.lineId
    }
  } catch { /* 找不到就跳过定位 */ }
  return null
}

export async function geocodeStops(doc, { fetchImpl = fetch, placesBase = process.env.WISH_BASE_URL || 'http://127.0.0.1:8787', delay = GEOCODE_DELAY_MS, bundledLinesDir = null } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (const line of Object.values(doc.lines ?? {})) {
    const contextLineId = findContextLineId(line.line?.city, bundledLinesDir)
    for (const poi of [...(line.ipStops ?? []), ...(line.cityStops ?? [])]) {
      if (poi.lng != null && poi.lat != null) continue
      const q = (poi.filmingLocation || '').trim() || poi.name
      if (!q || !contextLineId) continue
      try {
        const url = `${placesBase}/api/places?q=${encodeURIComponent(q)}&city=${encodeURIComponent(line.line?.city ?? '')}&lineId=${encodeURIComponent(contextLineId)}`
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) })
        if (res.ok) {
          const data = await res.json()
          const hit = Array.isArray(data) ? data[0] : data?.places?.[0] ?? data?.results?.[0]
          if (hit && typeof hit.lng === 'number' && typeof hit.lat === 'number') {
            poi.lng = hit.lng
            poi.lat = hit.lat
          }
        }
      } catch { /* 定位失败留空，进取景地人工环节 */ }
      await sleep(delay)
    }
  }
  return doc
}

// ---------------------------------------------------------------
// 入口：配置检查 → 提取 → LLM → 解析 → 坐标补全
// ---------------------------------------------------------------
export async function generateDraft({ ipName, author, kind, epub, sourceText }, { env = process.env, fetchImpl = fetch, bundledLinesDir = null } = {}) {
  if (!hasAiConfig(env)) throw Object.assign(new Error('AI 服务未接入'), { status: 501 })
  let text = (sourceText ?? '').trim()
  if (epub) {
    const buffer = Buffer.from(epub, 'base64')
    if (!buffer.length) throw Object.assign(new Error('EPUB 内容为空'), { status: 400 })
    text = (await extractEpub(buffer)) || text
  }
  if (!text) throw Object.assign(new Error('请提供 epub 文件或粘贴原文'), { status: 400 })
  const content = await callLlm(buildMessages({ ipName, author, kind, sourceText: text }), { env, fetchImpl })
  const doc = parseJsonLoose(content)
  if (!doc || typeof doc !== 'object' || !doc.ip || !doc.lines) throw Object.assign(new Error('AI 输出结构不符合 IP 文档契约'), { status: 502 })
  doc._schema = 'ip-v1'
  await geocodeStops(doc, { fetchImpl, bundledLinesDir })
  return doc
}

export { hasAiConfig }
