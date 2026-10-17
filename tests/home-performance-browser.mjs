// Build first: npm run build -- --outDir test-output/performance-build
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { preview } from 'vite'
import { chromium } from 'playwright'

const server = await preview({ build: { outDir: 'test-output/performance-build' }, preview: { host: '127.0.0.1', port: 0, strictPort: true } })
const base = `http://127.0.0.1:${server.httpServer.address().port}`
const source = JSON.parse(await readFile('data/lines/fanhua-shanghai.json', 'utf8'))
const catalog = JSON.parse(await readFile('src/data/home-catalog.json', 'utf8'))
const lineChunks = Object.keys(catalog.files)
let browser
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
  for (const options of [
    { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, theme: 'sky' },
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, theme: 'sky' },
  ]) {
    const context = await browser.newContext(options)
    const page = await context.newPage(), errors = [], requests = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => requests.push(new URL(request.url()).pathname))
    await context.route('**/api/**', route => route.fulfill({ json: { user: null, favorites: [] } }))
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === base ? route.fallback() : route.abort())
    await page.goto(`${base}/?theme=${options.theme}`, { waitUntil: 'networkidle' })
    await page.locator('.ip-wall img').first().waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll('.ip-wall img')].every(img => img.complete && img.naturalWidth))
    assert.ok(!requests.some(path => lineChunks.some(id => path.startsWith(`/assets/${id}-`))), 'Home must not download full line documents')
    assert.ok(!requests.some(path => /\/(plan-result|planner)-/.test(path)), 'Home must not download planning code')
    const originals = requests.filter(path => /\/(img|brand)\//.test(path) && path !== '/brand/dolphin-states.png')
    assert.deepEqual(originals, [], 'Home photos and banners must use optimized images rather than originals')
    const banner = await page.locator('.home-masthead img').evaluate(img => ({ src: new URL(img.currentSrc).pathname, width: img.naturalWidth }))
    assert.match(banner.src, /optimized\/.*\.webp$/)
    assert.ok(await page.locator('link[rel="preload"][as="image"]').count() === 1)
    const photoChoices = await page.locator('.ip-wall img').evaluateAll(imgs => [...new Set(imgs.map(img => new URL(img.currentSrc).pathname))])
    assert.ok(photoChoices.every(src => src.endsWith('.webp')))
    const imagePaths = [...new Set(requests.filter(path => path.startsWith('/optimized/')))]
    assert.equal(imagePaths.filter(path => /\/(brand-story-pilgrim|img-story-pilgrim-masthead)/.test(path)).length, 1, 'Preload and picture must select the same single banner')
    const bytes = (await Promise.all(imagePaths.map(path => stat(`public${path}`).then(file => file.size)))).reduce((a, b) => a + b, 0)
    const wallBytes = (await Promise.all(photoChoices.map(path => stat(`public${path}`).then(file => file.size)))).sort((a, b) => a - b)
    await page.screenshot({ path: `test-output/home-${options.viewport.width}-${options.theme}.png`, fullPage: true })

    await page.locator('.searchbox input').fill('东方明珠')
    await page.locator('.searchbox .item').first().waitFor()
    assert.ok(!requests.some(path => lineChunks.some(id => path.startsWith(`/assets/${id}-`))), 'Search must use the lightweight POI index')
    await page.locator('.searchbox .item').filter({ hasText: '繁花' }).first().click()
    await page.locator('.route-intro h1').waitFor()
    assert.ok(requests.some(path => path.startsWith('/assets/fanhua-shanghai-')))
    assert.ok(!requests.some(path => lineChunks.filter(id => id !== 'fanhua-shanghai').some(id => path.startsWith(`/assets/${id}-`))), 'Only the selected route document may load')
    assert.ok(!requests.some(path => /\/(plan-result|planner)-/.test(path)), 'Route introduction must not load planning code')
    const detailSrc = await page.locator('.hero-photo img').evaluate(img => new URL(img.currentSrc || img.src).pathname)
    assert.equal(detailSrc, `/${source.line.cover}`, 'Detail hero retains the full-size original')
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ viewport: options.viewport, dpr: options.deviceScaleFactor, theme: options.theme, optimizedPhotoAndBannerBytes: bytes, wallPhotos: photoChoices.length, selectedWallWidths: [...new Set(photoChoices.map(path => Number(path.match(/-(\d+)\.webp$/)[1])))], wallPhotoMedianBytes: wallBytes[Math.floor(wallBytes.length / 2)], wallPhotoMaxBytes: wallBytes.at(-1), banner }))
    await context.close()
  }

  // Admin previews may contain a new ID that is absent from the published index.
  const context = await browser.newContext()
  await context.route('**/api/**', route => route.fulfill({ json: { user: null, favorites: [] } }))
  await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === base ? route.fallback() : route.abort())
  const draft = structuredClone(source)
  draft.line.lineId = 'preview-only-line'
  draft.line.title = 'Preview draft route'
  await context.addInitScript(doc => sessionStorage.setItem('preview-docs', JSON.stringify({ [doc.line.lineId]: doc })), draft)
  const page = await context.newPage()
  await page.goto(`${base}/line/preview-only-line?preview=1`)
  await page.getByRole('heading', { name: 'Preview draft route', exact: true }).waitFor()
  await context.close()
  console.log('Search, per-route chunks, original detail images and preview-only drafts passed.')
} finally {
  await browser?.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
