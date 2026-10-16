import puppeteer from 'puppeteer-core'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {loadRecommendationCatalog,validateRequest,recommend} from '../server/recommendation.mjs'
import {dictionaries,emptyInterests} from '../src/recommendation/options.mjs'
const catalog=await loadRecommendationCatalog()
const publicCatalog={dictionaries,works:[...new Map(catalog.map(c=>[c.ipId,c.ip])).values()],cities:[...new Set(catalog.map(c=>c.city))]}
const browser=await puppeteer.launch({executablePath:process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-gpu','--no-sandbox','--lang=zh-CN']})
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:5178'
await mkdir('test-output',{recursive:true})
const page=await browser.newPage(),errors=[],requests=[]
let profile=null,user=null
page.on('pageerror',e=>errors.push(e.message))
// Exercise real catalog/ranking with an explicitly empty key; never call the live model.
await page.setRequestInterception(true)
page.on('request',async req=>{
 const path=new URL(req.url()).pathname
 const respond=body=>req.respond({status:200,contentType:'application/json',body:JSON.stringify(body)})
 if(path==='/api/recommendations/catalog')return respond(publicCatalog)
 if(path==='/api/recommendations'){
  const body=JSON.parse(req.postData());requests.push(body)
  return respond(await recommend(validateRequest(body,catalog),catalog,{apiKey:''}))
 }
 if(path==='/api/auth/session')return respond({user,isLoggedIn:!!user})
 if(path==='/api/me/interests'){
  if(req.method()==='PUT')profile=JSON.parse(req.postData())
  return respond({profile})
 }
 return req.continue()
})
const clickText=async(text,selector='button')=>{
 const handle=await page.evaluateHandle((text,selector)=>[...document.querySelectorAll(selector)].find(el=>el.textContent.trim()===text && el.getClientRects().length),text,selector)
 assert.ok(handle.asElement(),`Missing visible ${text}`);await handle.asElement().click();await handle.dispose()
}
const expanded=()=>page.$eval('.toggle-filter',el=>el.getAttribute('aria-expanded'))
const waitResults=()=>page.waitForFunction(()=>!document.querySelector('.loading')&&document.querySelector('.recommend-card'))
const openFilters=async()=>{if(await expanded()==='false')await page.click('.filter-summary')}
try{
 await page.setViewport({width:1280,height:900})
 await page.goto(base,{waitUntil:'domcontentloaded'})
 await page.waitForSelector('.recommend-entry');await page.click('.recommend-entry')
 await page.waitForSelector('.toggle-filter');assert.equal(await expanded(),'true')
 assert.equal(await page.$('.mode-grid'),null)
 assert.equal(await page.$('input[type=date]'),null)
 assert.equal(await page.$('input[type=search]'),null)
 assert.equal(await page.$$('#recommend-filters textarea').then(x=>x.length),1)
 assert.doesNotMatch(await page.$eval('main',el=>el.innerText),/我有喜欢的作品|编辑长期兴趣|使用我的兴趣|再说一点你的兴趣/)
 // Completely optional: submit without interests/text/works.
 await page.click('.generate');await waitResults()
 assert.equal(await expanded(),'false');assert.deepEqual(requests.at(-1).interests,emptyInterests());assert.equal(requests.at(-1).text,'')
 // Clicking the left summary and empty header area works, not just the chevron.
 await page.click('.filter-summary');assert.equal(await expanded(),'true')
 await page.type('#recommend-text','喜欢悬疑反转与探险故事')
 await clickText('盗墓笔记','.preference-works button')
 assert.equal(await expanded(),'true')
 const count=requests.length
 await page.evaluate(()=>window.scrollTo(0,0));await page.click('.recommend-heading')
 assert.equal(await expanded(),'false');assert.equal(requests.length,count)
 await page.click('.filter-summary');assert.equal(await expanded(),'true')
 assert.equal(await page.$eval('#recommend-text',el=>el.value),'喜欢悬疑反转与探险故事')
 assert.equal(await page.$eval('.preference-works button[aria-pressed=true]',el=>el.textContent),'盗墓笔记')
 await page.focus('#recommend-text');await page.keyboard.press('Escape');assert.equal(await expanded(),'false')
 assert.equal(await page.$eval('.toggle-filter',el=>el===document.activeElement),true)
 await page.keyboard.press('Enter');assert.equal(await expanded(),'true')
 await page.select('#recommend-city','厦门');assert.ok(await page.$('.changed-notice'))
 await page.click('.generate');await waitResults()
 assert.equal(requests.at(-1).mode,'discover');assert.equal(requests.at(-1).ipId,'')
 assert.ok(requests.at(-1).interests.ipIds.includes('daomu'))
 assert.equal(await page.$eval('.recommend-card h3',el=>el.textContent),'开端·厦门')
 // Collapse and sticky header cannot intercept the route-link click.
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
 assert.ok(await page.$eval('.filter-shell',el=>el.getBoundingClientRect().top)<20)
 await openFilters();await page.evaluate(()=>document.querySelector('.filter-content').scrollTop=0)
 await page.click('.recommend-heading') // Outside click collapses without discarding draft.
 await page.$eval('.route-link',el=>el.scrollIntoView({block:'center'}))
 const beforeRoute=await page.evaluate(()=>scrollY);assert.ok(beforeRoute>0)
 await page.click('.route-link');await page.waitForSelector('.route-intro');await page.waitForSelector('.leaflet-container')
 await page.waitForFunction(()=>scrollY===0);assert.match(page.url(),/line\/kaiduan-xiamen/)
 await page.goBack({waitUntil:'domcontentloaded'});await page.waitForSelector('.recommend-card')
 await page.waitForFunction(y=>Math.abs(scrollY-y)<3,{},beforeRoute)
 assert.equal(await page.$eval('#recommend-city',el=>el.value),'厦门')
 // Empty results and the outside "adjust" action must remain open.
 await clickText('暂不感兴趣');await page.click('.compact-generate');await page.waitForSelector('.empty-state')
 await clickText('调整条件');assert.equal(await expanded(),'true')
 await clickText('清空条件');await page.click('.generate');await waitResults()
 await page.evaluate(()=>window.scrollTo(0,0))
 await page.waitForFunction(()=>[...document.querySelectorAll('.recommend-card img')].every(img=>img.complete))
 await page.screenshot({path:'test-output/recommendation-desktop.png',fullPage:true})
 // Mobile, also verify opening via left side and preserving sticky layout.
 await page.setViewport({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,400))
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 assert.ok(await page.$eval('.filter-shell',el=>el.getBoundingClientRect().height)<100)
 await page.screenshot({path:'test-output/recommendation-mobile.png'})
 await openFilters();assert.ok(await page.$eval('.filter-content',el=>el.getBoundingClientRect().height)<600)
 await page.$eval('.preference-extra',el=>el.scrollIntoView({block:'center'}))
 await page.screenshot({path:'test-output/recommendation-mobile-filters.png'})
 await page.click('.end-note');assert.equal(await expanded(),'false')
 // Old cached mode cannot leave a hidden hard work filter or old results.
 await page.evaluate(()=>sessionStorage.setItem('pilgrimage.recommendation.v1:guest',JSON.stringify({version:1,expires:Date.now()+60000,form:{mode:'by_work',ipId:'longzu',city:'厦门',text:'悬疑',interests:{kinds:[],themes:[],moods:[],ipIds:[]},excludedIpIds:[]},submitted:'old',result:{items:[]},expanded:false})))
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.toggle-filter');await page.waitForFunction(()=>document.querySelector('.feedback')?.textContent.includes('之前选择'))
 assert.equal(await expanded(),'true');assert.equal(await page.$('.results'),null)
 await page.click('.generate');await waitResults()
 assert.equal(requests.at(-1).mode,'discover');assert.equal(requests.at(-1).ipId,'');assert.deepEqual(requests.at(-1).interests.ipIds,['longzu'])
 // Login optional "我的兴趣" sheet, then applying saved interests on recommendation page.
 user={id:'ui-test-user',nickname:'测试读者',avatar:''}
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('dialog[aria-label="我的兴趣"]')
 await clickText('暂时跳过');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.equal(profile.status,'skipped')
 profile={status:'saved',interests:{...emptyInterests(),themes:['mystery'],ipIds:['kaiduan']}}
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.toggle-filter');await openFilters()
 await clickText('清空条件');await clickText('我的兴趣');await page.click('.generate');await waitResults()
 assert.deepEqual(requests.at(-1).interests,profile.interests)
 assert.equal(await page.$('dialog[open]'),null);assert.deepEqual(errors,[])
 console.log('PASS: optional unified preferences, inspiration only, whole summary/outside/keyboard collapse, preserved draft, mobile, route top/back restoration, legacy cache migration, matching login interests')
}catch(error){await page.screenshot({path:'test-output/recommendation-failure.png'});console.log((await page.$eval('main',el=>el.innerText)).slice(-1600));throw error}finally{await browser.close()}
