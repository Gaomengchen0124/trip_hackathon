// Run after: npm run build -- --outDir test-output/wall-build
import assert from 'node:assert/strict'
import { preview } from 'vite'
import { chromium } from 'playwright'

const server = await preview({
  build: { outDir: 'test-output/wall-build' },
  // Isolated preview: let the OS reserve a free test port without touching dev servers.
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
})
const base = `http://127.0.0.1:${server.httpServer.address().port}`
let browser
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
try {
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  })
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport })
    const errors = []
    const requests = new Set()
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ json: { user: null } }))
    await page.route(/\/(img|brand)\//, route => {
      requests.add(new URL(route.request().url()).pathname)
      return route.fulfill({ contentType: 'image/png', body: image })
    })
    // Keep the wall below the viewport on first paint to test vertical deferral.
    await page.addInitScript(() => {
      new MutationObserver((_, observer) => {
        if (!document.head) return
        const style = document.createElement('style')
        style.textContent = '.ip-wall { margin-top: 1800px !important }'
        style.id = 'defer-wall-test'
        document.head.append(style)
        observer.disconnect()
      }).observe(document, { childList: true, subtree: true })
    })
    await page.goto(base, { waitUntil: 'networkidle' })
    await page.locator('.wall-tile').first().waitFor({ state: 'attached' })
    assert.equal(await page.locator('.ip-wall img').count(), 0, 'Offscreen wall must not create images')
    const uniqueSources = await page.locator('.wall-tile').evaluateAll(tiles =>
      new Set(tiles.map(tile => tile.dataset.photoSrc)).size)
    const workCount = await page.locator('.wall-tile').evaluateAll(tiles =>
      new Set(tiles.map(tile => tile.getAttribute('href'))).size)
    assert.ok(uniqueSources <= workCount * 3, 'At most three photos per work')

    await page.locator('#defer-wall-test').evaluate(style => style.remove())
    await page.locator('.ip-wall').scrollIntoViewIfNeeded()
    await page.waitForFunction(() => document.querySelector('.ip-wall img'))
    await page.waitForTimeout(200)
    const initiallyLoaded = await page.locator('.ip-wall img').evaluateAll(imgs => new Set(imgs.map(img => img.src)).size)
    assert.ok(initiallyLoaded < uniqueSources, 'Horizontal offscreen images must remain deferred')
    const assertVisiblePhotos = async () => {
      await page.waitForFunction(() => [...document.querySelectorAll('.wall-tile')].every(tile => {
        const r = tile.getBoundingClientRect()
        if (r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight) return true
        const img = tile.querySelector('img')
        return img && img.complete && img.naturalWidth > 0
      }))
    }
    await assertVisiblePhotos()
    // Jump the actual animations to another part of each loop in both directions.
    await page.locator('.wall-track').evaluateAll(tracks => tracks.forEach(track => {
      for (const animation of track.getAnimations()) {
        animation.pause()
        animation.currentTime = Number.parseFloat(getComputedStyle(track).animationDuration) * 1000 * 0.48
      }
    }))
    await assertVisiblePhotos()
    const afterMovement = await page.locator('.ip-wall img').evaluateAll(imgs => new Set(imgs.map(img => img.src)).size)
    assert.ok(afterMovement > initiallyLoaded, 'Moving rows must load newly approaching photos')

    const target = await page.locator('.wall-tile').evaluateAll(tiles => {
      const tile = tiles.find(el => {
        const r = el.getBoundingClientRect()
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
      })
      return tile && { href: tile.getAttribute('href'), index: tiles.indexOf(tile) }
    })
    assert.ok(target, 'There must be a fully visible clickable tile')
    await page.locator('.wall-tile').nth(target.index).click()
    await page.waitForURL(`**${target.href}`)
    await page.goBack()
    await page.locator('.ip-wall').scrollIntoViewIfNeeded()
    await assertVisiblePhotos()
    assert.equal(await page.locator('.wall-tile').evaluateAll(tiles =>
      tiles.some(tile => tile.querySelector('.placeholder'))), false)

    // Reduced-motion mode uses manual horizontal scrolling instead of animation.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.locator('.wall-row').evaluateAll(rows => rows.forEach(row => { row.scrollLeft = row.scrollWidth / 3 }))
    await assertVisiblePhotos()
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ viewport, wallPhotoSources: uniqueSources, initiallyLoaded, afterMovement, imageRequests: requests.size, checks: 'offscreen deferral, moving rows, click, return, reduced motion' }))
    await page.close()
  }
} finally {
  await browser?.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
