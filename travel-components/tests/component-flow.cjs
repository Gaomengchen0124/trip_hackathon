/*
 * 浏览器端真实交互回归（Chromium）。
 *
 * 运行方式（在仓库根目录，详见 travel-components/README.md）：
 *   npm install --no-save --package-lock=false playwright
 *   npx playwright install chromium
 *   node travel-components/tests/component-flow.cjs
 * 本机已装 Chrome 时可省掉第二行：
 *   CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     node travel-components/tests/component-flow.cjs
 *
 * 2026-10-07 对齐当前仓库（原版写于交付包阶段，多处期望已过期）：
 *   - 结果页合并为单页：地图在上、行程在下，不再有「地图 / 日程 / 导出」Tab；
 *     时间轴点某站 → 地图滚回视野 + 弹卡片，而不是切 Tab
 *   - 定制页校验放宽为「保留 ≥1 个点位即可生成」，不再要求先选满两个点
 *   - 取舍抽屉按钮为「返回修改 / 都舍不得，允许超载 / 确认(追加|舍弃)并重算」；
 *     协商成功后按当前逻辑直接进结果页，不再有「保持当前行程」
 *   - 点位改用 data/lines/*.json 的真实 name / poiId（这里用 黄河路、南京路步行街）
 */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const OUT = process.env.FLOW_OUT || 'test-output'
const IP_STOP = '黄河路' // sh-ip-06，A 级圣地巡礼
const CITY_STOP = '南京路步行街' // sh-sp-04，其他知名景点

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
    if (m.type() === 'warning' && /Vue warn/.test(m.text())) errors.push(m.text())
  })

  const generate = page.getByRole('button', { name: '生成行程', exact: true })
  const dropBtn = page.getByRole('button', { name: '确认舍弃并重算' })
  const addBtn = page.getByRole('button', { name: '确认追加并重算' })
  const dropRows = page.getByRole('checkbox', { name: /^舍弃/ })
  const addRows = page.getByRole('checkbox', { name: /^追加/ })
  const dialog = page.getByRole('dialog')

  async function viewStore() {
    return page.evaluate(async () => {
      const { usePlanStore } = await import('/src/stores/plan.js')
      const s = usePlanStore()
      return {
        ids: [...s.checkedIds],
        status: s.result?.status,
        days: s.result?.days?.length
      }
    })
  }

  /** 点「生成行程」后两种走向：直接出结果页（ok）或先弹取舍抽屉 */
  async function generateAndSettle() {
    const pending = () => new Promise(() => {})
    await generate.click()
    return Promise.race([
      page
        .waitForURL('**/result/map', { timeout: 20000 })
        .then(() => 'result', pending),
      dialog.waitFor({ timeout: 20000 }).then(() => 'dialog', pending)
    ])
  }

  /** overload 抽屉：逐个勾「舍弃」候选，直到砍够（确认按钮可用） */
  async function pickUntilApplicable() {
    const n = await dropRows.count()
    for (let i = 0; i < n; i++) {
      if (await dropBtn.isEnabled()) return
      await dropRows.nth(i).check()
      await page.waitForTimeout(60)
    }
  }

  try {
    // ---------- 1. 首页 → 定制页 ----------
    await page.goto('http://127.0.0.1:4173')
    await page.getByRole('button', { name: '选择繁花·上海' }).first().click()
    await page.getByRole('checkbox', { name: `选择${IP_STOP}`, exact: true }).waitFor()
    assert.equal((await viewStore()).ids.length, 0)

    // ---------- 2. 日期非法 → 不能生成 ----------
    await page.getByLabel('开始日期').fill('2026-10-10')
    await page.getByLabel('结束日期').fill('2026-10-09')
    assert.equal(await generate.isDisabled(), true)

    // ---------- 3. 日期合法 + 一个点位 → 可以生成（当前规则只要求 ≥1 个点位） ----------
    await page.getByLabel('结束日期').fill('2026-10-11')
    await page.getByRole('checkbox', { name: `选择${IP_STOP}`, exact: true }).check()
    assert.equal(await generate.isDisabled(), false)

    // ---------- 4. 时间富余 → 追加抽屉；追加一个后直接进结果页 ----------
    assert.equal(await generateAndSettle(), 'dialog')
    assert.equal(await addBtn.isEnabled(), true) // 一个都不加也能确认
    const hasSuggestion = (await addRows.count()) > 0
    if (hasSuggestion) await addRows.first().check()
    await addBtn.click()
    await page.waitForURL('**/result/map', { timeout: 20000 })
    assert.equal((await viewStore()).ids.length, hasSuggestion ? 2 : 1)

    // ---------- 5. 结果页：单页布局（无 Tab），时间轴点站回到地图 ----------
    assert.equal(await page.getByRole('link', { name: '日程', exact: true }).count(), 0)
    assert.equal(await page.locator('.map-wrap').count(), 1)
    assert.equal(await page.locator('.map-canvas.leaflet-container').count(), 1)
    assert.ok((await page.locator('.timeline .day').count()) >= 1)
    assert.equal(
      await page.evaluate(() => {
        const m = document.querySelector('.map-wrap').getBoundingClientRect()
        const t = document.querySelector('.timeline').getBoundingClientRect()
        return m.top < t.top
      }),
      true
    )
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.getByRole('button', { name: `在地图查看${IP_STOP}`, exact: true }).click()
    await page.waitForFunction(() => {
      const el = document.querySelector('.map-wrap')
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.top < window.innerHeight && r.bottom > 0
    })
    await dialog.waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })

    // ---------- 6. 详情：换行保留、不插入 HTML ----------
    await page.evaluate(async (name) => {
      const { usePlanStore } = await import('/src/stores/plan.js')
      usePlanStore().pois.find((p) => p.name === name).quotes = [
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
    }, IP_STOP)
    await page.getByRole('button', { name: `在地图查看${IP_STOP}`, exact: true }).click()
    await page.getByText('测试短文本', { exact: true }).waitFor()
    await page.getByRole('button', { name: '查看详情', exact: false }).click()
    await page.waitForURL('**/poi/**')
    await page.getByText('测试台词全文', { exact: true }).waitFor()
    assert.equal(await page.locator('.quote b').count(), 0)
    assert.ok((await page.locator('.quote .text').first().innerText()).includes('\n'))
    await page.getByRole('button', { name: '返回', exact: false }).click()
    await page.waitForURL('**/result/map')

    // ---------- 7. 继续修改：保留选择 ----------
    const kept = (await viewStore()).ids
    await page.getByRole('link', { name: '继续修改', exact: true }).click()
    await page.waitForURL('**/customize/**')
    assert.deepEqual((await viewStore()).ids, kept)
    assert.equal(
      await page.getByRole('checkbox', { name: `选择${IP_STOP}`, exact: true }).isChecked(),
      true
    )

    // ---------- 8. 全选 + 6 小时/天 → overload；请求失败要回滚 ----------
    await page.getByRole('button', { name: '全选', exact: true }).nth(0).click()
    await page.getByRole('button', { name: '全选', exact: true }).nth(1).click()
    await page.getByLabel('每天 6 小时', { exact: true }).check()
    assert.equal(await generateAndSettle(), 'dialog')
    assert.equal(await dropBtn.isDisabled(), true) // 还没砍够，不能确认

    const before = await viewStore()
    await page.evaluate(async () => {
      const { usePlanStore } = await import('/src/stores/plan.js')
      const s = usePlanStore()
      window.restoreSubmit = s.submit
      s.submit = async () => {
        throw Error('Simulated offline')
      }
    })
    await pickUntilApplicable()
    await dropBtn.click()
    await page.getByText('重新规划失败，已恢复原选择，请重试。').waitFor()
    assert.deepEqual((await viewStore()).ids, before.ids)
    await page.evaluate(async () => {
      const { usePlanStore } = await import('/src/stores/plan.js')
      usePlanStore().submit = window.restoreSubmit
    })

    // ---------- 9. 都舍不得 → 允许超载 ----------
    await page.getByRole('button', { name: '都舍不得，允许超载' }).click()
    await page.waitForURL('**/result/map')
    assert.equal((await viewStore()).status, 'overload')
    // 超载徽标：一般超载是「超载行程：时间不够…」，全选后物理上排不下是「这趟走不完…」
    const badge = await page.locator('.badge').innerText()
    assert.ok(/超载行程|这趟走不完/.test(badge), `超载徽标文案异常：${badge}`)

    // ---------- 10. 重新规划：清空选择 ----------
    await page.getByRole('button', { name: '重新规划', exact: true }).click()
    await page.waitForURL('**/customize/**')
    assert.equal((await viewStore()).ids.length, 0)

    // ---------- 11. 砍够后重算 → 不再是超载 ----------
    await page.getByRole('button', { name: '全选', exact: true }).nth(0).click()
    await page.getByRole('button', { name: '全选', exact: true }).nth(1).click()
    assert.equal(await generateAndSettle(), 'dialog')
    await pickUntilApplicable()
    assert.equal(await dropBtn.isEnabled(), true)
    await dropBtn.click()
    await page.waitForURL('**/result/map', { timeout: 20000 })
    assert.notEqual((await viewStore()).status, 'overload')

    // ---------- 12. 移动端：无横向溢出 + 截图 ----------
    await page.getByRole('button', { name: '重新规划', exact: true }).click()
    await page.waitForURL('**/customize/**')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('checkbox', { name: `选择${IP_STOP}`, exact: true }).check()
    await page.getByRole('checkbox', { name: `选择${CITY_STOP}`, exact: true }).check()
    await generate.click()
    await dialog.waitFor()
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    )
    assert.equal(
      await page.evaluate(() => {
        const d = document.querySelector('dialog')
        return d.scrollWidth > d.clientWidth
      }),
      false
    )
    await fs.mkdir(OUT, { recursive: true })
    await page.screenshot({ path: `${OUT}/mobile-drawer.png` })
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    await page.screenshot({ path: `${OUT}/mobile-customize.png`, fullPage: true })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole('button', { name: '首页', exact: false }).click()
    await page.screenshot({ path: `${OUT}/desktop-home.png`, fullPage: true })
    assert.equal(await page.locator('vite-error-overlay').count(), 0)
    assert.deepEqual(errors, [])
    console.log(
      'PASS: actual Chromium flow — dates, selection, add/remove and replan, rollback, allow overload, ' +
        'dialog Escape, keep/reset selection, single-page result (map + timeline, no tabs), ' +
        'mobile overflow, no Vue errors.'
    )
  } finally {
    await browser.close()
    await server.close()
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
