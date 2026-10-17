import {createRequestPool,waitWithSignal} from './request-pool.mjs'
import { PlanningError, assert } from '../../src/planning/core.mjs'
// Shared provider transport. No business history lives here; callers supply purpose.
export function createDeepSeekClient({apiKey=process.env.DEEPSEEK_API_KEY,model=process.env.DEEPSEEK_MODEL||'deepseek-flash',baseURL=process.env.DEEPSEEK_BASE_URL||'https://api.deepseek.com',fetchImpl=fetch,timeoutMs=25000,onUsage=event=>console.info(JSON.stringify({event:'llm_usage',...event}))}={}) {
  const endpoint=new URL(baseURL.replace(/\/$/,'')+'/chat/completions');
  assert(endpoint.protocol==='https:' || !apiKey&&['localhost','127.0.0.1'].includes(endpoint.hostname),'INVALID_PROVIDER','模型入口须使用 HTTPS');
  const pools={itinerary_planning:createRequestPool(2),ip_recommendation:createRequestPool(1)};
  return {configured:Boolean(apiKey),model,async complete({purpose,messages,signal}) {
    assert(['itinerary_planning','ip_recommendation'].includes(purpose),'INVALID_PURPOSE','必须区分模型调用业务');
    if(!apiKey)throw new PlanningError('LLM_NOT_CONFIGURED','尚未配置 DEEPSEEK_API_KEY；请在 server/.env.local 填入密钥',503);
    const combined=AbortSignal.any([AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])]);
    const started=Date.now();let release;
    try {
      release=await pools[purpose].acquire(combined);
      let response;
      for(let attempt=0;attempt<2;attempt++) {
        combined.throwIfAborted();
        try {response=await fetchImpl(endpoint,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages,response_format:{type:'json_object'},thinking:{type:'disabled'},max_tokens:5000,temperature:0.2}),signal:combined})}
        catch(error) { if(combined.aborted)throw error;if(attempt===1)throw new PlanningError('LLM_UNAVAILABLE','模型网络连接失败',502,true);await waitWithSignal(500+Math.random()*150,combined);continue }
        if(![429,500,502,503].includes(response.status)||attempt===1)break;
        const raw=response.headers?.get?.('Retry-After'),seconds=raw!=null&&raw.trim()!==''?Number(raw):NaN;const retryAfter=Number.isFinite(seconds)?Math.max(0,seconds*1000):raw?Math.max(0,Date.parse(raw)-Date.now()):0;
        await response.body?.cancel();await waitWithSignal(Math.max(500+Math.random()*150,Number.isFinite(retryAfter)?retryAfter:0),combined);
      }
      if(!response.ok) {await response.body?.cancel();throw new PlanningError(response.status===401?'LLM_AUTH_FAILED':'LLM_UPSTREAM_ERROR',response.status===401?'DeepSeek 密钥无效，请检查服务端配置':'DeepSeek 请求失败，请检查账户额度或稍后重试',502,response.status===429||response.status>=500)}
      const body=await response.json().catch(()=>{throw new PlanningError('MODEL_PROTOCOL','模型返回了非 JSON 响应',502)});
      const choice=body.choices?.[0];
      if(choice?.finish_reason!=='stop')throw new PlanningError('MODEL_TRUNCATED','模型输出未完整结束，请重试',502,true);
      const content=choice?.message?.content;
      assert(typeof content==='string'&&content.length>0&&content.length<100000,'MODEL_PROTOCOL','模型返回内容为空或过长',502);
      let result;try{result=JSON.parse(content)}catch{throw new PlanningError('MODEL_PROTOCOL','模型未返回有效 JSON',502,true)}
      assert(result&&typeof result==='object'&&!Array.isArray(result),'MODEL_PROTOCOL','模型输出结构错误',502);
      const usage=body.usage;onUsage({purpose,model,elapsedMs:Date.now()-started,usage:usage?{prompt_tokens:usage.prompt_tokens,completion_tokens:usage.completion_tokens,total_tokens:usage.total_tokens}:null});return result;
    } catch(error) {if(signal?.aborted)throw signal.reason;if(combined.aborted)throw new PlanningError('PLANNING_TIMEOUT','规划超时，已保留原有数据',504,true);throw error}
    finally {release?.()}
  }}
}
