import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmailLogin, configuredEmailSender } from './email-login.mjs'
import { createAuthStore } from './auth-store.mjs'
import { authConfig } from './auth-config.mjs'
export const COOKIE_NAME = 'travel_session'
export function sessionCookie(token, { secure = true, maxAge = 604800 } = {}) {
  if (!/^[A-Za-z0-9_-]*$/.test(token)) throw new Error('Invalid token')
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}
export function createAuthServer({ store, origin = 'http://127.0.0.1:8788', additionalOrigins = [], secure = true, sendEmail, secret } = {}) {
  if (!store) throw new Error('Auth store required')
  const expectedOrigin = new URL(origin).origin
  const allowedOrigins = new Set([expectedOrigin, ...additionalOrigins.map(value => new URL(value).origin)])
  const emailLogin = createEmailLogin({ store, sendEmail, secret })
  return createServer(async (req, res) => {
    const reply = (code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }); res.end(JSON.stringify(body)) }
    const path = new URL(req.url, expectedOrigin).pathname
    if (!['/api/auth/session', '/api/auth/logout', '/api/auth/profile', '/api/auth/email/send', '/api/auth/email/verify', '/api/favorites', '/api/comments', '/api/me/comments', '/api/comment-reports', '/api/manage/users', '/api/manage/reports', '/api/manage/comments', '/api/manage/audit', '/api/manage/stats', '/api/manage/users/password', '/api/auth/password/login', '/api/auth/password/set'].includes(path)) return reply(404, { error: '接口不存在' })
    if (req.method !== 'GET' && !allowedOrigins.has(req.headers.origin)) return reply(403, { error: '请求来源不允许' })
    const cookie = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE_NAME}=`))
    const token = cookie?.slice(COOKIE_NAME.length + 1)
    try {
      let body = null
      if (['POST','PUT','PATCH'].includes(req.method)) {
        if (!req.headers['content-type']?.startsWith('application/json') && path !== '/api/auth/logout') return reply(415, { error: '需要 JSON 格式' })
        let bytes = 0, chunks = []
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 200000) { req.resume(); return reply(413, { error: '内容过长' }) } chunks.push(chunk) }
        if (bytes) { try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return reply(400, { error: 'JSON 格式错误' }) } }
      }
      if (path === '/api/auth/email/send' && req.method === 'POST') {
        try { await emailLogin.send(body?.email, req.socket.remoteAddress); return reply(200, { ok: true, retryAfter: 60 }) }
        catch (error) { return reply(error.status || 500, { error: error.message }) }
      }
      if (path === '/api/auth/email/verify' && req.method === 'POST') {
        try {
          const login = emailLogin.verify(body?.email, body?.code, req.socket.remoteAddress)
          store.revoke(token)
          return reply(200, { user: login.user }, { 'Set-Cookie': sessionCookie(login.token, { secure, maxAge: login.maxAge }) })
        } catch (error) { return reply(error.status || 500, { error: error.status ? error.message : '登录失败，请重试。' }) }
      }
      const user = store.sessionUser(token)
      // ---- 账号密码登录（与邮箱验证码并行的第二种凭证）----
      if (path === '/api/auth/password/login' && req.method === 'POST') {
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
        const password = typeof body?.password === 'string' ? body.password : ''
        if (!email || !password) return reply(400, { error: '请输入邮箱和密码' })
        if (!store.rateLimit(`pw-login:${req.socket.remoteAddress}`, 10, 600000) || !store.rateLimit(`pw-login:${email}`, 5, 600000)) return reply(429, { error: '尝试过于频繁，请稍后再试。' })
        const loginUser = store.verifyPassword(email, password)
        if (!loginUser) return reply(400, { error: '账号或密码不正确' })
        const login = store.issueSession(loginUser.id)
        store.revoke(token)
        return reply(200, { user: loginUser }, { 'Set-Cookie': sessionCookie(login.token, { secure, maxAge: login.maxAge }) })
      }
      if (path === '/api/auth/password/set' && req.method === 'POST') {
        if (!user) return reply(401, { error: '请先登录' })
        try { store.setPassword(user.id, body?.password); store.adminAudit(user.id, 'user.set-password', `user:${user.id}`); return reply(200, { ok: true }) }
        catch (error) { return reply(400, { error: error.message }) }
      }
      if (path === '/api/me/comments' && req.method==='GET') {
        if (!user) return reply(401,{error:'请先登录'})
        const raw=new URL(req.url,expectedOrigin).searchParams.get('before')
        const before=raw===null ? Number.MAX_SAFE_INTEGER : Number(raw)
        if (!Number.isSafeInteger(before)||before<1) return reply(400,{error:'分页参数不正确'})
        const rows=store.myComments(user.id,before)
        return reply(200,{comments:rows.slice(0,20),nextCursor:rows.length>20?rows[19].id:null})
      }
      if (path === '/api/comment-reports' && req.method==='POST') {
        if (!user) return reply(401,{error:'请先登录'})
        if (!Number.isSafeInteger(body?.commentId)||body.commentId<1||!['垃圾广告','不实信息','人身攻击','其他'].includes(body.reason)) return reply(400,{error:'举报参数不正确'})
        if (!store.rateLimit(`report:${user.id}`,10,3600000)) return reply(429,{error:'举报太频繁，请稍后重试。'})
        try {
          const id=store.reportComment(user.id,body.commentId,body.reason)
          return id ? reply(201,{id}) : reply(404,{error:'评论不存在'})
        } catch { return reply(400,{error:'不能举报自己的评论'}) }
      }
      if (path === '/api/comments') {
        const url = new URL(req.url, expectedOrigin)
        const key = ['GET','DELETE'].includes(req.method) ? url.searchParams.get('entityKey') : body?.entityKey
        if (typeof key !== 'string' || !/^(poi|line):[a-zA-Z0-9_-]{1,100}$/.test(key)) return reply(400, { error: '评论对象不正确' })
        if (req.method === 'DELETE' || req.method === 'PATCH') {
          if (!user) return reply(401, { error: '请先登录' })
          const id = Number(req.method === 'DELETE' ? url.searchParams.get('id') : body?.id)
          if (!Number.isSafeInteger(id) || id < 1) return reply(400, { error: '评论编号不正确' })
          if (req.method === 'PATCH' && body?.action !== 'restore') return reply(400, { error: '操作不支持' })
          if (!store.setCommentDeleted(user.id,id,key,req.method === 'DELETE')) return reply(404, { error: '评论不存在或无权操作' })
          return reply(200, { ok: true })
        }
        if (req.method === 'GET') {
          const raw = url.searchParams.get('before')
          const before = raw === null ? Number.MAX_SAFE_INTEGER : Number(raw)
          if (!Number.isSafeInteger(before) || before < 1) return reply(400, { error: '分页参数不正确' })
          const rows = store.listComments(key,before)
          return reply(200, { comments: rows.slice(0,20), nextCursor: rows.length > 20 ? rows[19].id : null })
        }
        if (req.method === 'POST') {
          if (!user) return reply(401, { error: '请先登录' })
          if (typeof body.content !== 'string' || !body.content.trim() || Array.from(body.content.trim()).length > 1000 || typeof body.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId)) return reply(400, { error: '请输入 1–1000 字评论' })
          if (!store.rateLimit(`comment-user:${user.id}`,10,60000) || !store.rateLimit(`comment-ip:${req.socket.remoteAddress}`,30,60000)) return reply(429, { error: '发布太频繁，请稍后重试。' })
          try { const id = store.addComment(user.id,key,body.content.trim(),body.requestId); return reply(201, { id }) }
          catch(error) { return reply(409, { error: error.message==='Duplicate comment' ? '请勿在一分钟内重复发布相同评论。' : '发布请求冲突，请刷新后重试。' }) }
        }
      }
      if (path === '/api/favorites') {
        if (!user) return reply(401, { error: '请先登录' })
        if (req.method === 'GET') return reply(200, { favorites: store.listFavorites(user.id) })
        if (req.method === 'PUT') {
          if (typeof body?.entityKey !== 'string' || !/^(poi|line):[a-zA-Z0-9_-]{1,100}$/.test(body.entityKey) || typeof body.saved !== 'boolean') return reply(400, { error: '收藏参数错误' })
          return reply(200, { favorites: store.setFavorite(user.id, body.entityKey, body.saved) })
        }
      }
      if (path === '/api/auth/session' && req.method === 'GET') return reply(200, { user, isLoggedIn: !!user })
      if (path === '/api/auth/logout' && req.method === 'POST') {
        store.revoke(token)
        return reply(200, { ok: true }, { 'Set-Cookie': sessionCookie('', { secure, maxAge: 0 }) })
      }
      if (path === '/api/auth/profile' && req.method === 'PATCH') {
        if (!user) return reply(401, { error: '请先登录' })
        const profile = body
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return reply(400, { error: '资料格式错误' })
        try { return reply(200, { user: store.updateProfile(user.id, profile) }) }
        catch { return reply(400, { error: '昵称或头像格式不正确' }) }
      }
      // ---- 管理后台（仅 admin）----
      if (path.startsWith('/api/manage/')) {
        if (!user) return reply(401, { error: '请先登录' })
        if (!store.isAdmin(user)) return reply(403, { error: '没有管理员权限' })
        if (path === '/api/manage/users' && req.method === 'GET') {
          const raw = new URL(req.url, expectedOrigin).searchParams.get('before')
          const before = raw === null ? Number.MAX_SAFE_INTEGER : Number(raw)
          if (!Number.isSafeInteger(before) || before < 1) return reply(400, { error: '分页参数不正确' })
          const { users, nextCursor } = store.listUsers(before)
          const prefs = store.listUserPreferences(users.map(u => u.id))
          return reply(200, { users: users.map(u => ({ ...u, preferences: prefs[u.id]?.tags ?? null })), nextCursor, preferencesAvailable: store.preferencesAvailable() })
        }
        if (path === '/api/manage/users' && req.method === 'PATCH') {
          if (typeof body?.id !== 'string' || !['user', 'admin'].includes(body?.role)) return reply(400, { error: '参数不正确' })
          try { const updated = store.setUserRole(user.id, body.id, body.role); store.adminAudit(user.id, 'user.set-role', `user:${body.id}`, `role=${body.role}`); return reply(200, { user: updated }) }
          catch (error) { return reply(400, { error: error.message }) }
        }
        if (path === '/api/manage/users/password' && req.method === 'POST') {
          if (typeof body?.id !== 'string') return reply(400, { error: '参数不正确' })
          try { store.setPassword(body.id, body?.password); store.adminAudit(user.id, 'user.reset-password', `user:${body.id}`); return reply(200, { ok: true }) }
          catch (error) { return reply(400, { error: error.message }) }
        }
        if (path === '/api/manage/reports' && req.method === 'GET') {
          const url = new URL(req.url, expectedOrigin)
          const status = url.searchParams.get('status') === 'all' ? 'all' : 'pending'
          const raw = url.searchParams.get('before')
          const before = raw === null ? Number.MAX_SAFE_INTEGER : Number(raw)
          if (!Number.isSafeInteger(before) || before < 1) return reply(400, { error: '分页参数不正确' })
          return reply(200, store.listReports(status, before))
        }
        if (path === '/api/manage/reports' && req.method === 'PATCH') {
          if (!Number.isSafeInteger(body?.id) || body.id < 1 || !['hide', 'dismiss'].includes(body?.action)) return reply(400, { error: '参数不正确' })
          if (!store.resolveReport(body.id, body.action)) return reply(404, { error: '举报记录不存在或已处理' })
          store.adminAudit(user.id, `report.${body.action}`, `report:${body.id}`)
          return reply(200, { ok: true })
        }
        if (path === '/api/manage/comments') {
          const id = Number(req.method === 'DELETE' ? new URL(req.url, expectedOrigin).searchParams.get('id') : body?.id)
          if (!Number.isSafeInteger(id) || id < 1) return reply(400, { error: '评论编号不正确' })
          if (req.method === 'DELETE') {
            if (!store.moderateComment(user.id, id, true)) return reply(404, { error: '评论不存在' })
            store.adminAudit(user.id, 'comment.hide', `comment:${id}`)
            return reply(200, { ok: true })
          }
          if (req.method === 'PATCH') {
            if (body?.action !== 'restore') return reply(400, { error: '操作不支持' })
            if (!store.moderateComment(user.id, id, false)) return reply(404, { error: '评论不存在' })
            store.adminAudit(user.id, 'comment.restore', `comment:${id}`)
            return reply(200, { ok: true })
          }
          return reply(405, { error: '请求方法不支持' })
        }
        if (path === '/api/manage/stats' && req.method === 'GET') return reply(200, store.manageStats())
        if (path === '/api/manage/audit' && req.method === 'GET') {
          const raw = new URL(req.url, expectedOrigin).searchParams.get('before')
          const before = raw === null ? Number.MAX_SAFE_INTEGER : Number(raw)
          if (!Number.isSafeInteger(before) || before < 1) return reply(400, { error: '分页参数不正确' })
          return reply(200, store.listAdminAudit(before))
        }
        return reply(405, { error: '请求方法不支持' })
      }
      return reply(405, { error: '请求方法不支持' })
    } catch { return reply(500, { error: '服务暂不可用' }) }
  })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = authConfig()
  const { port } = config
  const store = createAuthStore({ file: config.file })
  const server = createAuthServer({ ...config, store, sendEmail: configuredEmailSender() })
  server.listen(port, '127.0.0.1', () => console.log(`Auth API: http://127.0.0.1:${port}`))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0) }))
}
