export async function request(path,{method='GET',body,signal}={}) {
  let response
  try { response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',signal:signal || AbortSignal.timeout(35000),headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}) }
  catch(error){if(error.name==='AbortError')throw error;throw new Error('暂时连接不上推荐服务，请稍后重试。')}
  const value=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(value.error || '服务暂不可用，请重试。')
  return value
}
let catalogPromise
export function getCatalog(){
  if(!catalogPromise)catalogPromise=request('/api/recommendations/catalog').catch(error=>{catalogPromise=null;throw error})
  return catalogPromise
}
