import './env.mjs'
import { createRecommendationHandler } from './recommendation.mjs'
import { createPoiHandler } from './poi-submissions.mjs'
import { createServer } from 'node:http'
import { mkdir, readFile, appendFile, writeFile, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID, timingSafeEqual, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const styles = new Set(['经典打卡','深度探索','同款美食','轻松散步','拍照出片'])
const STATUS = ['待整理','筹备中','已收录','已拒绝']
const STATUSES = new Set(STATUS)
function validate(body) {
  const str = (key, max) => { const v = body[key] ?? ''; if (typeof v !== 'string' || v.length > max) throw Error('字段格式错误'); return v.trim() }
  const ip = str('ip',100), requestId = str('requestId',80)
  if (!ip || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw Error('作品或请求编号无效')
  if (!Array.isArray(body.points) || body.points.length > 20 || body.points.some(v => typeof v !== 'string' || !v.trim() || v.length > 100)) throw Error('打卡点格式错误')
  if (!Array.isArray(body.styles) || body.styles.length > 5 || body.styles.some(v => !styles.has(v))) throw Error('巡礼方式无效')
  const email = body.notify === true ? str('email',254) : ''
  if (body.notify === true && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('邮箱格式错误')
  return { requestId, ip, city: body.uncertain === true ? '' : str('city',150), uncertain: body.uncertain === true, points: [...new Set(body.points.map(v => v.trim()))], scene: str('scene',1000), styles: [...new Set(body.styles)], clues: str('clues',2000), notify: body.notify === true, email }
}
// 反代（nginx）之后 socket 地址恒为 127.0.0.1，必须优先取转发头；直连（本地开发）回落 socket 地址。
// 注意：仅当 8787 不暴露公网、只经可信 nginx 转发时才信任这些头。
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  return (req.headers['x-real-ip'] || (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket.remoteAddress || '').trim()
}
const likeSalt = process.env.WISH_LIKE_SALT || 'pilgrimage-wish-like-v1'
const ipHash = ip => createHash('sha256').update(ip + '\0' + likeSalt).digest('hex')
export async function createWishServer({ file = resolve('var/wishes.jsonl'), adminToken = process.env.WISH_ADMIN_TOKEN, allowedOrigins = (process.env.WISH_ALLOWED_ORIGINS || 'http://localhost:5178,http://127.0.0.1:5178,http://localhost:5173,http://localhost:4173,http://localhost:5198').split(','), authBaseUrl = process.env.AUTH_BASE_URL || 'http://127.0.0.1:8788', fetchImpl = fetch } = {}) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 })
  const records = new Map()
  try { for (const line of (await readFile(file,'utf8')).split('\n').filter(Boolean)) { const row = JSON.parse(line); row.likes = row.likes || 0; row.likedBy = Array.isArray(row.likedBy) ? row.likedBy : []; records.set(row.requestId,row) } } catch(e) { if (e.code !== 'ENOENT') throw e }
  let queue = Promise.resolve()
  const limits = new Map()
  // 全量重写落盘。writeAll 是裸写（调用方必须已在 queue 内）；persist 供 queue 外调用
  const writeAll = () => writeFile(file + '.tmp', [...records.values()].map(r => JSON.stringify(r)).join('\n') + '\n', { mode: 0o600 }).then(() => rename(file + '.tmp', file))
  const persist = () => { const task = queue.then(writeAll); queue = task.catch(() => {}); return task }
  const byId = id => { for (const row of records.values()) if (row.id === id) return row; return null }
  const groupKey = row => `${row.ip.trim().toLowerCase()}\0${row.city.trim().toLowerCase()}`
  // 公开榜单：脱敏（无 email/requestId/notify/likedBy/status），按 ip+city 分组
  const board = () => {
    const groups = new Map()
    for (const row of records.values()) {
      const key = groupKey(row)
      const group = groups.get(key) || { ip: row.ip, city: row.city || '城市待定', count: 0, likes: 0, lastAt: '', topPoints: new Map(), wishes: [] }
      group.count++; group.likes += row.likes
      if (row.createdAt > group.lastAt) group.lastAt = row.createdAt
      for (const p of row.points) group.topPoints.set(p, (group.topPoints.get(p) || 0) + 1)
      group.wishes.push({ id: row.id, points: row.points, scene: row.scene, styles: row.styles, likes: row.likes, createdAt: row.createdAt })
      groups.set(key, group)
    }
    return [...groups.values()].map(g => ({ ip: g.ip, city: g.city, count: g.count, likes: g.likes, lastAt: g.lastAt, topPoints: [...g.topPoints.entries()].sort((a,b) => b[1]-a[1]).slice(0,3).map(([name]) => name), wishes: g.wishes.sort((a,b) => b.likes - a.likes) }))
  }
  const poiHandler = await createPoiHandler({ directory: resolve(dirname(file), 'poi-submissions'), adminToken, allowedOrigins, cookieAdmin: (req) => cookieRoleAdmin(req) })
  const recommendationHandler = await createRecommendationHandler({ allowedOrigins })
  // admin 会话缓存：cookie → 是否 admin，5 秒 TTL（转发给 auth 服务校验）
  const sessionCache = new Map()
  async function cookieRoleAdmin(req) {
    const cookie = req.headers.cookie
    if (!cookie) return false
    const cached = sessionCache.get(cookie)
    if (cached && Date.now() - cached.at < 5000) return cached.ok
    let ok = false
    try {
      const res = await fetchImpl(`${authBaseUrl}/api/auth/session`, { headers: { cookie }, signal: AbortSignal.timeout(5000) })
      if (res.ok) ok = (await res.json()).user?.role === 'admin'
    } catch { ok = false }
    sessionCache.set(cookie, { ok, at: Date.now() })
    if (sessionCache.size > 5000) sessionCache.clear()
    return ok
  }
  return createServer(async (req,res) => {
    if (await recommendationHandler(req,res)) return
    if (await poiHandler(req,res)) return
    const reply = (code,body) => { res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(JSON.stringify(body)) }
    const path = new URL(req.url,'http://localhost').pathname
    const ip = clientIp(req)
    const now = Date.now()
    for (const [k,v] of limits) if (now-v.start > 60000) limits.delete(k)
    const rate = limits.get(ip) || { start:now, count:0 }; limits.set(ip,rate)
    // 只对写操作限流（提交/点赞）；浏览榜单等 GET 不计数
    const throttle = () => ++rate.count > 20
    const bearerAdmin = () => { const token = req.headers.authorization || '', expected = `Bearer ${adminToken}`; return adminToken && Buffer.byteLength(token) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(token), Buffer.from(expected)) }
    const admin = async () => bearerAdmin() || await cookieRoleAdmin(req)
    if (path === '/api/wishes' && req.method === 'POST') {
      const origin = req.headers.origin
      if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}` && !allowedOrigins.includes(origin)) return reply(403,{error:'origin'})
      if (throttle()) return reply(429,{error:'请稍后重试'})
      if (!req.headers['content-type']?.includes('application/json')) return reply(415,{error:'JSON required'})
      let data = '', length = 0
      try {
        for await (const chunk of req) { length += chunk.length; if (length > 32768) { reply(413,{error:'内容过长'}); req.resume(); return } data += chunk }
        const value = validate(JSON.parse(data))
        const task = queue.then(async () => {
          const existing = records.get(value.requestId)
          if (existing) return existing
          const row = { ...value, id:`W-${randomUUID()}`, createdAt:new Date().toISOString(), status:'待整理', likes:0, likedBy:[] }
          await appendFile(file,JSON.stringify(row)+'\n',{ mode:0o600, flush:true })
          records.set(row.requestId,row)
          return row
        })
        queue = task.catch(() => {})
        const row = await task
        return reply(201,{id:row.id})
      } catch(e) { return reply(e instanceof SyntaxError || e.message.includes('格式') || /无效/.test(e.message) ? 400 : 500,{error:'保存失败'}) }
    }
    if (path === '/api/wishes/board' && req.method === 'GET') return reply(200, board())
    if (path === '/api/wishes/like' && req.method === 'POST') {
      if (throttle()) return reply(429,{error:'请稍后重试'})
      let data = '', length = 0
      try {
        for await (const chunk of req) { length += chunk.length; if (length > 4096) { reply(413,{error:'内容过长'}); req.resume(); return } data += chunk }
        const { id } = JSON.parse(data)
        const row = typeof id === 'string' ? byId(id) : null
        if (!row) return reply(404,{error:'not found'})
        const hash = ipHash(ip)
        const task = queue.then(async () => {
          if (!row.likedBy.includes(hash)) { row.likedBy.push(hash); row.likes++ ; await writeAll() }
          return row.likes
        })
        queue = task.catch(() => {})
        return reply(200,{ likes: await task })
      } catch(e) { return reply(e instanceof SyntaxError ? 400 : 500, {error:'操作失败'}) }
    }
    const statusMatch = path.match(/^\/api\/wishes\/(W-[a-f0-9-]+)\/status$/)
    if (statusMatch && req.method === 'PATCH') {
      if (!await admin()) return reply(401,{error:"unauthorized"})
      let data = '', length = 0
      try {
        for await (const chunk of req) { length += chunk.length; if (length > 4096) { reply(413,{error:'内容过长'}); req.resume(); return } data += chunk }
        const { status } = JSON.parse(data)
        if (!STATUSES.has(status)) return reply(400,{error:'状态无效'})
        const row = byId(statusMatch[1])
        if (!row) return reply(404,{error:'not found'})
        const task = queue.then(async () => { row.status = status; await writeAll(); return row.status })
        queue = task.catch(() => {})
        return reply(200,{ id: row.id, status: await task })
      } catch(e) { return reply(e instanceof SyntaxError ? 400 : 500, {error:'操作失败'}) }
    }
    if ((path === '/api/wishes/export' || path === '/api/wishes/summary') && req.method === 'GET') {
      if (!await admin()) return reply(401,{error:"unauthorized"})
      if (path.endsWith('export')) return reply(200,[...records.values()])
      const groups = new Map()
      for (const row of records.values()) { const key = groupKey(row); const group = groups.get(key) || { ip:row.ip, city:row.city || '城市待定', count:0 }; group.count++; groups.set(key,group) }
      return reply(200,[...groups.values()].sort((a,b) => b.count-a.count))
    }
    // 管理后台仪表盘：脱敏总览（cookie 会话或 Bearer 均可）
    if (path === '/api/wishes/overview' && req.method === 'GET') {
      if (!await admin()) return reply(401,{error:"unauthorized"})
      const byStatus = {}
      for (const row of records.values()) byStatus[row.status] = (byStatus[row.status] || 0) + 1
      return reply(200, { total: records.size, byStatus, likes: [...records.values()].reduce((n, r) => n + (r.likes || 0), 0) })
    }
    reply(404,{error:'not found'})
  })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createWishServer({ file:resolve(process.env.WISH_DATA_FILE || 'var/wishes.jsonl') })
  server.listen(Number(process.env.WISH_PORT || 8787),'127.0.0.1',() => console.log('Wish API: http://127.0.0.1:'+server.address().port))
}
