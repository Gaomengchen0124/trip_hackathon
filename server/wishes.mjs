import './env.mjs'
import { createPoiHandler } from './poi-submissions.mjs'
import { createServer } from 'node:http'
import { mkdir, readFile, appendFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const styles = new Set(['经典打卡','深度探索','同款美食','轻松散步','拍照出片'])
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
export async function createWishServer({ file = resolve('var/wishes.jsonl'), adminToken = process.env.WISH_ADMIN_TOKEN, allowedOrigins = (process.env.WISH_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173,http://localhost:5198').split(',') } = {}) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 })
  const records = new Map()
  try { for (const line of (await readFile(file,'utf8')).split('\n').filter(Boolean)) { const row = JSON.parse(line); records.set(row.requestId,row) } } catch(e) { if (e.code !== 'ENOENT') throw e }
  let queue = Promise.resolve()
  const limits = new Map()
  const poiHandler = await createPoiHandler({ directory: resolve(dirname(file), 'poi-submissions'), adminToken, allowedOrigins })
  return createServer(async (req,res) => {
    if (await poiHandler(req,res)) return
    const reply = (code,body) => { res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(JSON.stringify(body)) }
    const path = new URL(req.url,'http://localhost').pathname
    if (path === '/api/wishes' && req.method === 'POST') {
      const origin = req.headers.origin
      if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}` && !allowedOrigins.includes(origin)) return reply(403,{error:'origin'})
      const address = req.socket.remoteAddress
      const now = Date.now()
      for (const [k,v] of limits) if (now-v.start > 60000) limits.delete(k)
      const rate = limits.get(address) || { start:now, count:0 }; limits.set(address,rate)
      if (++rate.count > 20) return reply(429,{error:'请稍后重试'})
      if (!req.headers['content-type']?.includes('application/json')) return reply(415,{error:'JSON required'})
      let data = '', length = 0
      try {
        for await (const chunk of req) { length += chunk.length; if (length > 32768) { reply(413,{error:'内容过长'}); req.resume(); return } data += chunk }
        const value = validate(JSON.parse(data))
        const task = queue.then(async () => {
          const existing = records.get(value.requestId)
          if (existing) return existing
          const row = { ...value, id:`W-${randomUUID()}`, createdAt:new Date().toISOString(), status:'待整理' }
          await appendFile(file,JSON.stringify(row)+'\n',{ mode:0o600, flush:true })
          records.set(row.requestId,row)
          return row
        })
        queue = task.catch(() => {})
        const row = await task
        return reply(201,{id:row.id})
      } catch(e) { return reply(e instanceof SyntaxError || e.message.includes('格式') || /无效/.test(e.message) ? 400 : 500,{error:'保存失败'}) }
    }
    if ((path === '/api/wishes/export' || path === '/api/wishes/summary') && req.method === 'GET') {
      const token = req.headers.authorization || '', expected = `Bearer ${adminToken}`
      if (!adminToken || Buffer.byteLength(token) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(token),Buffer.from(expected))) return reply(401,{error:'unauthorized'})
      if (path.endsWith('export')) return reply(200,[...records.values()])
      const groups = new Map()
      for (const row of records.values()) { const key = `${row.ip.trim().toLowerCase()}\0${row.city.trim().toLowerCase()}`; const group = groups.get(key) || { ip:row.ip, city:row.city || '城市待定', count:0 }; group.count++; groups.set(key,group) }
      return reply(200,[...groups.values()].sort((a,b) => b.count-a.count))
    }
    reply(404,{error:'not found'})
  })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createWishServer({ file:resolve(process.env.WISH_DATA_FILE || 'var/wishes.jsonl') })
  server.listen(Number(process.env.WISH_PORT || 8787),'127.0.0.1',() => console.log('Wish API: http://127.0.0.1:'+server.address().port))
}
