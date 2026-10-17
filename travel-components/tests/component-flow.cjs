/* Run after npm ci; install Playwright only in a test checkout. See handoff README. */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
async function main() {
  process.env.VITE_USE_MOCK = 'true'
  const { createServer } = await import('vite')
  const server = await createServer({
    server: { host: '127.0.0.1', port: 4173, strictPort: true }
  })
  await server.listen()
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'warning' && /Vue warn/.test(m.text()))
      errors.push(m.text())
  })
  async function viewStore() {
    return page.evaluate(async () => {
      const { usePlanStore } = await import('/src/stores/plan.js')
      const s = usePlanStore()
      return {
        ids: [...s.checkedIds],
        status: s.result?.status,
        days: s.result?.days.length
      }
    })
  }
  async function clickGenerate() {
    await page.getByRole('button', { name: '生成行程', exact: true }).click()
    await page.getByRole('dialog').waitFor()
  }
  try {
    await page.goto('http://127.0.0.1:4173')
    await page.getByRole('button', { name: '选择繁花·上海' }).first().click()
    await page
      .getByRole('checkbox', { name: '选择黄河路', exact: true })
      .waitFor()
    assert.equal((await viewStore()).ids.length, 0)
    await page.getByLabel('开始日期').fill('2026-10-10')
    await page.getByLabel('结束日期').fill('2026-10-09')
    assert.equal(
      await page
        .getByRole('button', { name: '生成行程', exact: true })
        .isDisabled(),
      true
    )
    await page.getByLabel('结束日期').fill('2026-10-11')
    await page
      .getByRole('checkbox', { name: '选择黄河路', exact: true })
      .check()
    assert.equal(
      await page
        .getByRole('button', { name: '生成行程', exact: true })
        .isDisabled(),
      true
    )
    await page.getByRole('checkbox', { name: '选择外滩', exact: true }).check()
    await clickGenerate()
    assert.equal(
      await page.getByRole('button', { name: '确认追加并重算' }).isDisabled(),
      true
    )
    await page
      .getByRole('checkbox', { name: '追加南京路步行街', exact: true })
      .check()
    await page.getByRole('button', { name: '确认追加并重算' }).click()
    await page.getByRole('button', { name: '保持当前行程' }).waitFor()
    await page.waitForFunction(
      () =>
        !document.querySelector('dialog')?.getAttribute('aria-busy') ||
        document.querySelector('dialog')?.getAttribute('aria-busy') === 'false'
    )
    assert.deepEqual((await viewStore()).ids, ['sh-01', 'sh-c1', 'sh-02'])
    await page.getByRole('button', { name: '保持当前行程' }).click()
    await page.waitForURL('**/result/map')
    await page.getByRole('link', { name: '日程', exact: true }).click()
    await page
      .getByRole('button', { name: '在地图查看黄河路', exact: true })
      .click()
    await page.waitForURL('**/result/map')
    await page.getByRole('dialog', { name: '黄河路', exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'detached' })
    // Detail rendering uses full text, preserves line breaks and never inserts HTML.
    await page.evaluate(async () => {
      const { usePlanStore } = await import('/src/stores/plan.js')
      usePlanStore().pois.find((p) => p.poiId === 'sh-01').quotes = [
        {
          kind: '原著',
          brief: '测试短文本',
          full: '测试长文本第一行\n测试长文本第二行 <b>普通文本</b>',
          source: '自动化测试数据'
        },
        {
          kind: '台词',
          brief: '测试台词',
          full: '测试台词全文',
          source: '自动化测试数据'
        }
      ]
    })
    await page.getByRole('link', { name: '日程', exact: true }).click()
    await page
      .getByRole('button', { name: '在地图查看黄河路', exact: true })
      .click()
    await page.getByText('测试短文本', { exact: true }).waitFor()
    await page.getByRole('button', { name: '查看详情', exact: false }).click()
    await page.waitForURL('**/poi/sh-01')
    await page.getByText('测试台词全文', { exact: true }).waitFor()
    assert.equal(await page.locator('.quote b').count(), 0)
    assert.ok(
      (await page.locator('.quote .text').first().innerText()).includes('\n')
    )
    await page.getByRole('button', { name: '返回', exact: false }).click()
    await page.waitForURL('**/result/map')
    await page.getByRole('link', { name: '继续修改', exact: true }).click()
    assert.equal((await viewStore()).ids.length, 3)
    assert.equal(
      await page
        .getByRole('checkbox', { name: '选择黄河路', exact: true })
        .isChecked(),
      true
    )
    await page.getByRole('button', { name: '全选', exact: true }).nth(0).click()
    await page.getByRole('button', { name: '全选', exact: true }).nth(1).click()
    await page.getByLabel('每天 6 小时', { exact: true }).check()
    await clickGenerate()
    await page
      .getByRole('checkbox', { name: '舍弃黄河路', exact: true })
      .check()
    // Simulate a rejected planner request; the UI must restore ids/result.
    const before = await viewStore()
    await page.evaluate(async () => {
      const { usePlanStore } = await import('/src/stores/plan.js')
      const s = usePlanStore()
      window.restoreSubmit = s.submit
      s.submit = async () => {
        throw Error('Simulated offline')
      }
    })
    await page.getByRole('button', { name: '确认舍弃并重算' }).click()
    await page.getByText('重新规划失败，已恢复原选择，请重试。').waitFor()
    assert.deepEqual((await viewStore()).ids, before.ids)
    await page.evaluate(async () => {
      const { usePlanStore } = await import('/src/stores/plan.js')
      usePlanStore().submit = window.restoreSubmit
    })
    // The failed operation restores the previous result; choose again if the draft reset.
    await page
      .getByRole('checkbox', { name: '舍弃黄河路', exact: true })
      .check()
    await page.getByRole('button', { name: '确认舍弃并重算' }).click()
    await page.waitForFunction(
      () =>
        document.querySelector('dialog')?.getAttribute('aria-busy') === 'false'
    )
    assert.equal((await viewStore()).ids.includes('sh-01'), false)
    await page.getByRole('button', { name: '保留全部，允许超载' }).click()
    await page.waitForURL('**/result/map')
    assert.equal((await viewStore()).status, 'overload')
    await page.getByText(/超载行程：当前排程需/).waitFor()
    await page.getByRole('button', { name: '重新规划', exact: true }).click()
    await page.waitForURL('**/customize/**')
    assert.equal((await viewStore()).ids.length, 0)
    // Mobile, no horizontal overflow; images must resolve at /img, not /customize/img.
    await page.setViewportSize({ width: 390, height: 844 })
    await page
      .getByRole('checkbox', { name: '选择黄河路', exact: true })
      .check()
    await page.getByRole('checkbox', { name: '选择外滩', exact: true }).check()
    await clickGenerate()
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      ),
      false
    )
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('dialog').scrollWidth >
          document.querySelector('dialog').clientWidth
      ),
      false
    )
    await fs.mkdir('test-output', { recursive: true })
    await page.screenshot({ path: 'test-output/mobile-drawer.png' })
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'detached' })
    await page.screenshot({
      path: 'test-output/mobile-customize.png',
      fullPage: true
    })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole('button', { name: '首页', exact: false }).click()
    await page.screenshot({
      path: 'test-output/desktop-home.png',
      fullPage: true
    })
    assert.equal(await page.locator('vite-error-overlay').count(), 0)
    assert.deepEqual(errors, [])
    console.log(
      'PASS: actual Chromium flow — dates, selection, add/remove and replan, rollback, allow overload, dialog Escape, keep/reset selection, timeline to map, mobile overflow, no Vue errors.'
    )
  } finally {
    await browser.close()
    await server.close()
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
