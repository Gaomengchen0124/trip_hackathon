import './env.mjs'
import {createServer} from 'node:http'
import {resolve} from 'node:path'
import {loadLocalEnv} from './planning/config.mjs'
import {createAuthStore} from './auth-store.mjs'
import {createPlanningStore} from './planning/store.mjs'
import {createPlanningService} from './planning/service.mjs'
import {createDeepSeekClient} from './planning/llm.mjs'
import {createPlanningHandler} from './planning/http.mjs'
loadLocalEnv()
const port=Number(process.env.PLANNING_PORT||8790)
const origins=(process.env.PLANNING_ALLOWED_ORIGINS||process.env.PLANNING_ORIGIN||'http://localhost:5180,http://127.0.0.1:5180,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173').split(',').map(v=>new URL(v.trim()).origin)
const auth=createAuthStore({file:resolve(process.env.AUTH_DATA_FILE||'var/auth.sqlite')})
const store=createPlanningStore({file:resolve(process.env.PLANNING_DATA_FILE||'var/planning.sqlite')})
const service=createPlanningService({store,llm:createDeepSeekClient(),profileProvider:async owner=>({favoritePoiIds:owner.startsWith('user:')?auth.listFavorites(owner.slice(5)).filter(k=>k.startsWith('poi:')).map(k=>k.slice(4)):[]})})
const handlers=new Map(origins.map(origin=>[origin,createPlanningHandler({store,service,origin,secure:origin.startsWith('https:'),resolveUser:token=>auth.sessionUser(token)})]))
const server=createServer((req,res)=>{const origin=req.headers.origin;if(origin&&!handlers.has(origin)){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:{code:'ORIGIN_DENIED',message:'请求来源不允许'}}))}return handlers.get(origin||origins[0])(req,res)})
server.listen(port,'127.0.0.1',()=>console.log(`Planning API: http://127.0.0.1:${port}`))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await service.settle();store.close();auth.close();process.exit(0)}))
