import test from 'node:test'
import assert from 'node:assert/strict'
import {createTripQueries,safeTripLink,unpackTripResult} from '../server/planning/trip-adapter.mjs'
test('Trip adapter imports client directly, maps verified fields, never creates an order',async()=>{let args;const q=createTripQueries({token:'synthetic',clientFactory:()=>({async queryTicket(a){args=a;return {content:[{type:'text',text:JSON.stringify([{productID:1,basicInfo:{name:'合成景点',cityName:'上海',price:10,available:true},ticketExtendInfo:{openTimeInfo:{latestEntryTime:'16:00'}},urlInfo:{h5Url:'https://m.ctrip.com/webapp/ticket/test'}}])}]}}})});const r=await q.query({kind:'tickets',city:'上海',poi:{name:'合成景点'}});assert.equal(args.scenicSpotName,'合成景点');assert.equal(r.items[0].currency,null);assert.equal(r.items[0].latestEntry,'16:00');assert.equal(r.items[0].url,'https://m.ctrip.com/webapp/ticket/test')});
test('Trip adapter handles array/text/error and blocks unsafe links',async()=>{assert.equal(safeTripLink('javascript:alert(1)'),null);assert.equal(safeTripLink('https://ctrip.com.evil.test/x'),null);assert.equal(safeTripLink('https://evil.test/?ctrip.com'),null);assert.deepEqual(unpackTripResult({content:[{type:'text',text:'查询无结果'}]}),[]);assert.throws(()=>unpackTripResult({content:[{type:'text',text:'private error'}]}),{code:'TRIP_PROTOCOL'});const q=createTripQueries({token:'',tokenKey:''});await assert.rejects(q.query({kind:'tickets',city:'上海',poi:{name:'测试'}}),{code:'TRIP_NOT_CONFIGURED'})});
test('conflicting Trip credentials do not prevent planner startup',async()=>{const q=createTripQueries({token:'synthetic_a',tokenKey:'synthetic_b'});assert.equal(q.configured,false);await assert.rejects(q.query({kind:'tickets',city:'上海',poi:{name:'测试'}}),{code:'TRIP_CONFIGURATION'})});

import {ticketPolicy} from '../src/planning/ticket-policy.mjs'
test('admission classification preserves mixed, reservation and unknown cases',()=>{
  for(const [ticket,category] of [['免费','free'],['免费（需预约）','reservation'],['外观免费/内部付费','mixed'],['免费/特展另计','mixed'],['¥40/免费','mixed'],['约¥60','paid'],['预约','reservation'],['','unknown']])assert.equal(ticketPolicy({ticket}).category,category);
  assert.equal(ticketPolicy({ticket:''}).verified,false);
});
test('free and reservation stops do not call MCP, other tools are rejected',async()=>{
  const q=createTripQueries({token:'',tokenKey:''});
  for(const ticket of ['免费','免费/预约'])assert.deepEqual((await q.query({kind:'tickets',city:'上海',poi:{name:'测试',ticket}})).items,[]);
  await assert.rejects(q.query({kind:'restaurants'}),{code:'INVALID_QUERY'});
});
test('purchase requires exact city/name match, explicit availability and resource booking link',async()=>{
  let record={basicInfo:{name:'测试',cityName:'上海',available:true},resourceInfoList:[{resourceId:1,name:'成人票',price:0,isBooking:true,urlInfoDto:{h5Url:'https://m.ctrip.com/ticket?a=channel'}}]};
  const q=createTripQueries({token:'test',tokenKey:'',clientFactory:()=>({queryTicket:async()=>({structuredContent:[record]})})});
  const query=()=>q.query({kind:'tickets',city:'上海',poi:{name:'测试'}});
  assert.equal((await query()).items[0].resources[0].url,'https://m.ctrip.com/ticket?a=channel');
  for(const change of [()=>{record.basicInfo.cityName='北京'},()=>{record.basicInfo.name='测试周边'},()=>{record.basicInfo.available=false},()=>{record.resourceInfoList[0].isBooking=false},()=>{record.resourceInfoList[0].urlInfoDto.h5Url='https://evil.test'}]){
    change();assert.equal((await query()).items[0].canBook,false);
    record={basicInfo:{name:'测试',cityName:'上海',available:true},resourceInfoList:[{name:'成人票',isBooking:true,urlInfoDto:{h5Url:'https://m.ctrip.com/ticket'}}]};
  }
});
test('verified resort product id cannot enable unrelated resources or a different product',async()=>{
  let id=1412255;
  const q=createTripQueries({token:'test',tokenKey:'',clientFactory:()=>({queryTicket:async()=>({structuredContent:[{productID:id,basicInfo:{name:'上海迪士尼度假区',cityName:'上海',available:true},resourceInfoList:['迪士尼乐园1日票成人票','小镇体验'].map(name=>({name,isBooking:true,urlInfoDto:{h5Url:'https://m.ctrip.com/ticket'}}))}]})})});
  const query=()=>q.query({kind:'tickets',city:'上海',poi:{name:'上海迪士尼乐园',ticketAliases:['上海迪士尼度假区'],ticketProductIds:['1412255'],ticketResourceTerms:['迪士尼乐园']}});
  const r=await query();assert.equal(r.items[0].resources[0].canBook,true);assert.equal(r.items[0].resources[1].canBook,false);
  id=2;assert.equal((await query()).items[0].canBook,false);
});
