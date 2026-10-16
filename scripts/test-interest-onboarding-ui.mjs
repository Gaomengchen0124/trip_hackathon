import puppeteer from 'puppeteer-core'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {loadRecommendationCatalog} from '../server/recommendation.mjs'
import {dictionaries} from '../src/recommendation/options.mjs'
const catalog=await loadRecommendationCatalog()
const publicCatalog={dictionaries,works:[...new Map(catalog.map(c=>[c.ipId,c.ip])).values()],cities:[...new Set(catalog.map(c=>c.city))]}
const browser=await puppeteer.launch({executablePath:process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-gpu','--no-sandbox','--lang=zh-CN']})
const page=await browser.newPage(),errors=[],profiles=new Map()
let user=null,blockOnProfile=false,failSave=false,failLoad=false
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:5178'
await mkdir('test-output',{recursive:true})
page.on('pageerror',e=>errors.push(e.message))
await page.setRequestInterception(true)
page.on('request',async req=>{
 const path=new URL(req.url()).pathname
 const reply=(body,status=200)=>req.respond({status,contentType:'application/json',body:JSON.stringify(body)})
 if(path==='/api/auth/session')return reply({user})
 if(path==='/api/auth/email/verify'){
  const {email}=JSON.parse(req.postData());user={id:email,nickname:'兴趣测试读者',avatar:''};return reply({user})
 }
 if(path==='/api/auth/logout'){user=null;return reply({ok:true})}
 if(path==='/api/favorites')return reply({favorites:[]})
 if(path==='/api/recommendations/catalog')return reply(publicCatalog)
 if(path==='/api/me/interests'){
  if(!user)return reply({error:'请先登录'},401)
  if(req.method()==='GET' && failLoad)return reply({error:'接口不存在'},404)
  if(req.method()==='PUT'){
   if(failSave){failSave=false;return reply({error:'保存暂时失败，请重试'},500)}
   profiles.set(user.id,JSON.parse(req.postData()))
  }else if(blockOnProfile){
   blockOnProfile=false
   await page.evaluate(()=>{const d=document.createElement('dialog');d.id='fixture-blocker';d.innerHTML='<button>等待当前弹窗关闭</button>';document.body.append(d);d.showModal()})
  }
  return reply({profile:profiles.get(user.id)||null})
 }
 return req.continue()
})
const clickText=async(text,selector='button')=>{
 const h=await page.evaluateHandle((t,s)=>[...document.querySelectorAll(s)].find(el=>el.textContent.trim()===t&&el.getClientRects().length),text,selector)
 assert.ok(h.asElement(),`Missing ${text}`);await h.asElement().click();await h.dispose()
}
const profileResponse=()=>page.waitForResponse(r=>new URL(r.url()).pathname==='/api/me/interests' && r.request().method()==='GET')
const settled=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
const reload=async()=>{const ready=profileResponse();await page.reload({waitUntil:'domcontentloaded'});await (await ready).json();await settled()}
const waitStep=n=>page.waitForFunction(n=>document.querySelector('.question-progress')?.textContent.includes(`第 ${n} / 4 题`),{},n)
const login=async email=>{
 await page.waitForFunction(()=>[...document.querySelectorAll('.auth-status button')].some(el=>el.textContent.trim()==='登录'))
 await clickText('登录','.auth-status button');await page.waitForSelector('dialog[aria-label="邮箱登录"]')
 await page.type('#travel-login-account',email);await page.type('#travel-login-code','123456')
 const ready=profileResponse()
 await page.click('dialog .login-submit')
 await (await ready).json();await settled()
 await page.waitForFunction(()=>!document.querySelector('dialog[aria-label="邮箱登录"]'))
}
try{
 await page.setViewport({width:1280,height:960});await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForSelector('.recommend-entry')
 assert.equal(await page.$$eval('.recommend-entry',els=>els.length),1)
 assert.equal(await page.$eval('.recommend-entry',el=>el.previousElementSibling.tagName==='H2'&&el.nextElementSibling.classList.contains('cards')),true)
 await page.$eval('.wall',el=>el.scrollIntoView({block:'start'}));await page.hover('.recommend-entry')
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.recommend-entry')).transform==='matrix(1, 0, 0, 1, 0, -3)')
 await page.screenshot({path:'test-output/interest-home-entry.png'})
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}])
 assert.equal(await page.$eval('.recommend-entry',el=>getComputedStyle(el).transform),'none')
 await page.emulateMediaFeatures([])
 // Fast profile response behind another open dialog must not lose the onboarding prompt.
 blockOnProfile=true;await login('first@example.com');await page.waitForSelector('#fixture-blocker[open]')
 assert.equal(await page.$('.question-card'),null)
 await page.evaluate(()=>{const d=document.querySelector('#fixture-blocker');d.close();d.remove()})
 await waitStep(1)
 assert.equal(await page.$$('dialog .interest-fields legend').then(x=>x.length),1)
 await clickText('动漫','dialog button');await page.screenshot({path:'test-output/interest-step-desktop.png'})
 await clickText('下一题','dialog button');await waitStep(2);await clickText('跳过本题','dialog button');await waitStep(3)
 await clickText('温暖治愈','dialog button');await clickText('上一题','dialog button');await waitStep(2)
 await clickText('科幻','dialog button');await clickText('下一题','dialog button');await waitStep(3)
 assert.equal(await page.$eval('dialog button[aria-pressed=true]',el=>el.textContent),'温暖治愈')
 await clickText('下一题','dialog button');await waitStep(4)
 await page.type('dialog textarea[aria-label="自由填写喜欢的作品"]','葬送的芙莉莲，喜欢旅途中的陪伴');
 await page.screenshot({path:'test-output/interest-free-works.png'});
 await page.type('dialog input[type=search]','哈利');await clickText('哈利波特','dialog button')
 failSave=true;await clickText('完成并保存','dialog button')
 await page.waitForFunction(()=>document.querySelector('dialog [role=alert]')?.textContent.includes('保存暂时失败'))
 assert.equal(profiles.has('first@example.com'),false)
 assert.equal(await page.$eval('dialog button[aria-pressed=true]',el=>el.textContent),'哈利波特')
 await clickText('完成并保存','dialog button');await page.waitForFunction(()=>!document.querySelector('dialog[open]'))
 assert.deepEqual(profiles.get('first@example.com'),{status:'saved',interests:{kinds:['anime'],themes:['scifi'],moods:['healing'],ipIds:['harrypotter'],favoriteWorks:'葬送的芙莉莲，喜欢旅途中的陪伴'}})
 await reload();assert.equal(await page.$('dialog[open]'),null)
 await clickText('退出登录');await login('first@example.com');await settled();assert.equal(await page.$('dialog[open]'),null)
 // Every question is skippable, and a skipped account is not interrupted on refresh.
 await clickText('退出登录');await login('skip@example.com');await waitStep(1)
 await page.setViewport({width:390,height:844});await page.screenshot({path:'test-output/interest-step-mobile.png'})
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 for(let n=1;n<=4;n++){await waitStep(n);if(n===4)await page.type('dialog textarea','星际穿越');await clickText('跳过本题','dialog button')}
 await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.equal(profiles.get('skip@example.com').status,'skipped')
 assert.ok(Object.values(profiles.get('skip@example.com').interests).every(x=>x.length===0))
 await reload();assert.equal(await page.$('dialog[open]'),null)
 await clickText('退出登录');await login('skip@example.com');await waitStep(1)
 await clickText('暂时跳过','dialog button');await page.waitForFunction(()=>!document.querySelector('dialog[open]'))
 assert.equal(profiles.get('skip@example.com').status,'skipped')
 // A stale/missing backend endpoint must offer retry, never silently hide onboarding or overwrite a saved profile.
 await clickText('退出登录');failLoad=true
 profiles.set('recover@example.com',{status:'saved',interests:{kinds:['anime'],themes:['scifi'],moods:[],ipIds:[]}})
 await login('recover@example.com');await waitStep(1)
 assert.ok(await page.$eval('dialog [role=alert]',el=>el.textContent.includes('兴趣服务尚未就绪')))
 assert.equal(await page.$eval('dialog .step-actions .btn',el=>el.disabled),true)
 await clickText('暂时跳过','dialog button');await page.waitForFunction(()=>!document.querySelector('dialog[open]'))
 assert.deepEqual(profiles.get('recover@example.com').interests.themes,['scifi'])
 await clickText('退出登录');await login('recover@example.com');await waitStep(1)
 failLoad=false;const recovered=profileResponse();await clickText('重试加载','dialog button');await (await recovered).json();await settled();await page.waitForSelector('dialog button[aria-pressed=true]')
 assert.equal(await page.$eval('dialog button[aria-pressed=true]',el=>el.textContent),'动漫')
 await clickText('下一题','dialog button');await waitStep(2)
 assert.equal(await page.$eval('dialog button[aria-pressed=true]',el=>el.textContent),'科幻')
 await clickText('下一题','dialog button');await waitStep(3);await clickText('下一题','dialog button');await waitStep(4)
 await clickText('完成并保存','dialog button');await page.waitForFunction(()=>!document.querySelector('dialog[open]'))
 assert.deepEqual(profiles.get('recover@example.com').interests.themes,['scifi'])
 assert.deepEqual(errors,[])
 console.log('PASS: missing backend error/retry preserves profile, real login UI transition, queued onboarding, four optional cards, previous/preserved choices, save retry, refresh/login suppression, per-question/all skip, mobile, homepage placement and hover/reduced motion')
}catch(e){await page.screenshot({path:'test-output/interest-failure.png'});throw e}finally{await browser.close()}
