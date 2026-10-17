import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { extractEpub, parseJsonLoose, buildMessages, generateDraft, hasAiConfig } from '../server/ai-draft.mjs'

/** 构造一个最小可用的 epub：container.xml → content.opf → 两个 spine 章节 */
async function makeEpub(chapters) {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip')
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
  const manifest = chapters.map((_, i) => `<item id="ch${i}" href="ch${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')
  const spine = chapters.map((_, i) => `<itemref idref="ch${i}"/>`).join('')
  zip.file('OEBPS/content.opf', `<?xml version="1.0"?><package><manifest>${manifest}</manifest><spine>${spine}</spine></package>`)
  chapters.forEach((html, i) => zip.file(`OEBPS/ch${i}.xhtml`, html))
  return zip.generateAsync({ type: 'nodebuffer' })
}

const LLM_DOC = {
  _schema: 'ip-v1',
  ip: { ipId: 'testbook', name: '测试书', author: '测试作者', kind: 'novel', cover: '', aliases: ['主角甲'] },
  lines: {
    杭州: {
      _bounds: { lng: [119.9, 120.5], lat: [30.1, 30.6] },
      _expected: { ipStops: [6, 12], cityStops: [10, 20], maxTierS: 3 },
      line: { lineId: 'testbook-hangzhou', ipId: 'testbook', title: '测试书·杭州', city: '杭州', cover: '', recommendDays: 2 },
      clusters: ['西湖', '城中'],
      ipStops: [{
        poiId: 'testbook-hangzhou-ip-01', lineId: 'testbook-hangzhou', type: 'ip', name: '断桥残雪', alias: '', lng: null, lat: null,
        cluster: '西湖', tier: 'S', durationNormal: 60, durationRush: 30,
        intro: '白娘子与许仙相遇的地方', tips: '', skipNote: '',
        quotes: [{ kind: '原著', brief: '断桥不断', full: '原文节选一百字左右', source: '《测试书》第 3 章' }],
        realPhoto: '', photos: [], photoCredit: '',
      }],
      cityStops: [],
    },
  },
}

test('extractEpub: reads spine in order and strips tags', async () => {
  const epub = await makeEpub([
    '<html><body><h1>第一章</h1><p>湖光山色&nbsp;倒映</p><style>p{color:red}</style></body></html>',
    '<html><body><p>第二章正文<script>var x=1</script></p></body></html>',
  ])
  const text = await extractEpub(epub)
  assert.match(text, /第一章/)
  assert.match(text, /湖光山色 倒映/)
  assert.match(text, /第二章正文/)
  assert.ok(!text.includes('var x'))
  // 空文件 / 非 zip
  await assert.rejects(() => extractEpub(Buffer.from('not a zip')), /无效/)
})

test('hasAiConfig and 501 path', async () => {
  assert.equal(hasAiConfig({}), false)
  assert.equal(hasAiConfig({ AI_BASE_URL: 'http://x', AI_API_KEY: 'k', AI_MODEL: 'm' }), true)
  await assert.rejects(
    () => generateDraft({ sourceText: 'abc' }, { env: {} }),
    (e) => e.status === 501 && e.message === 'AI 服务未接入',
  )
})

test('generateDraft: epub → LLM → geocode fills coords', async () => {
  // 本用例使用 mock bundledLinesDir 提供同城上下文线（AI 编造的 lineId 不传给 8787）
  const calls = []
  const fetchImpl = async (url, opts = {}) => {
    calls.push(url)
    if (url.includes('/chat/completions')) {
      const body = JSON.parse(opts.body)
      assert.equal(body.messages[0].role, 'system')
      assert.match(body.messages[1].content, /原文：/)   // epub 文本已喂入
      return { ok: true, json: async () => ({ choices: [{ message: { content: '```json\n' + JSON.stringify(LLM_DOC) + '\n```' } }] }) }
    }
    if (url.includes('/api/places')) {
      assert.match(url, /q=/)  // 中文点位名参与搜索
      assert.match(url, /lineId=xian-line/)  // 用同城既有线做上下文，而非 AI 编的 lineId
      return { ok: true, json: async () => [{ name: '断桥残雪', lng: 120.148, lat: 30.258 }] }
    }
    throw new Error('unexpected url ' + url)
  }
  const epub = await makeEpub(['<html><body><p>西湖边的故事</p></body></html>'])
  const env = { AI_BASE_URL: 'http://llm/v1', AI_API_KEY: 'key', AI_MODEL: 'm' }
  const dir = await mkdtemp(join(tmpdir(), 'travel-ai-'))
  const bundledDir = join(dir, 'bundled')
  await mkdir(bundledDir, { recursive: true })
  await writeFile(join(bundledDir, 'hangzhou.json'), JSON.stringify({ line: { lineId: 'xian-line', city: '杭州' } }))
  const doc = await generateDraft({ epub: epub.toString('base64') }, { env, fetchImpl, bundledLinesDir: bundledDir })
  assert.equal(doc.ip.name, '测试书')
  const poi = doc.lines['杭州'].ipStops[0]
  assert.equal(poi.lng, 120.148)
  assert.equal(poi.lat, 30.258)
  assert.equal(poi.quotes[0].source, '《测试书》第 3 章')
  assert.deepEqual(doc.lines['杭州'].clusters, ['西湖', '城中'])
  await rm(dir, { recursive: true, force: true })
})

test('generateDraft: rejects bad LLM output and missing source', async () => {
  const env = { AI_BASE_URL: 'http://llm/v1', AI_API_KEY: 'key', AI_MODEL: 'm' }
  await assert.rejects(() => generateDraft({}, { env, fetchImpl: async () => { throw new Error('no') } }), (e) => e.status === 400)
  const badLlm = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '对不起我无法完成' } }] }) })
  await assert.rejects(() => generateDraft({ sourceText: 'x' }, { env, fetchImpl: badLlm }), /JSON/)
})

test('parseJsonLoose: fenced and raw', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(parseJsonLoose('前言 {"a":1} 后记'), { a: 1 })
  assert.throws(() => parseJsonLoose('没有对象'))
})

test('buildMessages: red line about verbatim quotes is in the system prompt', () => {
  const messages = buildMessages({ ipName: '繁花', author: '金宇澄', kind: 'novel', sourceText: 'text' })
  assert.match(messages[0].content, /逐字摘自/)
  assert.match(messages[0].content, /绝不自己撰写|绝不编造/)
  assert.match(messages[0].content, /自动划分片区/)
  assert.match(messages[0].content, /filmingLocation/)
})
