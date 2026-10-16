import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPlaceSearch } from '../server/place-search.mjs'
const feature=(properties,coords=[121.4252,31.213])=>({type:'Feature',properties:{osm_type:'W',osm_id:1,state:'上海市',city:'长宁区',...properties},geometry:{type:'Point',coordinates:coords}})
test('精确门牌缺失时返回真实道路候选，不伪装精确门牌；请求去重及缓存',async()=>{
 const calls=[]
 const service=createPlaceSearch({minIntervalMs:0,fetchImpl:async url=>{calls.push(url);return {ok:true,json:async()=>({features:url.searchParams.get('q').includes('1262')?[]:[feature({name:'延安西路',type:'street'}),feature({name:'延安西路',type:'house',osm_id:2,osm_value:'station'})]})}}})
 const [a,b]=await Promise.all([service.search({q:'延安西路1262号',city:'上海'}),service.search({q:'延安西路1262号',city:'上海'})])
 assert.equal(calls.length,2);assert.equal(calls[0].hostname,'photon.komoot.io');assert.ok(calls[0].searchParams.get('bbox'));assert.equal(a.results.length,1);assert.equal(a.results[0].name,'延安西路');assert.equal(a.results[0].approximate,true);assert.match(a.message,/未匹配到该门牌/);assert.deepEqual(a,b)
 await service.search({q:'延安西路1262号',city:'上海'});assert.equal(calls.length,2)
})
test('真实门牌候选与 WGS84 坐标',async()=>{
 const service=createPlaceSearch({minIntervalMs:0,fetchImpl:async()=>({ok:true,json:async()=>({features:[feature({street:'测试路',housenumber:'1262',type:'house'})]})})})
 const data=await service.search({q:'测试路1262号',city:'上海'});assert.equal(data.results[0].houseNumber,'1262');assert.equal(data.results[0].lng,121.4252);assert.equal(data.approximate,false)
})
test('地图选点返回附近地址，保留用户选择的位置并注明近似',async()=>{
 const service=createPlaceSearch({minIntervalMs:0,fetchImpl:async url=>{assert.equal(url.pathname,'/reverse');return {ok:true,json:async()=>({features:[feature({name:'延安西路',type:'street'}),feature({name:'延安西路',type:'house',osm_id:2,osm_value:'station'})]})}}})
 const result=await service.reverse({lat:31.214,lng:121.426,city:'上海'});assert.equal(result.place.lng,121.426);assert.equal(result.place.lat,31.214);assert.equal(result.place.approximate,true);assert.equal(result.place.source,'photon')
})
test('空结果、上游错误与无效坐标',async()=>{
 const empty=createPlaceSearch({minIntervalMs:0,fetchImpl:async()=>({ok:true,json:async()=>({features:[feature({name:'错误地点'},[NaN,31])]})})})
 assert.equal((await empty.search({q:'不存在',city:'上海'})).results.length,0)
 await assert.rejects(empty.reverse({lat:31,lng:121,city:'上海'}),/未能识别/)
 await assert.rejects(createPlaceSearch({minIntervalMs:0,fetchImpl:async()=>({ok:false})}).search({q:'公园',city:'上海'}),/暂不可用/)
})
