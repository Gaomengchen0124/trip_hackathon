import puppeteer from 'puppeteer-core'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
const browser=await puppeteer.launch({executablePath:process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-gpu','--no-sandbox','--lang=zh-CN']})
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:5178'
await mkdir('test-output',{recursive:true})
const page=await browser.newPage(), errors=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('response',async response=>{if(new URL(response.url()).pathname==='/api/recommendations')console.log('Recommendation HTTP',response.status())})
const clickText=async(text,selector='button')=>{
 const handle=await page.evaluateHandle((text,selector)=>[...document.querySelectorAll(selector)].find(el=>el.textContent.trim()===text && el.getClientRects().length),text,selector)
 assert.ok(await handle.asElement(),`Missing visible ${text}`);await handle.asElement().click();await handle.dispose()
}
try{
 await page.setViewport({width:1280,height:900})
 await page.goto(base,{waitUntil:'domcontentloaded'})
 await page.waitForSelector('.recommend-entry');await page.click('.recommend-entry')
 await page.waitForSelector('.mode-card');assert.equal(await page.$eval('.toggle-filter',el=>el.getAttribute('aria-expanded')),'true')
 assert.equal(await page.$('input[type=date]'),null)
 await clickText('科幻');await page.click('.generate')
 await page.waitForSelector('.recommend-card',{timeout:10000})
 assert.equal(await page.$eval('.toggle-filter',el=>el.getAttribute('aria-expanded')),'false')
 assert.match(await page.$eval('.source-badge',el=>el.textContent),/基础推荐/)
 await page.waitForFunction(()=>[...document.querySelectorAll('.recommend-card img')].every(img=>img.complete));await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-output/recommendation-desktop.png',fullPage:true})
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
 assert.ok(await page.$eval('.filter-shell',el=>el.getBoundingClientRect().top)<20)
 await page.click('.toggle-filter');await page.select('#recommend-city','厦门')
 assert.ok(await page.$('.changed-notice'));await page.click('.generate')
 await page.waitForFunction(()=>!document.querySelector('.loading')&&document.querySelector('.recommend-card h3')?.textContent==='开端·厦门')
 await page.click('.route-link');await page.waitForSelector('.route-intro');await page.waitForSelector('.leaflet-container');assert.match(page.url(),/line\/kaiduan-xiamen/)
 await page.goBack({waitUntil:'domcontentloaded'});await page.waitForSelector('.recommend-card')
 assert.equal(await page.$eval('#recommend-city',el=>el.value),'厦门')
 await page.click('.toggle-filter')
 await page.click('.mode-card:first-child')
 await page.type('.work-search','李诗情')
 await page.waitForFunction(()=>document.querySelectorAll('.work-grid button').length===1)
 await page.click('.work-grid button');await page.click('.generate')
 await page.waitForFunction(()=>!document.querySelector('.loading')&&document.querySelector('.recommend-card h3')?.textContent==='开端·厦门')
 await page.click('.toggle-filter');await page.select('#recommend-city','北京');await page.click('.generate')
 await page.waitForSelector('.empty-state');assert.equal(await page.$$('.recommend-card').then(x=>x.length),0)
 await page.click('.toggle-filter');await page.select('#recommend-city','厦门');await page.click('.generate')
 await page.waitForSelector('.recommend-card')
 await page.setViewport({width:390,height:844})
 await page.evaluate(()=>window.scrollTo(0,400))
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 assert.ok(await page.$eval('.filter-shell',el=>el.getBoundingClientRect().height)<100)
 await page.screenshot({path:'test-output/recommendation-mobile.png'})
 await page.click('.toggle-filter');assert.ok(await page.$eval('.filter-content',el=>el.getBoundingClientRect().height)<600)
 await page.screenshot({path:'test-output/recommendation-mobile-filters.png'})
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.recommend-card')
 assert.equal(await page.$eval('#recommend-city',el=>el.value),'厦门')
 // UI-only account fixture. Real cookie authorization/isolation are tested in recommendation.test.mjs.
 let profile=null,user={id:'ui-test-user',nickname:'测试读者',avatar:''}
 await page.setRequestInterception(true)
 page.on('request',req=>{
  const path=new URL(req.url()).pathname
  if(path==='/api/auth/session')return req.respond({status:200,contentType:'application/json',body:JSON.stringify({user,isLoggedIn:!!user})})
  if(path==='/api/me/interests'){
   if(req.method()==='PUT')profile=JSON.parse(req.postData())
   return req.respond({status:200,contentType:'application/json',body:JSON.stringify({profile})})
  }
  return req.continue()
 })
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('dialog[aria-label="你喜欢什么样的故事？"]')
 await clickText('暂时跳过');await page.waitForFunction(()=>!document.querySelector('dialog[open]'))
 assert.equal(profile.status,'skipped')
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.mode-card');await new Promise(r=>setTimeout(r,300))
 assert.equal(await page.$('dialog[open]'),null)
 await clickText('个人中心');await clickText('编辑我的内容兴趣')
 await page.waitForSelector('dialog[aria-label="你喜欢什么样的故事？"]')
 await clickText('悬疑推理','dialog button');await clickText('保存兴趣','dialog button');await page.waitForFunction(()=>!document.querySelector('dialog[open]'))
 assert.deepEqual(profile.interests.themes,['mystery'])
 assert.equal(profile.status,'saved')
 assert.deepEqual(errors,[])
 console.log('PASS: homepage, modes, filtering, no-match, sticky/collapse, draft preservation, mobile, skip and profile editing')
}catch(error){await page.screenshot({path:'test-output/recommendation-failure.png'});console.log((await page.$eval('main',el=>el.innerText)).slice(-2400));throw error}finally{await browser.close()}
