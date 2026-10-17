import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {createServer} from 'node:net'
import {chromium} from 'playwright'
async function setup(t,disabled=false){
 const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const child=spawn(process.execPath,['tests/fixtures/planning-browser-server.mjs'],{env:{...process.env,TEST_PORT:String(port),TEST_LLM_DISABLED:disabled?'1':'0'},stdio:['ignore','pipe','pipe']});
 let browser;
 t.after(async()=>{await browser?.close();child.kill('SIGTERM');if(child.exitCode===null)await once(child,'exit')});
 await Promise.race([new Promise((r,j)=>{child.stdout.on('data',d=>{if(d.toString().includes('TEST_READY'))r()});child.on('error',j);child.on('exit',()=>j(Error('test fixture failed')))}),new Promise((_,j)=>setTimeout(()=>j(Error('fixture startup timed out')),5000).unref())]);
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{channel:'chrome'})});const page=await browser.newPage({viewport:{width:1100,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/`);await page.locator('.card').filter({hasText:'繁花'}).first().click();await page.locator('.poi').first().click();await page.locator('.poi').nth(8).click();await page.locator('#planning-panel').scrollIntoViewIfNeeded();
 return {page,errors}
}
test('round5: choices, keyword editing, recursive questions, skip, generate and mobile result',{timeout:30000},async t=>{
 const {page,errors}=await setup(t);const panel=page.locator('#planning-panel');
 await panel.getByRole('button',{name:'和朋友',exact:true}).click();await panel.getByRole('button',{name:'走慢一点',exact:true}).click();
 await panel.locator('summary').click();
 await panel.getByRole('button',{name:'少走，优先交通接驳',exact:true}).click();
 await panel.getByRole('button',{name:'简单吃，约30分钟',exact:true}).click();
 await panel.getByLabel('午餐最早开始（默认11:30）').fill('11:45');await panel.getByLabel('午餐最晚开始（默认13:30）').fill('13:15');
 await panel.getByRole('button',{name:'我想要出片',exact:true}).click();await panel.getByRole('button',{name:'我想要出片',exact:true}).click();
 assert.equal(await panel.getByRole('textbox',{name:'自由描述旅行需求'}).inputValue(),'我想要出片');
 const sent=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/planning/sessions'))sent.push(r.postDataJSON())});
 await panel.getByRole('button',{name:'先看看还有什么要补充',exact:true}).click();await panel.getByRole('heading',{name:'再补充一点，就更懂你'}).waitFor();
 assert(sent[0].answers.some(a=>a.questionId==='q:meals:0'&&a.values.lunchStart==='11:45'));
 assert.equal(await panel.locator('fieldset').filter({hasText:'吃饭也留一点'}).count(),0);
 await panel.getByRole('checkbox',{name:'暂时跳过：通常几点起床、几点可以出门？'}).check();
 await panel.getByRole('button',{name:'跳过其余问题，直接生成',exact:true}).click();
 await page.getByText('你的行程草案已生成 · 有待确认事项',{exact:true}).waitFor();
 assert(sent[1].skippedQuestionIds.some(id=>id.includes('wake_departure')));
 assert(await page.locator('.planning-result .meal').count()>0);
 const mealText=await page.locator('.planning-result .meal .time b').first().textContent();assert.match(mealText,/约 \d{2}:[0-5][05]–\d{2}:[0-5][05]/);
 assert(await page.getByText(/景点内部另计/).count()>0);
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/tmp/planning-round5-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'补充需求，重新生成',exact:true}).click();assert.equal(await page.locator('.poi[aria-checked="true"]').count(),2);
 assert.deepEqual(errors,[])
});
test('round5: missing key preserves input, offers explicit basic mode, no fake result',{timeout:30000},async t=>{
 const {page,errors}=await setup(t,true);const panel=page.locator('#planning-panel');await panel.getByRole('textbox').fill('带长辈，想多休息');
 await panel.getByRole('button',{name:'按现有信息生成行程',exact:true}).click();await panel.getByRole('alert').waitFor();assert.match(await panel.getByRole('alert').textContent(),/暂未就绪/);assert.equal(await panel.getByRole('textbox').inputValue(),'带长辈，想多休息');assert.equal(await page.locator('.planning-result').count(),0);
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/planning-round5-form.png',fullPage:true});
 await page.locator('.planning-basic summary').click();await page.getByRole('button',{name:'使用基础估算',exact:true}).click();await page.getByText(/基础估算 ·/).waitFor();assert.deepEqual(errors,[])
});
test('round6/7: joint additions, apply, undo, natural revision, Trip query and refresh recovery',{timeout:45000},async t=>{
 const {page,errors}=await setup(t);const panel=page.locator('#planning-panel');
 await panel.getByRole('button',{name:'按现有信息生成行程',exact:true}).click();await page.locator('#revision-workspace').waitFor();
 const workspace=page.locator('#revision-workspace');await workspace.locator('.revision-candidate').first().waitFor();
 const originalUrl=page.url();const candidates=workspace.locator('.revision-candidate input');const count=await candidates.count();assert(count>=2);
 await candidates.nth(0).check();await candidates.nth(1).check();await workspace.getByRole('button',{name:'联合试排勾选景点',exact:true}).click();
 await workspace.getByRole('heading',{name:'调整预览 · 应用后才生效',exact:true}).waitFor();assert(await page.getByText('智能规划 · 第1版',{exact:true}).isVisible());
 await workspace.getByRole('button',{name:'应用这次调整',exact:true}).click();await page.getByText('智能规划 · 第2版',{exact:true}).waitFor();assert.equal(page.url(),originalUrl);
 await page.locator('#revision-workspace').getByRole('button',{name:'撤销上次修改',exact:true}).click();await page.getByText('智能规划 · 第3版',{exact:true}).waitFor();
 await page.locator('#revision-workspace').getByRole('textbox',{name:'修改行程需求'}).fill('删除最后一个景点');await page.locator('#revision-workspace').getByRole('button',{name:'预览智能修改',exact:true}).click();await page.locator('.revision-preview').waitFor();
 await page.locator('#revision-workspace').getByRole('button',{name:'应用这次调整',exact:true}).click();await page.getByText('智能规划 · 第4版',{exact:true}).waitFor();
 await page.reload();await page.getByText('智能规划 · 第4版',{exact:true}).waitFor();
 const ws=page.locator('#revision-workspace');await ws.getByRole('button',{name:'本城餐馆参考',exact:true}).click();await ws.getByText('合成测试餐馆',{exact:true}).waitFor();assert.equal(await ws.getByRole('link',{name:'去携程查看餐馆'}).getAttribute('href'),'https://m.ctrip.com/');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await ws.scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/planning-round6-workspace.png',fullPage:true});assert.deepEqual(errors,[])
});
test('round6: rule-only fallback creates an honestly labeled editable itinerary without AI',{timeout:30000},async t=>{
 const {page,errors}=await setup(t,true);await page.locator('#planning-panel').getByRole('button',{name:'仅按选项规则生成（不解析文字）',exact:true}).click();await page.getByText('规则排程 · 未调用大模型 · 第1版',{exact:true}).waitFor();
 const ws=page.locator('#revision-workspace');await ws.locator('.revision-candidate').first().waitFor();await ws.locator('.revision-manual summary').click();
 const name=await ws.locator('.revision-stop strong').first().textContent();await ws.getByRole('button',{name:`删除${name}`,exact:true}).click();await ws.locator('.revision-preview').waitFor();await ws.getByRole('button',{name:'应用这次调整',exact:true}).click();await page.getByText('规则排程 · 未调用大模型 · 第2版',{exact:true}).waitFor();assert.deepEqual(errors,[])
});
