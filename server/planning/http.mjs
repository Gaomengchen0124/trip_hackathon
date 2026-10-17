import { randomUUID,randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { assert } from '../../src/planning/core.mjs'
import { digest } from './store.mjs'
export function createPlanningHandler({service,store,origin='http://127.0.0.1:8001',secure=false,resolveUser=()=>null}={}) {
  const expected=new URL(origin).origin;
  return async function handle(req,res) {
    const requestId=randomUUID(),headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    const reply=(status,data,error)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,headers);res.end(JSON.stringify({schemaVersion:'planning.v1',requestId,...(error?{error}:{data})}))};
    let owner,route,key,reserved=false;
    try {
      const url=new URL(req.url,expected);route=url.pathname;
      assert(['GET','POST'].includes(req.method),'METHOD_NOT_ALLOWED','不支持的请求方法',405);
      if(req.method==='POST')assert(req.headers.origin===expected,'ORIGIN_DENIED','请求来源不允许',403);
      const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim().split('=').slice(0,2)));
      const user=await resolveUser(cookies.travel_session);
      if(user)owner='user:'+user.id;
      else {
        let token=cookies.travel_planning_guest;
        if(typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token)) {
          try{store.get('guest:'+digest(token),'guest:'+digest(token),'guest')}catch{token=null}
        }else token=null;
        if(!token){token=randomBytes(32).toString('base64url');owner='guest:'+digest(token);store.put(owner,owner,'guest',{createdAt:Date.now()});headers['Set-Cookie']=`travel_planning_guest=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure?'; Secure':''}`}
        owner||='guest:'+digest(token);
      }
      if(req.method==='GET'&&route==='/api/planning/status')return reply(200,service.status());
      let match;
      if(req.method==='GET'&&(match=/^\/api\/itineraries\/([a-zA-Z0-9-]+)\/services$/.exec(route)))return reply(200,await service.services(owner,match[1],{kind:url.searchParams.get('kind'),poiId:url.searchParams.get('poiId')}));
      if(req.method==='GET'&&(match=/^\/api\/itineraries\/([a-zA-Z0-9-]+)\/additions$/.exec(route)))return reply(200,await service.additions(owner,match[1],Number(url.searchParams.get('baseVersion')),{refresh:url.searchParams.get('refresh')==='1'}));
      if(req.method==='GET'&&(match=/^\/api\/planning\/sessions\/([a-zA-Z0-9-]+)$/.exec(route)))return reply(200,service.getSession(owner,match[1]));
      if(req.method==='GET'&&(match=/^\/api\/planning\/jobs\/([a-zA-Z0-9-]+)$/.exec(route)))return reply(200,service.getJob(owner,match[1]));
      if(req.method==='GET'&&(match=/^\/api\/itineraries\/([a-zA-Z0-9-]+)$/.exec(route)))return reply(200,service.getItinerary(owner,match[1]));
      assert(req.method==='POST'&&(route==='/api/planning/sessions'||route==='/api/itineraries'||/^\/api\/planning\/jobs\/[a-zA-Z0-9-]+\/cancel$/.test(route)||/^\/api\/planning\/sessions\/[a-zA-Z0-9-]+\/intake$/.test(route)||/^\/api\/itineraries\/[a-zA-Z0-9-]+\/(revisions|commits|undo)$/.test(route)),'NOT_FOUND','规划接口不存在或尚未实现',404);
      assert(req.headers['content-type']?.startsWith('application/json'),'JSON_REQUIRED','请使用 JSON 请求',415);
      let bytes=0,chunks=[];
      for await(const chunk of req){bytes+=chunk.length;assert(bytes<=50000,'BODY_TOO_LARGE','请求内容过长',413);chunks.push(chunk)}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{assert(false,'INVALID_JSON','JSON格式不正确',400)}
      assert(body&&typeof body==='object'&&!Array.isArray(body),'INVALID_BODY','请求须为对象',400);
      key=body.idempotencyKey;
      const cached=store.idempotentStart(owner,route,key,body);
      if(cached)return reply(cached.status,cached.data,cached.error);
      reserved=true;
      const cancelRequest=/^\/api\/planning\/jobs\/[a-zA-Z0-9-]+\/cancel$/.test(route);
      const trialRequest=cancelRequest||(route==='/api/itineraries'&&body.dryRun===true)||(route==='/api/planning/sessions'&&body.selectionNegotiation===true&&body.engineMode==='rules');
      let budget='write';
      if(trialRequest)budget='trial';
      else if(route==='/api/planning/sessions')budget=body.engineMode==='rules'?'rules':'model';
      else if(route==='/api/itineraries')budget=service.getSession(owner,body.planningSessionId).engineMode==='rules'?'rules':'model';
      else if(route.endsWith('/revisions')&&body.text?.trim())budget='model';
      else if(route.endsWith('/intake'))budget=service.getSession(owner,route.split('/')[4]).engineMode==='rules'?'rules':'model';
      const limits={trial:[180,360],rules:[60,180],model:[20,60],write:[120,240]};
      assert(store.rateLimit(budget+':'+owner,limits[budget][0],60000),'RATE_LIMITED','请求较多，请稍后重试',429);
      assert(store.rateLimit(budget+'-ip:'+digest(req.socket.remoteAddress||'local'),limits[budget][1],60000),'RATE_LIMITED','请求较多，请稍后重试',429);
      let data,status=200;
      if(cancelRequest){data=service.cancelJob(owner,route.split('/')[4]);}
      else if(route==='/api/planning/sessions'){data=await service.intake(owner,body);status=201}
      else if(route==='/api/itineraries'){data=service.generate(owner,body);status=202}
      else if((match=/^\/api\/itineraries\/([a-zA-Z0-9-]+)\/(revisions|commits|undo)$/.exec(route))){if(match[2]==='revisions'){data=service.revise(owner,match[1],body);status=202}else data=await service[match[2]==='commits'?'commit':'undo'](owner,match[1],body)}
      else {const id=route.split('/')[4];data=await service.intake(owner,body,id)}
      store.idempotentFinish(owner,route,key,{status,data});reply(status,data);
    } catch(e) {
      const error={code:e.code||'INTERNAL_ERROR',message:e.code?e.message:'服务暂时不可用，请重试',retryable:e.retryable||false};
      const status=e.status||500;if(status===429){headers['Retry-After']='60';error.retryAfterSeconds=60;}
      if(reserved)store.idempotentFinish(owner,route,key,{status,error});reply(status,null,error);
    }
  }
}
export function createPlanningServer(options) {return createServer(createPlanningHandler(options))}
