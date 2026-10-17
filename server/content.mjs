// 内容服务 v2 —— 管理单元是 IP（作品）：草稿/上架/下架以 IP 为单位，
// 对外 /api/content/lines 仍输出引擎消费的 line doc（用户侧形状不变）。
// 管理鉴权：把 Cookie 转发给 auth 服务（:8788）校验 role=admin，5 秒 TTL 缓存。
import './env.mjs'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile, rename, copyFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { aggregateBundledIps } from './content-store.mjs'
import { createContentValidator } from './content-validate.mjs'
import { generateDraft, hasAiConfig, findContextLineId } from './ai-draft.mjs'
import { fetchCandidates } from './fetch-photos.mjs'

const JPEG_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/
const checkJpeg = (buffer) => buffer.length >= 100 && buffer.length <= 3 * 1024 * 1024 && buffer[0] === 255 && buffer[1] === 216 && buffer[buffer.length - 2] === 255 && buffer[buffer.length - 1] === 217
const ID_RE = /^[a-z0-9][a-z0-9-]{0,99}$/

export function createContentServer({
  store,
  validator = createContentValidator(),
  authBase = process.env.AUTH_BASE_URL || 'http://127.0.0.1:8788',
  origin = process.env.CONTENT_ORIGIN || 'http://127.0.0.1:8789',
  uploadsDir = resolve(process.env.CONTENT_UPLOADS_DIR || 'var/content-uploads'),
  submissionsDir = resolve(process.env.POI_SUBMISSIONS_DIR || 'var/poi-submissions'),
  bundledLinesDir = resolve(process.env.BUNDLED_LINES_DIR || 'data/lines'),
  cityPoolDir = resolve(process.env.CITY_POOL_DIR || 'data/cities'),
  wishAdminToken = process.env.WISH_ADMIN_TOKEN || '',
  fetchImpl = fetch,
} = {}) {
  if (!store) throw new Error('Content store required')
  const expectedOrigin = new URL(origin).origin
  const sessionCache = new Map()
  const SESSION_TTL = 5000
  async function adminUser(req) {
    const cookie = req.headers.cookie
    if (!cookie) return null
    const cached = sessionCache.get(cookie)
    if (cached && Date.now() - cached.at < SESSION_TTL) return cached.user.role === 'admin' ? cached.user : null
    let user = null
    try {
      const res = await fetchImpl(`${authBase}/api/auth/session`, { headers: { cookie }, signal: AbortSignal.timeout(5000) })
      if (res.ok) user = (await res.json()).user ?? null
    } catch { return null }
    sessionCache.set(cookie, { user, at: Date.now() })
    if (sessionCache.size > 5000) sessionCache.clear()
    return user && user.role === 'admin' ? user : null
  }
  async function bodyJSON(req, max = 25 * 1024 * 1024) {
    let size = 0; const chunks = []
    for await (const chunk of req) { size += chunk.length; if (size > max) { req.resume(); throw Object.assign(new Error('内容过大'), { status: 413 }) } chunks.push(chunk) }
    if (!size) return null
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw Object.assign(new Error('JSON 格式错误'), { status: 400 }) }
  }
  function bundledIps() {
    try { return aggregateBundledIps(bundledLinesDir) } catch { return new Map() }
  }
  /** 目标 IP 若在内容库没有记录，先把打包数据聚合成 IP doc 导入为草稿 */
  async function ensureIp(ipId, actor) {
    let ip = store.getIp(ipId)
    if (ip) return ip
    const bundled = bundledIps()
    if (!bundled.has(ipId)) throw Object.assign(new Error('IP 不存在'), { status: 404 })
    return store.createIp({ ipId, doc: bundled.get(ipId).doc, status: 'draft', actor })
  }
  /** 在 IP doc 内按 lineId 找到城市线 */
  function findLine(doc, lineId) {
    for (const [cityKey, line] of Object.entries(doc.lines ?? {})) {
      if (line?.line?.lineId === lineId) return { cityKey, line }
    }
    return null
  }
  /** 从投稿记录生成草稿 POI 并追加到 IP doc 对应城市线 */
  async function promoteSubmission(submissionId, lineId, actor) {
    const row = JSON.parse(await readFile(join(submissionsDir, `${submissionId}.json`), 'utf8').catch(() => { throw Object.assign(new Error('投稿不存在'), { status: 404 }) }))
    if (row.lineId !== lineId) throw Object.assign(new Error('投稿不属于该线路'), { status: 400 })
    let owner = null
    for (const ip of store.listIps()) {
      if (findLine(ip.doc, lineId)) { owner = ip; break }
    }
    const ip = owner ?? await ensureIp(row.ipId ?? guessIpId(lineId), actor)
    const found = findLine(ip.doc, lineId)
    if (!found) throw Object.assign(new Error('线路不存在'), { status: 404 })
    const photos = []
    const folder = join(submissionsDir, submissionId)
    if (existsSync(folder)) {
      const files = (await readdir(folder)).filter((f) => f.endsWith('.jpg')).sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]))
      for (const f of files) {
        const name = `promote-${submissionId}-${f}`
        await copyFile(join(folder, f), join(uploadsDir, name))
        photos.push(`/api/content/img/${name}`)
      }
    }
    const line = found.line
    const seq = [...(line.ipStops ?? []), ...(line.cityStops ?? [])].length + 1
    const poi = {
      poiId: `${lineId}-${row.type === 'ip' ? 'ip' : 'sp'}-x-${String(seq).padStart(2, '0')}`,
      lineId, type: row.type,
      name: row.place?.name ?? '', alias: row.alias ?? '',
      lng: row.place?.lng, lat: row.place?.lat,
      cluster: '',
      tier: row.type === 'ip' ? '' : undefined,
      popularity: row.type === 'classic' ? 0 : undefined,
      durationNormal: 0, durationRush: 0,
      intro: row.intro ?? '', quotes: [],
      realPhoto: photos[0] ?? '', photos,
      photoCredit: '用户投稿（已获使用授权确认）', skipNote: '',
      locationDetail: row.locationDetail ?? '', tips: row.tips ?? '',
      promotedFrom: submissionId,
    }
    if (row.type === 'ip') line.ipStops = [...(line.ipStops ?? []), poi]
    else line.cityStops = [...(line.cityStops ?? []), poi]
    const saved = store.saveIp(ip.ipId, ip.doc, actor)
    store.audit(actor, 'poi.promote', `ip:${ip.ipId}`, `submission=${submissionId},poi=${poi.poiId},line=${lineId}`)
    if (wishAdminToken) {
      try {
        await fetchImpl(`http://127.0.0.1:8787/api/poi-submissions/${submissionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wishAdminToken}` },
          body: JSON.stringify({ status: '待收录', reviewNote: `已转为路线点位草稿（${poi.poiId}）` }),
          signal: AbortSignal.timeout(5000),
        })
      } catch { /* 回写失败不阻塞转正，后台可手动补记 */ }
    }
    return { ip: saved, poi }
  }
  /** lineId → ipId 兜底推测（打包数据未覆盖时基本不会走到） */
  function guessIpId(lineId) {
    const bundled = bundledIps()
    for (const [ipId, ip] of bundled) if (findLine(ip.doc, lineId)) return ipId
    throw Object.assign(new Error('无法确定投稿所属 IP'), { status: 400 })
  }

  return createServer(async (req, res) => {
    const reply = (code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }); res.end(JSON.stringify(body)) }
    try {
      const url = new URL(req.url, expectedOrigin)
      const path = url.pathname

      // ---------- 公开：在线内容（拆线输出，用户侧形状不变）----------
      if (path === '/api/content/lines' && req.method === 'GET') {
        return reply(200, { generatedAt: Date.now(), lines: store.onlineLines(), hidden: store.hiddenLineIds() }, { 'Cache-Control': 'public, max-age=60' })
      }
      const imgMatch = path.match(/^\/api\/content\/img\/([A-Za-z0-9._-]{1,120})$/)
      if (imgMatch && req.method === 'GET') {
        const file = join(uploadsDir, imgMatch[1])
        if (!file.startsWith(uploadsDir) || !existsSync(file)) return reply(404, { error: '图片不存在' })
        const bytes = await readFile(file)
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' })
        return res.end(bytes)
      }
      // ---------- 管理接口（admin cookie）----------
      if (path.startsWith('/api/manage/content/')) {
        const user = await adminUser(req)
        if (!user) return reply(req.headers.cookie ? 403 : 401, { error: req.headers.cookie ? '没有管理员权限' : '请先登录' })
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (req.headers.origin && req.headers.origin !== expectedOrigin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return reply(403, { error: '请求来源不允许' })
          if (!req.headers['content-type']?.startsWith('application/json') && req.method !== 'DELETE') return reply(415, { error: '需要 JSON 格式' })
        }
        const actor = user.id

        // 图片上传（不变）
        if (path === '/api/manage/content/img' && req.method === 'POST') {
          const body = await bodyJSON(req)
          if (typeof body?.dataUrl !== 'string' || !JPEG_RE.test(body.dataUrl)) return reply(400, { error: '照片格式无效（仅 JPEG）' })
          const buffer = Buffer.from(body.dataUrl.split(',')[1], 'base64')
          if (!checkJpeg(buffer)) return reply(400, { error: '照片无效或过大（≤3MB JPEG）' })
          await mkdir(uploadsDir, { recursive: true, mode: 0o700 })
          const name = `${randomUUID()}.jpg`
          await writeFile(join(uploadsDir, name + '.tmp'), buffer, { mode: 0o600 })
          await rename(join(uploadsDir, name + '.tmp'), join(uploadsDir, name))
          return reply(201, { url: `/api/content/img/${name}` })
        }
        // 一键转正
        if (path === '/api/manage/content/promote' && req.method === 'POST') {
          const body = await bodyJSON(req)
          if (typeof body?.submissionId !== 'string' || !/^P-[a-f0-9-]{30,40}$/.test(body.submissionId)) return reply(400, { error: '投稿编号无效' })
          if (typeof body?.lineId !== 'string' || !ID_RE.test(body.lineId)) return reply(400, { error: '线路无效' })
          try { return reply(200, await promoteSubmission(body.submissionId, body.lineId, actor)) }
          catch (error) { return reply(error.status || 500, { error: error.message || '转正失败' }) }
        }
        // 审计日志（不变）
        if (path === '/api/manage/content/audit' && req.method === 'GET') {
          const raw = url.searchParams.get('before')
          const before = raw === null ? Number.MAX_SAFE_INTEGER : Number(raw)
          if (!Number.isSafeInteger(before) || before < 1) return reply(400, { error: '分页参数不正确' })
          return reply(200, store.listAudit(before))
        }
        // 同城已确认城市景点快照：优先内容库，其次打包数据（AI 生成城市共享池为后续版本预留）
        if (path === '/api/manage/content/city-stops' && req.method === 'GET') {
          const city = (url.searchParams.get('city') || '').trim()
          if (!/^[\p{L}\p{N}·-]{1,30}$/u.test(city)) return reply(400, { error: '城市名无效' })
          const sources = [...store.listIps(), ...bundledIps().values()]
          let best = null
          for (const ip of sources) {
            for (const line of Object.values(ip.doc?.lines ?? {})) {
              const stops = line.cityStops ?? []
              if (line.line?.city === city && stops.length && (!best || stops.length > best.stops.length)) {
                best = { lineId: line.line.lineId, title: line.line.title, source: ip.status === 'bundled' ? '打包数据' : `IP：${ip.doc?.ip?.name ?? ip.ipId}`, stops }
              }
            }
          }
          return reply(200, best ?? { stops: [] })
        }
        // 城市景点共享池（向导第③步数据源）：文件名是拼音，按文件内 city 字段匹配中文城市名
        if (path === '/api/manage/content/city-pool' && req.method === 'GET') {
          const city = (url.searchParams.get('city') || '').trim()
          if (!/^[\p{L}\p{N}·-]{1,30}$/u.test(city)) return reply(400, { error: '城市名无效' })
          try {
            const files = (await readdir(cityPoolDir)).filter((f) => f.endsWith('.json'))
            for (const f of files) {
              try {
                const pool = JSON.parse(await readFile(join(cityPoolDir, f), 'utf8'))
                if (pool.city === city || f === `${city}.json`) return reply(200, { city: pool.city ?? city, spots: Array.isArray(pool.spots) ? pool.spots : [] })
              } catch { /* 跳过坏文件 */ }
            }
            return reply(200, { city, spots: [] })
          } catch { return reply(200, { city, spots: [] }) }
        }
        // 取景地定位：单个查坐标（{city,name}）或批量回填 IP 内全部无坐标点位（{ipId,cityKey}）
        if (path === '/api/manage/content/geocode' && req.method === 'POST') {
          const body = await bodyJSON(req)
          const placesBase = process.env.WISH_BASE_URL || 'http://127.0.0.1:8787'
          // 单个查询：返回首个候选，前端回填
          if (typeof body?.city === 'string' && typeof body?.name === 'string' && body.name.trim()) {
            const contextLineId = findContextLineId(body.city.trim(), bundledLinesDir)
            if (!contextLineId) return reply(400, { error: `「${body.city.trim()}」暂无系统已登记的线路可作定位上下文，请用地图选点` })
            try {
              const res = await fetchImpl(`${placesBase}/api/places?q=${encodeURIComponent(body.name.trim())}&city=${encodeURIComponent(body.city.trim())}&lineId=${encodeURIComponent(contextLineId)}`, { signal: AbortSignal.timeout(8000) })
              if (!res.ok) return reply(502, { error: '地点搜索服务暂不可用' })
              const data = await res.json()
              const list = Array.isArray(data) ? data : (data?.places ?? data?.results ?? [])
              if (!list.length) return reply(404, { error: '未找到该地点，换个名字试试（如"王府井教堂"→"王府井天主教堂"）' })
              return reply(200, { place: list[0] })
            } catch { return reply(502, { error: '地点搜索服务暂不可用' }) }
          }
          // 批量回填
          if (typeof body?.ipId === 'string' && ID_RE.test(body.ipId)) {
            try {
              const ipRow = store.getIp(body.ipId) ?? await ensureIp(body.ipId, actor)
              const doc = ipRow.doc
              const line = doc.lines[typeof body?.cityKey === 'string' ? body.cityKey : Object.keys(doc.lines)[0]]
              if (!line) return reply(404, { error: '城市线不存在' })
              const contextLineId = findContextLineId(line.line?.city, bundledLinesDir)
              if (!contextLineId) return reply(400, { error: `「${line.line?.city}」暂无定位上下文线路，请用地图选点` })
              const located = {}
              const missing = []
              for (const poi of [...(line.ipStops ?? []), ...(line.cityStops ?? [])]) {
                if (poi.lng != null && poi.lat != null) continue
                const q = (poi.filmingLocation || '').trim() || poi.name
                if (!q) { missing.push(poi.name || poi.poiId); continue }
                try {
                  const res = await fetchImpl(`${placesBase}/api/places?q=${encodeURIComponent(q)}&city=${encodeURIComponent(line.line.city)}&lineId=${encodeURIComponent(contextLineId)}`, { signal: AbortSignal.timeout(8000) })
                  const data = res.ok ? await res.json() : []
                  const list = Array.isArray(data) ? data : (data?.places ?? data?.results ?? [])
                  const hit = list[0]
                  if (hit && typeof hit.lng === 'number' && typeof hit.lat === 'number') {
                    poi.lng = hit.lng; poi.lat = hit.lat
                    if (hit.address && !poi.locationDetail) poi.locationDetail = hit.address
                    located[poi.poiId] = { lng: hit.lng, lat: hit.lat, address: hit.address ?? '' }
                  } else missing.push(poi.name || q)
                } catch { missing.push(poi.name || q) }
                await new Promise((r) => setTimeout(r, 1000))
              }
              if (Object.keys(located).length) { store.saveIp(body.ipId, doc, actor); store.audit(actor, 'ip.geocode', `ip:${body.ipId}`, `located=${Object.keys(located).length},missing=${missing.length}`) }
              return reply(200, { located, missing })
            } catch (error) { return reply(error.status || 500, { error: error.message }) }
          }
          return reply(400, { error: '参数不正确（需要 {city,name} 或 {ipId}）' })
        }
        // Commons 自动抓图：缺图点位抓候选回填 realPhoto/photos/photoCredit（人工可再改）
        if (path === '/api/manage/content/fetch-photos' && req.method === 'POST') {
          const body = await bodyJSON(req)
          const targetIpId = typeof body?.ipId === 'string' && ID_RE.test(body.ipId) ? body.ipId : null
          if (!targetIpId) return reply(400, { error: 'ipId 无效' })
          try {
            const ipRow = store.getIp(targetIpId) ?? await ensureIp(targetIpId, actor)
            const doc = ipRow.doc
            const cityKeys = Object.keys(doc.lines ?? {})
            const cityKey = typeof body?.cityKey === 'string' && doc.lines[body.cityKey] ? body.cityKey : cityKeys[0]
            const line = doc.lines[cityKey]
            if (!line) return reply(404, { error: '城市线不存在' })
            const targets = []
            if (typeof body?.poiId === 'string') {
              const poi = [...(line.ipStops ?? []), ...(line.cityStops ?? [])].find((p) => p.poiId === body.poiId)
              if (!poi) return reply(404, { error: '点位不存在' })
              targets.push({ key: poi.poiId, name: poi.name, city: line.line.city })
            } else {
              // 只抓点位照片；封面（书籍封面/线路封面）不抓，留人工上传
              for (const poi of [...(line.ipStops ?? []), ...(line.cityStops ?? [])]) {
                if (!poi.realPhoto) targets.push({ key: poi.poiId, name: poi.name, city: line.line.city })
              }
            }
            if (!targets.length) return reply(200, { filled: {}, failed: [], message: '没有缺图的点位' })
            await mkdir(uploadsDir, { recursive: true, mode: 0o700 })
            const writeUpload = async (dir, name, buf) => {
              await writeFile(join(dir, name + '.tmp'), buf, { mode: 0o600 })
              await rename(join(dir, name + '.tmp'), join(dir, name))
            }
            const { filled, failed } = await fetchCandidates(targets, { uploadsDir, writeFile: writeUpload, fetchImpl })
            // 回填文档
            const fillPoi = (poi) => {
              const f = filled[poi.poiId]
              if (!f) return
              poi.photos = [...(poi.photos ?? []), ...f.photos]
              if (!poi.realPhoto) poi.realPhoto = f.photos[0]
              poi.photoCredit = [poi.photoCredit, f.credit].filter(Boolean).join('；')
            }
            for (const poi of [...(line.ipStops ?? []), ...(line.cityStops ?? [])]) fillPoi(poi)
            store.saveIp(targetIpId, doc, actor)
            store.audit(actor, 'ip.fetch-photos', `ip:${targetIpId}`, `filled=${Object.keys(filled).length},failed=${failed.length}`)
            return reply(200, { filled, failed })
          } catch (error) { return reply(error.status || 500, { error: error.message || '抓图失败' }) }
        }
        // AI 填充：epub/原文 → LLM 填模板 → 自动补坐标
        if (path === '/api/manage/content/ai/draft' && req.method === 'POST') {
          if (!hasAiConfig()) return reply(501, { error: 'AI 服务未接入' })
          try {
            const body = await bodyJSON(req, 30 * 1024 * 1024)
            const doc = await generateDraft({ ipName: body?.ipName, author: body?.author, kind: body?.kind, epub: body?.epub, sourceText: body?.sourceText }, { fetchImpl, bundledLinesDir })
            const errors = validator.validateDraft(doc)
            if (errors.length) return reply(422, { error: 'AI 生成结果未通过结构校验，请手工调整', issues: errors })
            return reply(200, { doc })
          } catch (error) {
            return reply(error.status || 502, { error: error.status ? error.message : 'AI 服务调用失败' })
          }
        }
        // IP 集合
        if (path === '/api/manage/content/ips') {
          if (req.method === 'GET') {
            const inDb = new Set(store.listIps().map((ip) => ip.ipId))
            const bundled = [...bundledIps().values()].filter((ip) => !inDb.has(ip.ipId))
            return reply(200, { ips: [...store.listIps(), ...bundled] })
          }
          if (req.method === 'POST') {
            const body = await bodyJSON(req)
            const doc = body?.doc
            const ipId = doc?.ip?.ipId
            if (!doc || typeof doc !== 'object' || !ID_RE.test(ipId ?? '')) return reply(400, { error: 'doc 格式不正确（缺少 ip.ipId）' })
            const errors = validator.validateDraft(doc)
            if (errors.length) return reply(422, { error: 'IP 数据未通过校验', issues: errors })
            try { return reply(201, { ip: store.createIp({ ipId, doc, status: body.status === 'online' ? 'online' : 'draft', actor }) }) }
            catch (error) { return reply(400, { error: error.message }) }
          }
          return reply(405, { error: '请求方法不支持' })
        }
        const ipMatch = path.match(/^\/api\/manage\/content\/ips\/([a-z0-9][a-z0-9-]{0,99})(?:\/(status))?$/)
        if (ipMatch) {
          const ipId = ipMatch[1]
          const sub = ipMatch[2]
          if (!sub && req.method === 'GET') {
            const ip = store.getIp(ipId)
            if (ip) return reply(200, { ip })
            const bundled = bundledIps()
            if (bundled.has(ipId)) return reply(200, { ip: bundled.get(ipId) })
            return reply(404, { error: 'IP 不存在' })
          }
          if (!sub && req.method === 'PUT') {
            const body = await bodyJSON(req)
            const doc = body?.doc
            if (!doc || typeof doc !== 'object' || doc.ip?.ipId !== ipId) return reply(400, { error: 'doc 与 IP 不一致' })
            const errors = validator.validateDraft(doc)
            if (errors.length) return reply(422, { error: 'IP 数据未通过校验', issues: errors })
            try {
              await ensureIp(ipId, actor)
              return reply(200, { ip: store.saveIp(ipId, doc, actor) })
            } catch (error) { return reply(error.status || 400, { error: error.message }) }
          }
          if (sub === 'status' && req.method === 'PATCH') {
            const body = await bodyJSON(req)
            try {
              if (body?.status === undefined) return reply(400, { error: '参数不正确' })
              const cityKeys = Array.isArray(body?.cityKeys) && body.cityKeys.length ? body.cityKeys.filter((k) => typeof k === 'string') : null
              if (body.status === 'online') {
                const doc = store.getIp(ipId)?.doc ?? (await ensureIp(ipId, actor)).doc
                const errors = validator.validatePublish(doc, cityKeys)
                if (errors.length) return reply(422, { error: '上架前必须修复以下错误', issues: errors })
              }
              return reply(200, { ip: store.setStatus(ipId, body.status, { cityKeys, actor }) })
            } catch (error) { return reply(error.status || 400, { error: error.message }) }
          }
          if (!sub && req.method === 'DELETE') {
            try { store.deleteIp(ipId, actor); return reply(200, { ok: true }) }
            catch (error) { return reply(400, { error: error.message }) }
          }
          return reply(405, { error: '请求方法不支持' })
        }
        return reply(404, { error: '接口不存在' })
      }
      return reply(404, { error: '接口不存在' })
    } catch (error) {
      return reply(error.status || 500, { error: error.status ? error.message : '服务暂不可用' })
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.CONTENT_PORT || 8789)
  const { createContentStore } = await import('./content-store.mjs')
  const store = createContentStore({ file: resolve(process.env.CONTENT_DATA_FILE || 'var/content.sqlite') })
  const server = createContentServer({ store, origin: process.env.CONTENT_ORIGIN || `http://127.0.0.1:${port}` })
  server.listen(port, '127.0.0.1', () => console.log(`Content API: http://127.0.0.1:${port}`))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0) }))
}
