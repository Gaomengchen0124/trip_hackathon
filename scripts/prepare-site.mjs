import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../', import.meta.url))
const generated = join(root, 'src/data')
const optimized = join(root, 'public/optimized')
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
async function writeJson(path, value) {
  const text = JSON.stringify(value) + '\n'
  if (await readFile(path, 'utf8').catch(() => '') !== text) await writeFile(path, text)
}

export async function prepareSite() {
  await mkdir(generated, { recursive: true })
  await mkdir(optimized, { recursive: true })
  const folder = join(root, 'data/lines')
  const docs = (await Promise.all((await readdir(folder)).filter(name => name.endsWith('.json')).sort().map(async name => ({ name, doc: await readJson(join(folder, name)) })))).filter(({ doc }) => doc.line?.lineId)
  const index = await readJson(join(folder, 'index.json'))
  const byId = new Map(docs.map(item => [item.doc.line.lineId, item]))
  const home = index.lines.map(meta => {
    const item = byId.get(meta.lineId)
    if (!item) throw new Error(`Missing line document: ${meta.lineId}`)
    const { line, ipStops = [], cityStops = [] } = item.doc
    return {
      line: { lineId: line.lineId, ipId: line.ipId, title: line.title, city: line.city, cover: line.cover, recommendDays: line.recommendDays, aliases: meta.aliases ?? [], tags: meta.tags ?? {} },
      file: item.name, priority: meta.priority, searchTitle: meta.title,
      searchNames: [...ipStops, ...cityStops].map(p => p.name).filter(Boolean),
    }
  }).sort((a, b) => a.priority - b.priority)
  await writeJson(join(generated, 'home-catalog.json'), {
    lines: home,
    files: Object.fromEntries(docs.map(({ name, doc }) => [doc.line.lineId, name])),
  })

  const photos = (await readdir(join(root, 'public/img'))).filter(name => /\.(jpe?g|png|webp)$/i.test(name)).sort()
  const manifest = {}, banners = {}
  const cachePath = join(optimized, '.cache.json')
  const previous = await readJson(cachePath).catch(() => ({})), cache = {}
  const sources = [
    ...photos.map(name => ({ src: `img/${name}`, widths: [320, 480, 640], quality: 78 })),
    { src: 'brand/story-pilgrim-blue.png', widths: [1280, 2021], quality: 84, banner: 'sky' },
    { src: 'brand/story-pilgrim-mobile-blue.png', widths: [640, 960], quality: 84, banner: 'skyMobile' },
    { src: 'img/story-pilgrim-masthead-v1.png', widths: [1280, 2021], quality: 84, banner: 'gold' },
  ]
  let next = 0, rebuilt = 0
  async function worker() {
    while (next < sources.length) {
      const source = sources[next++], key = source.banner || source.src
      const path = join(root, 'public', source.src), info = await stat(path)
      const stamp = `${info.size}:${info.mtimeMs}:${source.widths}:${source.quality}:${sharp.versions.sharp}:v1`
      let result = previous[key]?.stamp === stamp ? previous[key].result : null
      if (result && !(await Promise.all(result.variants.map(v => stat(join(root, 'public', v.src)).then(() => true, () => false)))).every(Boolean)) result = null
      if (!result) {
        const input = await readFile(path)
        const hash = createHash('sha256').update(input).update(stamp.split(':').slice(2).join(':')).digest('hex').slice(0, 12)
        const metadata = await sharp(input).rotate().metadata()
        const originalWidth = metadata.autoOrient?.width || metadata.width
        const widths = [...new Set(source.widths.map(width => Math.min(width, originalWidth)))]
        const stem = source.src.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-')
        const variants = []
        for (const width of widths) {
          const src = `optimized/${stem}-${hash}-${width}.webp`
          const output = await sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: source.quality, effort: 5 }).toFile(join(root, 'public', src))
          variants.push({ src, width: output.width, bytes: output.size })
        }
        result = { variants }
        rebuilt++
      }
      cache[key] = { stamp, result }
      if (source.banner) banners[source.banner] = result
      else manifest[source.src] = {
        prefix: result.variants[0].src.replace(/-\d+\.webp$/, ''),
        widths: result.variants.map(variant => variant.width),
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  const sorted = object => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)))
  await writeJson(join(generated, 'thumbnail-images.json'), sorted(manifest))
  await writeJson(join(generated, 'banner-images.json'), sorted(banners))
  await writeJson(cachePath, sorted(cache))
  return { lines: home.length, photos: Object.keys(manifest).length, rebuilt, banners: sorted(banners) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { lines, photos, rebuilt } = await prepareSite()
  console.log(`[site-assets] ${lines} line summaries, ${photos} responsive photos, ${rebuilt} image sets generated`)
}
