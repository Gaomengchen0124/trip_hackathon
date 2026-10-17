// Local preview only. API and static page share the same origin.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { createAuthServer } from './auth.mjs'
import { createAuthStore } from './auth-store.mjs'
import { configuredEmailSender } from './email-login.mjs'
import { loadLocalEnv } from './planning/config.mjs'
import { createPlanningStore } from './planning/store.mjs'
import { createDeepSeekClient } from './planning/llm.mjs'
import { createPlanningService } from './planning/service.mjs'
import { createPlanningHandler } from './planning/http.mjs'
loadLocalEnv()
const port = Number(process.env.PREVIEW_PORT || 8001)
const root = resolve('.')
const store = createAuthStore({ file: resolve(process.env.AUTH_DATA_FILE || 'var/auth.sqlite') })
const publicOrigin = process.env.PLANNING_ORIGIN || process.env.AUTH_ORIGIN || `http://127.0.0.1:${port}`
const api = createAuthServer({ store, origin: publicOrigin, secure: publicOrigin.startsWith('https:'), sendEmail: configuredEmailSender(), secret: process.env.AUTH_CODE_SECRET })
const planningStore = createPlanningStore({file:process.env.PLANNING_DATA_FILE || 'var/planning.sqlite'})
// Pass this same client to the IP recommendation service when that feature lands.
const sharedLLM = createDeepSeekClient()
const planningService = createPlanningService({store:planningStore,llm:sharedLLM,profileProvider:async owner=>({favoritePoiIds:owner.startsWith('user:')?store.listFavorites(owner.slice(5)).filter(key=>key.startsWith('poi:')).map(key=>key.slice(4)):[]})})
const planning = createPlanningHandler({store:planningStore,service:planningService,origin:publicOrigin,resolveUser:token=>store.sessionUser(token)})
const types = { '.html':'text/html', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml' }
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  if (path.startsWith('/api/planning/') || path === '/api/itineraries' || path.startsWith('/api/itineraries/')) return planning(req,res)
  if (path.startsWith('/api/auth/') || path === '/api/favorites' || path === '/api/comments' || path === '/api/me/comments' || path === '/api/comment-reports') return api.emit('request', req, res)
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end() }
  const target = path === '/' ? '/demo.html' : path
  if (!/^\/(demo\.html|src\/|data\/lines\/|public\/|assets\/|photos\/|travel-components\/src\/)/.test(target) || target.includes('..') || !types[extname(target)]) { res.writeHead(404); return res.end() }
  try {
    const file = await readFile(resolve(root, '.' + target))
    res.writeHead(200, { 'Content-Type': types[extname(target)], 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(req.method === 'HEAD' ? undefined : file)
  } catch { res.writeHead(404); res.end() }
})
server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}/demo.html?auth=server`))
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(async () => { await planningService.settle(); planningStore.close(); store.close(); process.exit(0) }))
