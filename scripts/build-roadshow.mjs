import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { lineChart, revenueChart } from '../roadshow/market-render.mjs'
import { applyStoryFlow } from '../roadshow/story-flow.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'roadshow')
const { values } = parseArgs({ options: { 'output-dir': { type: 'string' } } })
const delivery = values['output-dir'] ? path.resolve(values['output-dir']) : path.join(root, 'dist', 'roadshow')
let html = await readFile(path.join(source, 'intro.template.html'), 'utf8')
html = html.replace('</style>', (await readFile(path.join(source, 'layout-polish.css'), 'utf8')) + '\n</style>')
const market = JSON.parse(await readFile(path.join(source, 'market-data.json'), 'utf8'))
let marketHtml = await readFile(path.join(source, 'market.html'), 'utf8')
marketHtml = marketHtml.replace('@@market-chart@@', lineChart(market.marketCaps, 'market-overview'))
  .replace('@@market-chart-detail@@', lineChart(market.marketCaps, 'market-detail'))
  .replace('@@market-revenue-chart@@', revenueChart(market.netflixRevenue))
  .replace('@@market-annual-rows@@', market.marketCaps.years.map((year, i) => `<tr><th scope="row">${year}</th><td>${market.marketCaps.disney[i].toFixed(2)}</td><td>${market.marketCaps.netflix[i].toFixed(2)}</td></tr>`).join(''))
  .replace('@@market-fortune-rows@@', market.fortune.rows.map(row => `<tr><th scope="row">${row.company}</th><td>${row.y2005}</td><td>${row.y2015}</td><td>${row.y2025}</td></tr>`).join(''))
html = html.replace(/<section class="slide market"[\s\S]*?<\/section>/, marketHtml)
html = html.replace('</style>', (await readFile(path.join(source, 'market.css'), 'utf8')) + '\n</style>')
html = html.replace('</style>', (await readFile(path.join(source, 'modern.css'), 'utf8')) + '\n</style>')
html = html.replace(/<img class="cover-art"[^>]*>/, `<div class="cover-scene reveal delay-1" role="img" aria-label="网站现有的双鳍海豚 YOYO 握着地图，连接故事、地点与旅程"><img class="scene-world" src="@@portal@@" alt="" aria-hidden="true"><p class="scene-heading">YOUR NEXT CHAPTER<strong>从故事出发，抵达心之所向</strong></p><svg class="scene-route" viewBox="0 0 639 260" aria-hidden="true"><path d="M25 32C93 0 104 129 197 143S310 61 355 107 370 214 511 189"/><circle class="route-dot" cx="25" cy="32" r="7"/><circle class="route-dot" cx="197" cy="143" r="7"/><circle class="route-dot" cx="511" cy="189" r="7"/></svg><span class="scene-destination">故事的坐标</span><span class="scene-destination second">想去的远方</span><span class="yoyo map cover-yoyo" aria-hidden="true"></span><p class="scene-caption"><span>STORY</span><i>→</i><span>PLACE</span><i>→</i><span>JOURNEY</span></p><span class="scene-corner">WITH YOYO / 01</span></div>`)
html = html.replace("classList.toggle('dark-chapter', current === 5)", "classList.toggle('dark-chapter', [3, 4, 5, 8].includes(current))")
// All modal dialogs must suppress slide navigation, including the new evidence dialog.
html = html.replaceAll('notesDialog.open||overviewDialog.open', "document.querySelector('dialog[open]')")
html = html.replaceAll('!notesDialog.open&&!overviewDialog.open', "!document.querySelector('dialog[open]')")
html = html.replace('</body>', '<script>\n' + await readFile(path.join(source, 'market.js'), 'utf8') + '\n</script>\n</body>')
const originalNotes = JSON.parse(await readFile(path.join(source, 'notes.json'), 'utf8'))
const flow = applyStoryFlow(html, originalNotes)
html = flow.html.replace('</style>', (await readFile(path.join(source, 'story-flow.css'), 'utf8')) + '\n</style>')
html = html.replace('</body>', '<script>\n' + await readFile(path.join(source, 'opening.js'), 'utf8') + '\n</script>\n</body>')
const notes = flow.notes
for (const name of ['yoyo', 'london', 'shanghai', 'portal', 'website-home', 'website-planning', 'website-recommend']) {
  const content = await readFile(path.join(source, 'assets', `${name}.webp`))
  html = html.replaceAll(`@@${name}@@`, `data:image/webp;base64,${content.toString('base64')}`)
}
html = html.replace('@@notes@@', JSON.stringify(notes).replaceAll('<', '\\u003c'))
if (/@@[\w-]+@@/.test(html)) throw new Error('Unresolved roadshow placeholder')
await mkdir(delivery, { recursive: true })
await writeFile(path.join(root, 'public', 'intro.html'), html)
await writeFile(path.join(delivery, 'intro.html'), html)
await writeFile(path.join(delivery, 'intro-数据整合版.html'), html)
await writeFile(path.join(delivery, 'intro-现代视觉版.html'), html)
await writeFile(path.join(delivery, 'intro-故事连贯版.html'), html)
await writeFile(path.join(delivery, 'intro-海豚动态开场版.html'), html)
await copyFile(path.join(source, 'market-data.json'), path.join(delivery, '第三页数据来源.json'))
await copyFile(path.join(source, 'assets', 'yoyo.webp'), path.join(delivery, '网站YOYO-四种姿态.webp'))
await copyFile(path.join(source, 'README.md'), path.join(delivery, 'README.md'))

// A static, annotated counterpart is prepared specifically for Canva import.
// The interactive deck above intentionally has no data-document-role annotations.
let staticHtml = html.replace(/<script\b[\s\S]*?<\/script>/gi, '')
staticHtml = staticHtml.replace(/<section class="slide([^\"]*)"([^>]*)>/g, (tag, classes, attrs) => {
  const page = Number(attrs.match(/data-page="(\d+)"/)?.[1])
  const note = notes[page - 1]
  const escape = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
  return `<section class="slide${classes}"${attrs.replace(/\s+inert\b/g,'')} data-document-role="page" data-label="${escape(note.part)}" data-speaker-notes="${escape(note.text)}">`
})
staticHtml = staticHtml.replace('</head>', `<style>html,body{height:auto;overflow:visible}.stage{position:static;transform:none;height:auto;overflow:visible}.masthead,.footer,.portal-veil,dialog,.status-toast,.sr-only,.opening-motion{display:none!important}.stage:after{display:none}.slide{position:relative;opacity:1;visibility:visible;pointer-events:auto;transform:none;width:1600px;height:900px;break-after:page}.slide .reveal,.opening-question *{animation:none!important}</style></head>`)
await writeFile(path.join(source, 'canva-static.html'), staticHtml)
await copyFile(path.join(source, '使用说明-十一页.txt'), path.join(delivery, '使用说明.txt'))
await writeFile(path.join(delivery, '逐页演讲稿.txt'), notes.map((n,i) => `第 ${i+1} 页 · ${n.part}\n\n${n.text}\n\n衔接提示：${n.cue}\n`).join('\n────────────────────────\n\n'), 'utf8')
console.log(JSON.stringify({html: path.join(delivery, 'intro.html'), bytes: Buffer.byteLength(html), pages: notes.length}))
