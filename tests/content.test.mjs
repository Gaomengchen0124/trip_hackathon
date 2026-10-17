import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { createContentStore, aggregateBundledIps } from '../server/content-store.mjs'
import { createContentValidator } from '../server/content-validate.mjs'
import { createContentServer } from '../server/content.mjs'

const validLine = (lineId = 'test-xian') => ({
  _bounds: { lng: [108.8, 109.1], lat: [34.1, 34.4] },
  _expected: { ipStops: [1, 12], cityStops: [1, 20], maxTierS: 3 },
  line: { lineId, ipId: 'test', title: '测试·西安', city: '西安', cover: '', recommendDays: 2 },
  clusters: ['城内'],
  ipStops: [{
    poiId: `${lineId}-ip-01`, lineId, type: 'ip', name: '测试点', alias: '', lng: 108.95, lat: 34.25,
    cluster: '城内', tier: 'A', durationNormal: 60, durationRush: 30,
    intro: '一个测试点位', tips: '', skipNote: '',
    quotes: [{ kind: '原著', brief: '', full: '原文', source: '《测试》第一章' }],
    realPhoto: '/api/content/img/none.jpg', photoCredit: '测试', photos: ['/api/content/img/none.jpg'],
  }],
  cityStops: [{
    poiId: `${lineId}-sp-01`, lineId, type: 'classic', name: '城市景点', lng: 108.96, lat: 34.26,
    cluster: '城内', popularity: 3, durationNormal: 90, durationRush: 45,
    intro: '一个城市景点', realPhoto: 'img/x.jpg', photoCredit: '测试', ticket: '', openHours: '',
  }],
})
const validIp = (ipId = 'test') => ({ _schema: 'ip-v1', ip: { ipId, name: '测试作品', author: '测试作者', kind: 'novel', cover: '', aliases: [] }, lines: { xian: validLine(`${ipId}-xian`) } })
/** 带【待填】和空坐标的未完成草稿（draft 应放行、publish 应拦截） */
const draftIp = (ipId = 'rough') => ({
  _schema: 'ip-v1',
  ip: { ipId, name: '【待填】作品名', author: '', kind: 'novel', cover: '', aliases: [] },
  lines: {
    xian: {
      _bounds: { lng: [108.8, 109.1], lat: [34.1, 34.4] },
      line: { lineId: `${ipId}-xian`, ipId, title: `【待填】${ipId}`, city: '西安', cover: '', recommendDays: 2 },
      clusters: ['【待填】片区'],
      ipStops: [{ poiId: `${ipId}-xian-ip-01`, lineId: `${ipId}-xian`, type: 'ip', name: '', lng: null, lat: null, cluster: '', tier: '', durationNormal: 60, durationRush: 30, intro: '', quotes: [], realPhoto: '', photos: [], photoCredit: '', skipNote: '', tips: '' }],
      cityStops: [],
    },
  },
})

/** 假 auth：cookie 含 admin=1 → admin，user=1 → 普通用户；记录内部回写调用 */
function fakeFetch(calls) {
  return async (url, opts = {}) => {
    calls.push({ url, opts })
    if (url.includes('/api/auth/session')) {
      const cookie = opts.headers?.cookie ?? ''
      const user = cookie.includes('admin=1') ? { id: 'boss', nickname: '老板', role: 'admin' }
        : cookie.includes('user=1') ? { id: 'peon', nickname: '路人', role: 'user' } : null
      return { ok: true, json: async () => ({ user, isLoggedIn: !!user }) }
    }
    if (url.includes('/api/poi-submissions/')) return { ok: true, json: async () => ({ ok: true }) }
    return { ok: false, json: async () => ({ error: 'not found' }) }
  }
}
const admin = { Cookie: 'x=1; admin=1', Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }
const peon = { Cookie: 'x=1; user=1', Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }

async function mkServer(dir, calls = [], extraFetch = null) {
  const store = createContentStore({ file: ':memory:' })
  const baseFetch = fakeFetch(calls)
  const server = createContentServer({
    store,
    validator: createContentValidator({ uploadsDir: join(dir, 'uploads') }),
    origin: 'http://localhost:5173',
    uploadsDir: join(dir, 'uploads'),
    submissionsDir: join(dir, 'submissions'),
    bundledLinesDir: join(dir, 'bundled'),
    cityPoolDir: join(dir, 'cities'),
    fetchImpl: extraFetch ? ((url, opts) => extraFetch(url, opts) ?? baseFetch(url, opts)) : baseFetch,
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  return { store, server, base: `http://127.0.0.1:${server.address().port}` }
}

test('IP CRUD: draft tolerates placeholders/empty coords; publish enforces full rules', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-content-'))
  const { store, server, base } = await mkServer(dir)
  try {
    // 草稿可存（带【待填】+空坐标）
    const created = await fetch(`${base}/api/manage/content/ips`, { method: 'POST', headers: admin, body: JSON.stringify({ doc: draftIp() }) })
    assert.equal(created.status, 201)
    assert.equal((await created.json()).ip.status, 'draft')
    assert.deepEqual((await (await fetch(`${base}/api/content/lines`)).json()).lines, {})
    // 上架被 422 拦截并给出规则
    const pub = await fetch(`${base}/api/manage/content/ips/rough/status`, { method: 'PATCH', headers: admin, body: JSON.stringify({ status: 'online' }) })
    assert.equal(pub.status, 422)
    const { issues } = await pub.json()
    assert.ok(issues.length > 3)
    assert.ok(issues.some((i) => i.ruleId === 'IP03'))  // 【待填】占位符（IP/线路级）
    assert.ok(issues.some((i) => i.ruleId === 'S08'))   // 点位必填字段
    assert.ok(issues.some((i) => i.ruleId === 'C01'))  // 坐标空
    // 修成完整数据 → 上架 → 公开接口拆线可见 + hidden 为空
    const fixed = validIp('rough')
    const put = await fetch(`${base}/api/manage/content/ips/rough`, { method: 'PUT', headers: admin, body: JSON.stringify({ doc: fixed }) })
    assert.equal(put.status, 200)
    const pub2 = await fetch(`${base}/api/manage/content/ips/rough/status`, { method: 'PATCH', headers: admin, body: JSON.stringify({ status: 'online' }) })
    assert.equal(pub2.status, 200)
    const api = await (await fetch(`${base}/api/content/lines`)).json()
    assert.ok(api.lines['rough-xian'])
    assert.equal(api.lines['rough-xian'].ip.name, '测试作品')
    assert.deepEqual(api.hidden, [])
    // 下架 → hidden 出现、lines 消失
    await fetch(`${base}/api/manage/content/ips/rough/status`, { method: 'PATCH', headers: admin, body: JSON.stringify({ status: 'offline' }) })
    const api2 = await (await fetch(`${base}/api/content/lines`)).json()
    assert.deepEqual(api2.lines, {})
    assert.deepEqual(api2.hidden, ['rough-xian'])
    // 权限
    assert.equal((await fetch(`${base}/api/manage/content/ips`)).status, 401)
    assert.equal((await fetch(`${base}/api/manage/content/ips`, { headers: peon })).status, 403)
    // 审计
    const audit = await (await fetch(`${base}/api/manage/content/audit`, { headers: admin })).json()
    const actions = audit.items.map((i) => i.action)
    assert.ok(actions.includes('ip.create'))
    assert.ok(actions.includes('ip.publish'))
    assert.ok(actions.includes('ip.unpublish'))
  } finally { await new Promise(r => server.close(r)); store.close(); await rm(dir, { recursive: true, force: true }) }
})

test('bundled aggregation: multi-line IP merges; manage list mixes db+bundled; import on edit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-content-'))
  try {
    const bundledDir = join(dir, 'bundled')
    await mkdir(bundledDir, { recursive: true })
    const mk = (lineId, city) => JSON.stringify({
      _bounds: { lng: [115, 118], lat: [39, 41] }, ip: { ipId: 'multi', name: '多线作品', author: '', kind: 'novel', cover: '', aliases: [] },
      line: { lineId, ipId: 'multi', title: `多线·${city}`, city, cover: '', recommendDays: 2 },
      clusters: ['片区'], ipStops: [], cityStops: [],
    })
    await writeFile(join(bundledDir, 'multi-beijing.json'), mk('multi-beijing', '北京'))
    await writeFile(join(bundledDir, 'multi-japan.json'), mk('multi-japan', '东京'))
    const aggregated = aggregateBundledIps(bundledDir)
    assert.equal(aggregated.size, 1)
    assert.deepEqual(Object.keys(aggregated.get('multi').doc.lines).sort(), ['东京', '北京'].sort())

    const { store, server, base } = await mkServer(dir)
    try {
      const list = await (await fetch(`${base}/api/manage/content/ips`, { headers: admin })).json()
      assert.equal(list.ips.length, 1)
      assert.equal(list.ips[0].status, 'bundled')
      assert.equal(Object.keys(list.ips[0].doc.lines).length, 2)
      // 编辑保存 → 整包导入为草稿，打包行不再重复出现
      const doc = list.ips[0].doc
      doc.ip.author = '作者甲'
      const put = await fetch(`${base}/api/manage/content/ips/multi`, { method: 'PUT', headers: admin, body: JSON.stringify({ doc }) })
      assert.equal(put.status, 200)
      const list2 = await (await fetch(`${base}/api/manage/content/ips`, { headers: admin })).json()
      assert.equal(list2.ips.length, 1)
      assert.equal(list2.ips[0].status, 'online')
      assert.equal(store.onlineLines()['multi-beijing'].ip.author, '')
      assert.equal(list2.ips[0].doc.ip.author, '作者甲')
      // 下架打包 IP（未编辑过）→ 导入为 offline → hidden 含两条线
      const bundled2 = join(dir, 'bundled2')
      // （直接在库内新建 offline 验证 hidden 聚合即可，路径已在上个用例覆盖）
    } finally { await new Promise(r => server.close(r)); store.close() }
    await rm(dir, { recursive: true, force: true })
  } catch (e) { await rm(dir, { recursive: true, force: true }); throw e }
})

test('draft exempts C02/C03 (bounds/cluster mismatch), publish enforces them', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-content-'))
  const { store, server, base } = await mkServer(dir)
  try {
    const doc = validIp('loose')
    const poi = doc.lines.xian.ipStops[0]
    poi.lng = 100 // 越界
    poi.cluster = '不存在的片区' // 不在 clusters 列表
    const created = await fetch(`${base}/api/manage/content/ips`, { method: 'POST', headers: admin, body: JSON.stringify({ doc }) })
    assert.equal(created.status, 201, JSON.stringify(await created.json()))
    const pub = await fetch(`${base}/api/manage/content/ips/loose/status`, { method: 'PATCH', headers: admin, body: JSON.stringify({ status: 'online' }) })
    assert.equal(pub.status, 422)
    const { issues } = await pub.json()
    assert.ok(issues.some((i) => i.ruleId === 'C02'))
    assert.ok(issues.some((i) => i.ruleId === 'C03'))
  } finally { await new Promise(r => server.close(r)); store.close(); await rm(dir, { recursive: true, force: true }) }
})

test('IP04: placeholder photo credit blocks publish but not draft', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-content-'))
  const { store, server, base } = await mkServer(dir)
  try {
    const doc = validIp('ph')
    doc.lines.xian.ipStops[0].photoCredit = '占位图，待替换'
    const created = await fetch(`${base}/api/manage/content/ips`, { method: 'POST', headers: admin, body: JSON.stringify({ doc }) })
    assert.equal(created.status, 201, '草稿应允许占位图')
    const pub = await fetch(`${base}/api/manage/content/ips/ph/status`, { method: 'PATCH', headers: admin, body: JSON.stringify({ status: 'online' }) })
    assert.equal(pub.status, 422)
    const { issues } = await pub.json()
    assert.ok(issues.some((i) => i.ruleId === 'IP04'))
  } finally { await new Promise(r => server.close(r)); store.close(); await rm(dir, { recursive: true, force: true }) }
})

test('line-level status: publish selected city lines only', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-content-'))
  const { store, server, base } = await mkServer(dir)
  try {
    const doc = validIp('multi')
    const bj = JSON.parse(JSON.stringify(validLine('multi-beijing')))
    bj.line.city = '北京'
    bj.ipStops[0].lng = 116.4; bj.ipStops[0].lat = 39.9
    bj.cityStops[0].lng = 116.41; bj.cityStops[0].lat = 39.92
    doc.lines['北京'] = bj
    assert.equal((await fetch(`${base}/api/manage/content/ips`, { method: 'POST', headers: admin, body: JSON.stringify({ doc }) })).status, 201)
    // 只上架西安线
    const pub = await fetch(`${base}/api/manage/content/ips/multi/status`, { method: 'PATCH', headers: admin, body: JSON.stringify({ status: 'online', cityKeys: ['xian'] }) })
    assert.equal(pub.status, 200)
    const api = await (await fetch(`${base}/api/content/lines`)).json()
    assert.ok(api.lines['multi-xian'], '西安线应已上线')
    assert.ok(!api.lines['multi-beijing'], '北京线不应上线')
    const ip = store.getIp('multi')
    assert.equal(ip.doc.lines.xian.status, 'online')
    assert.equal(ip.doc.lines['北京'].status, 'draft')
    assert.equal(ip.status, 'draft')   // 混合状态 → IP 级显示草稿
    // 缺图校验：把北京线唯一点位图删掉 → 单独上架北京线应被 422 拦（cityKeys 过滤校验）
    ip.doc.lines['北京'].ipStops[0].realPhoto = ''
    ip.doc.lines['北京'].cityStops[0].realPhoto = ''
    store.saveIp('multi', ip.doc, 'tester')
    const pubBj = await fetch(`${base}/api/manage/content/ips/multi/status`, { method: 'PATCH', headers: admin, body: JSON.stringify({ status: 'online', cityKeys: ['北京'] }) })
    assert.equal(pubBj.status, 422, '北京线数据不全应被拦截')
    // 全量上架（不带 cityKeys）→ 也被拦
    const pubAll = await fetch(`${base}/api/manage/content/ips/multi/status`, { method: 'PATCH', headers: admin, body: JSON.stringify({ status: 'online' }) })
    assert.equal(pubAll.status, 422)
    // 下架西安线 → hidden 出现
    await fetch(`${base}/api/manage/content/ips/multi/status`, { method: 'PATCH', headers: admin, body: JSON.stringify({ status: 'offline', cityKeys: ['xian'] }) })
    const api2 = await (await fetch(`${base}/api/content/lines`)).json()
    assert.ok(!api2.lines['multi-xian'])
    assert.deepEqual(api2.hidden, ['multi-xian'])
  } finally { await new Promise(r => server.close(r)); store.close(); await rm(dir, { recursive: true, force: true }) }
})

test('fetch-photos: Commons candidates fill realPhoto/photos/photoCredit; city-stops returns sibling snapshot', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-content-'))
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(200, 1), Buffer.from([0xff, 0xd9])])
  const commonsFetch = (url) => {
    if (url.includes('commons.wikimedia.org')) {
      return { ok: true, json: async () => ({ query: { pages: { '1': { title: 'File:Test.jpg', imageinfo: [{ thumburl: 'https://img.test/1.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Test.jpg', extmetadata: { Artist: { value: '摄影师甲' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] } } } }) }
    }
    if (url.startsWith('https://img.test/')) return { ok: true, arrayBuffer: async () => jpeg }
    return null
  }
  const { store, server, base } = await mkServer(dir, [], commonsFetch)
  try {
    // 建 IP：一个点位缺图
    const doc = validIp()
    doc.lines.xian.ipStops[0].realPhoto = ''
    doc.lines.xian.ipStops[0].photos = []
    await fetch(`${base}/api/manage/content/ips`, { method: 'POST', headers: admin, body: JSON.stringify({ doc }) })
    // 单点位抓图：响应含明细
    const res = await fetch(`${base}/api/manage/content/fetch-photos`, { method: 'POST', headers: admin, body: JSON.stringify({ ipId: 'test', cityKey: 'xian', poiId: 'test-xian-ip-01' }) })
    assert.equal(res.status, 200)
    const { filled, failed } = await res.json()
    assert.deepEqual(Object.keys(filled), ['test-xian-ip-01'])
    assert.match(filled['test-xian-ip-01'].photos[0], /^\/api\/content\/img\/test-xian-ip-01-1\.jpg$/)
    assert.match(filled['test-xian-ip-01'].credit, /摄影师甲/)
    assert.deepEqual(failed, [])
    const ip = store.getIp('test')
    const poi = ip.doc.lines.xian.ipStops[0]
    assert.equal(poi.photos.length, 1)
    assert.match(poi.photos[0], /^\/api\/content\/img\/test-xian-ip-01-1\.jpg$/)
    assert.match(poi.photoCredit, /摄影师甲/)
    assert.match(poi.photoCredit, /CC BY-SA 4\.0/)
    assert.match(poi.photoCredit, /Wikimedia Commons/)
    // 抓到的图公开可访问
    assert.equal((await fetch(base + poi.photos[0])).status, 200)
    // 点位已有图 → 全量抓图无目标（封面不抓）；城市景点池里的钟楼也无 realPhoto？池快照里 cityStops[0] 有 realPhoto 'img/x.jpg'，视为已有
    const again = await fetch(`${base}/api/manage/content/fetch-photos`, { method: 'POST', headers: admin, body: JSON.stringify({ ipId: 'test', cityKey: 'xian' }) })
    const againBody = await again.json()
    assert.deepEqual(againBody.filled, {})
    assert.equal(againBody.message, '没有缺图的点位')
    // city-stops 返回本 IP 的西安快照
    const cs = await (await fetch(`${base}/api/manage/content/city-stops?city=${encodeURIComponent('西安')}`, { headers: admin })).json()
    assert.equal(cs.stops.length, 1)
    assert.match(cs.source, /测试作品/)
    assert.equal((await fetch(`${base}/api/manage/content/city-stops?city=${encodeURIComponent('不存在')}`, { headers: admin })).status, 200)
  } finally { await new Promise(r => server.close(r)); store.close(); await rm(dir, { recursive: true, force: true }) }
})

test('city-pool endpoint, ai draft 501, image upload, promote into IP doc', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-content-'))
  const calls = []
  const cities = join(dir, 'cities')
  await mkdir(cities, { recursive: true })
  await writeFile(join(cities, 'xian.json'), JSON.stringify({ city: '西安', spots: [{ key: '钟楼', name: '钟楼', cluster: '城内', lng: 108.94, lat: 34.26, popularity: 5, durationNormal: 60, durationRush: 30, intro: '西安钟楼', realPhoto: 'img/zhonglou.jpg', photos: [], photoCredit: '', ticket: '', openHours: '' }] }))
  const submissions = join(dir, 'submissions')
  await mkdir(join(submissions, 'P-' + 'a'.repeat(36)), { recursive: true })
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(200, 1), Buffer.from([0xff, 0xd9])])
  await writeFile(join(submissions, 'P-' + 'a'.repeat(36), '0.jpg'), jpeg)
  await writeFile(join(submissions, 'P-' + 'a'.repeat(36) + '.json'), JSON.stringify({
    id: 'P-' + 'a'.repeat(36), requestId: 'r'.repeat(20), lineId: 'test-xian', type: 'ip',
    place: { name: '投稿点位', address: '西安市测试路', lng: 108.97, lat: 34.27 },
    intro: '这是一个投稿点位的介绍文字', alias: '', locationDetail: '', tips: '',
  }))
  const { store, server, base } = await mkServer(dir, calls)
  try {
    // 城市池
    const pool = await (await fetch(`${base}/api/manage/content/city-pool?city=${encodeURIComponent('西安')}`, { headers: admin })).json()
    assert.equal(pool.spots.length, 1)
    assert.equal((await fetch(`${base}/api/manage/content/city-pool?city=nowhere`, { headers: admin })).status, 200)
    assert.deepEqual((await (await fetch(`${base}/api/manage/content/city-pool?city=nowhere`, { headers: admin })).json()).spots, [])
    assert.equal((await fetch(`${base}/api/manage/content/city-pool?city=${encodeURIComponent('bad city!')}`, { headers: admin })).status, 400)
    // AI 端点壳
    assert.equal((await fetch(`${base}/api/manage/content/ai/draft`, { method: 'POST', headers: admin, body: JSON.stringify({ ipName: 'x' }) })).status, 501)
    // 图片上传 + 公开访问
    const dataUrl = 'data:image/jpeg;base64,' + jpeg.toString('base64')
    const up = await (await fetch(`${base}/api/manage/content/img`, { method: 'POST', headers: admin, body: JSON.stringify({ dataUrl }) })).json()
    assert.match(up.url, /^\/api\/content\/img\/[a-f0-9-]+\.jpg$/)
    assert.equal((await fetch(base + up.url)).status, 200)
    // 建 IP + 转正
    await fetch(`${base}/api/manage/content/ips`, { method: 'POST', headers: admin, body: JSON.stringify({ doc: validIp() }) })
    const promo = await fetch(`${base}/api/manage/content/promote`, { method: 'POST', headers: admin, body: JSON.stringify({ submissionId: 'P-' + 'a'.repeat(36), lineId: 'test-xian' }) })
    assert.equal(promo.status, 200)
    const { poi } = await promo.json()
    assert.equal(poi.name, '投稿点位')
    assert.equal(poi.photos.length, 1)
    const ip = store.getIp('test')
    assert.equal(ip.doc.lines.xian.ipStops.length, 2)
    assert.equal(ip.doc.lines.xian.ipStops[1].promotedFrom, 'P-' + 'a'.repeat(36))
    // 不存在的投稿 → 404
    assert.equal((await fetch(`${base}/api/manage/content/promote`, { method: 'POST', headers: admin, body: JSON.stringify({ submissionId: 'P-' + 'b'.repeat(36), lineId: 'test-xian' }) })).status, 404)
  } finally { await new Promise(r => server.close(r)); store.close(); await rm(dir, { recursive: true, force: true }) }
})
