import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createServer } from 'vite'
import { searchLines } from '../src/engine/catalog.mjs'

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' })
after(() => server.close())
const mock = await server.ssrLoadModule('/src/api/mock/index.js')
const index = JSON.parse(readFileSync('data/lines/index.json', 'utf8'))
const docs = Object.fromEntries(readdirSync('data/lines').filter(file => file.endsWith('.json')).map(file => JSON.parse(readFileSync(`data/lines/${file}`, 'utf8'))).filter(doc => doc.line?.lineId).map(doc => [doc.line.lineId, doc]))

test('lightweight search preserves full-catalog ranking for work, aliases, tags and every POI name', () => {
  const ordered = { lines: [...index.lines].sort((a, b) => a.priority - b.priority) }
  const queries = new Set(['', '未知作品', '龙族', '东方明珠', '国泰', 'Harry'])
  for (const meta of index.lines) {
    queries.add(meta.title)
    for (const alias of meta.aliases || []) queries.add(alias)
    for (const tag of Object.values(meta.tags || {}).flat()) queries.add(tag)
    for (const poi of [...docs[meta.lineId].ipStops, ...docs[meta.lineId].cityStops]) queries.add(poi.name)
  }
  for (const query of queries) {
    assert.deepEqual(mock.search(query).map(line => line.lineId), searchLines(query, ordered, docs).map(hit => hit.lineId), query)
  }
})

test('async detail loading retains source content, rejects unknown IDs, and can still plan', async () => {
  for (const [id, source] of Object.entries(docs)) {
    const detail = await mock.getLineDetail(id)
    assert.deepEqual(detail.ip, source.ip)
    assert.deepEqual(detail.pois, [...source.ipStops, ...source.cityStops])
    assert.equal(detail.line.title, source.line.title)
    assert.equal(detail.line.cover, source.line.cover)
  }
  await assert.rejects(mock.getLineDetail('not-a-line'), /路线不存在/)
  const result = await mock.plan({ lineId: 'fanhua-shanghai', poiIds: ['sh-ip-01', 'sh-ip-02', 'sh-sp-01', 'sh-sp-03'], timeRange: { startDate: '2026-11-01', startSlot: '上午', endDate: '2026-11-01', endSlot: '晚上' }, hoursPerDay: 8 })
  assert.ok(['ok', 'under70', 'overload'].includes(result.status))
  assert.ok(result.days[0]?.items[0]?.arrive)
})
