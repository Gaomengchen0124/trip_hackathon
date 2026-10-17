import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {chromium} from 'playwright';
test('ticket UI: policies, loading, retry, booking gates, stale requests and mobile',{timeout:30000},async t=>{
  const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  const child=spawn(process.execPath,['tests/fixtures/planning-browser-server.mjs'],{env:{...process.env,TEST_PORT:String(port)},stdio:['ignore','pipe','pipe']});
  let browser;t.after(async()=>{await browser?.close();child.kill('SIGTERM');if(child.exitCode===null)await once(child,'exit')});
  await new Promise((resolve,reject)=>{child.stdout.on('data',d=>{if(String(d).includes('TEST_READY'))resolve()});child.on('error',reject);child.on('exit',()=>reject(Error('fixture failed')))});
  browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);await page.locator('.card').first().waitFor();
  const savedId=await page.evaluate(async()=>{
    const {createPlanningAPI,waitForPlanningJob}=await import('/src/planning/client.mjs');const api=createPlanningAPI();
    const context={lineId:'fanhua-shanghai',selectedPoiIds:['sh-sp-01','sh-sp-04'],dateRange:{startDate:'2026-11-10',endDate:'2026-11-11'},timeZone:'Asia/Shanghai'};
    const session=await api('/api/planning/sessions',{context,engineMode:'rules',action:'generate'});
    const job=await api('/api/itineraries',{planningSessionId:session.planningSessionId,intakeRevision:session.intakeRevision});
    const result=await waitForPlanningJob(api,job,{delayMs:30});if(result.kind!=='itinerary')throw Error('synthetic itinerary failed');return result.itinerary.id;
  });
  await page.goto(`http://127.0.0.1:${port}/?itinerary=${savedId}`);await page.locator('#revision-workspace').waitFor();
  const paid=page.locator('[data-poi-controls="sh-sp-01"] .itinerary-ticket-action');await paid.click();
  await page.getByText('合成测试成人票',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'去携程购买',exact:true}).getAttribute('href'),'https://m.ctrip.com/synthetic-ticket?channel=test');
  assert(await page.locator('[data-poi-controls="sh-sp-04"] .itinerary-ticket-action').isDisabled());
  await page.locator('[data-poi-controls="sh-sp-04"]').locator('..').locator('.stop').click();
  await page.getByRole('dialog').getByRole('heading',{name:'门票与预约'}).waitFor();assert(await page.getByRole('dialog').getByRole('button',{name:'南京路步行街：无需门票'}).isDisabled());
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
  assert.equal(await page.evaluate(async id=>(await fetch(`/api/itineraries/${id}/services?kind=restaurants&poiId=sh-sp-01`)).status,savedId),422);
  await page.goto(`http://127.0.0.1:${port}/`);await page.locator('.card').first().waitFor();
  await page.evaluate(async()=>{
    const {createRevisionExperience}=await import('/src/planning/revision-ui.mjs');
    const pois=[['免费点','免费'],['预约点','免费/预约'],['混合点','外观免费/内部付费'],['收费点','¥20'],['未知点','']].map(([name,ticket],i)=>({poiId:String(i),name,ticket}));
    const root=document.createElement('main');root.id='ticket-test';document.body.replaceChildren(root);const timeline=document.createElement('div'),workspace=document.createElement('section');root.append(timeline,workspace);
    for(const p of pois){const n=document.createElement('div');n.dataset.poiControls=p.poiId;timeline.append(n)}
    window.ticketCalls=0;window.replyMode='ok';window.releaseTicket=null;
    const api=async path=>{
      if(path.includes('/additions'))return {candidates:[]};
      window.ticketCalls++;if(window.replyMode==='wait')await new Promise(r=>window.releaseTicket=r);
      if(window.replyMode==='error')throw Error('合成查询失败');
      if(window.replyMode==='empty')return {items:[],notice:'合成测试'};
      return {items:[{name:'合成景点',matchStatus:'matched',available:true,url:'https://m.ctrip.com/detail',resources:[{name:'成人票',canBook:true,isBooking:true,url:'https://m.ctrip.com/buy?channel=kept'},{name:'售罄票',canBook:false,isBooking:false,disabledReason:'票种不可订或状态未知'},{name:'恶意链接票',canBook:true,isBooking:true,url:'https://evil.test'}]},{name:'同名待确认',matchStatus:'unconfirmed',available:true,url:'https://m.ctrip.com/wrong',resources:[{name:'不匹配票',canBook:true,isBooking:true,url:'https://m.ctrip.com/wrong'}]}],notice:'合成测试，非真实报价'};
    };
    const itinerary={id:'synthetic',version:1,requirements:[],days:[{date:'2026-11-10',items:pois.map(p=>({id:p.poiId,poiId:p.poiId,type:'visit',depth:'normal'}))}]};
    window.ticketExperience=createRevisionExperience({getPois:()=>pois,api,onUpdate:()=>{}});window.remountTicket=()=>window.ticketExperience.mount(workspace,{...itinerary,version:2},{timeline});window.ticketExperience.mount(workspace,itinerary,{timeline});
  });
  const buttons=page.locator('.itinerary-ticket-action');
  assert.equal(await buttons.nth(0).getAttribute('aria-label'),'免费点：无需门票');assert(await buttons.nth(0).isDisabled());assert.equal(await buttons.nth(1).getAttribute('aria-label'),'预约点：需预约');assert(await buttons.nth(1).isDisabled());assert.equal(await buttons.nth(2).getAttribute('aria-label'),'混合点：查看收费项目');assert.equal(await buttons.nth(4).getAttribute('aria-label'),'未知点：查询门票信息');
  await page.evaluate(()=>window.replyMode='wait');await buttons.nth(3).click();assert.equal(await buttons.nth(3).getAttribute('aria-label'),'收费点：查询中');assert(await buttons.nth(4).isDisabled());await page.evaluate(()=>{window.replyMode='ok';window.releaseTicket()});
  await page.getByRole('link',{name:'去携程购买',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'去携程购买',exact:true}).count(),1);assert.equal(await page.getByRole('link',{name:'去携程购买'}).getAttribute('href'),'https://m.ctrip.com/buy?channel=kept');assert.equal(await page.getByRole('button',{name:'暂不可购买'}).count(),3);assert.equal(await page.getByRole('link',{name:'去携程查看详情'}).count(),1);
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.ticket-panel').screenshot({path:'/tmp/ticket-panel-mobile.png'});
  await page.getByRole('button',{name:'关闭门票浮窗'}).click();await page.evaluate(()=>window.replyMode='error');await buttons.nth(4).click();await page.getByRole('alert').filter({hasText:'合成查询失败'}).waitFor();await page.evaluate(()=>window.replyMode='empty');await page.getByRole('button',{name:'重试查询'}).click();await page.getByText('未查到匹配门票，不能据此判断景点免费。',{exact:true}).waitFor();
  await page.evaluate(()=>window.replyMode='wait');await page.getByRole('button',{name:'重新查询'}).click();await page.evaluate(()=>{window.remountTicket();window.replyMode='ok';window.releaseTicket()});await page.waitForTimeout(100);assert.equal(await page.locator('.ticket-panel').count(),0);assert.equal(await buttons.nth(3).isDisabled(),false);assert.deepEqual(errors,[]);
});
