// 主流程截图脚本：驱动 Edge 无头浏览器，输出到 screenshots/
// 用法：先 npm run dev，再 node scripts/screenshot.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const OUT = 'screenshots'
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--disable-gpu', '--no-sandbox', '--lang=zh-CN'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
const snap = (name) => page.screenshot({ path: `${OUT}/${name}.png` })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const BASE = 'http://localhost:5173'

// S1 首页
await page.goto(BASE, { waitUntil: 'networkidle0' })
await sleep(400)
await snap('01-home')

// 搜索联想
await page.type('.searchbox input', '黄河路')
await sleep(500)
await snap('02-search')

// 进 S3
await page.click('.dropdown .item')
await sleep(800)
await snap('03-customize')

// 点两栏各自的「全选」（8 + 15 = 23 个点 → 必然装不下 → 触发取舍抽屉，demo 主场景）
const selectAllBtns = await page.$$('.cols .tools button')
await selectAllBtns[0].click()
await sleep(200)
await selectAllBtns[2].click() // 每栏第一个是「全选」，跳过的 1 是上一栏的「清空」

// 填日期：分开设置，每次重新查询（Vue 重渲染会让旧元素引用失效）
const [start, end] = [new Date(), new Date(Date.now() + 2 * 864e5)]
  .map((d) => d.toISOString().slice(0, 10))
const setDate = (idx, v) =>
  page.$$eval('.timebar input[type=date]', (els, i, val) => {
    const el = els[i]
    el.value = val
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, idx, v)
await setDate(0, start)
await sleep(250)
await setDate(1, end)
await sleep(300)
await snap('04-customize-selected')

// 提交 → 视结果而定（装不下会弹抽屉）
await page.click('.submit-bar .btn')
await sleep(1200)
await snap('05-after-submit')

// 如果有 S4 抽屉：逐个勾舍弃项，直到「确认」按钮亮起（砍够了），再确认
const drawer = await page.$('.sheet')
if (drawer) {
  const rows = await page.$$('.sheet .row')
  for (const r of rows) {
    const confirmBtn = await page.$('.sheet .actions .btn')
    const disabled = await page.evaluate((b) => b.disabled, confirmBtn)
    if (!disabled) break
    const cb = await r.$('input')
    if (cb) await cb.click()
    await sleep(150)
  }
  await snap('06-drawer')
  await page.click('.sheet .actions .btn')
  await sleep(1200)
}

// S5 结果页 · 地图 Tab
await snap('07-result-map')

// 点标点 → S6 卡片（最多试 6 个，跳过没照片的）
let cardShot = false
for (let i = 0; i < 6 && !cardShot; i++) {
  const markers = await page.$$('.marker')
  if (!markers[i]) break
  await markers[i].click()
  await sleep(500)
  const hasImg = await page.$('.overlay-mask .photo-img')
  if (hasImg) {
    await snap('08-poi-card')
    cardShot = true
  } else {
    await page.keyboard.press('Escape')
    await page.click('.overlay-mask', { offset: { x: 5, y: 5 } }).catch(() => {})
    await sleep(300)
  }
}
if (!cardShot) await snap('08-poi-card')

// S7 详情（卡片浮层里的「查看详情」按钮）
await page.click('.overlay-mask .footer .btn')
await sleep(600)
await snap('09-detail')
await page.goBack()
await sleep(600)

// 日程 Tab
await page.click('a.tab[href="/result/day"]')
await sleep(400)
await snap('10-day')

// 导出·携程 Tab
await page.click('a.tab[href="/result/export"]')
await sleep(400)
await snap('11-export')

await browser.close()
console.log('✅ 截图完成 →', OUT)
