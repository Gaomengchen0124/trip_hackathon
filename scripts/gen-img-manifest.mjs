// 扫描 public/img/*.jpg,按文件名前缀分组,生成 src/data/img-manifest.json。
// 首页 IP 墙只信任磁盘上真实存在的照片(数据 JSON 的 realPhoto 引用不全,编号也有断档),
// 因此以本清单为唯一事实源。由 predev / prebuild 钩子自动执行。
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const imgDir = join(root, 'public', 'img')
const outFile = join(root, 'src', 'data', 'img-manifest.json')

const files = readdirSync(imgDir)
  .filter((f) => f.toLowerCase().endsWith('.jpg'))
  .sort()

const manifest = {}
for (const f of files) {
  const prefix = f.split('-')[0]
  ;(manifest[prefix] ??= []).push(f)
}

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

const total = files.length
const groups = Object.entries(manifest)
  .map(([k, v]) => `${k}:${v.length}`)
  .join(' ')
console.log(`[img-manifest] ${total} 张图片 → src/data/img-manifest.json (${groups})`)
