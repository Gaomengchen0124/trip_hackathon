#!/usr/bin/env node
// 城市经典景点基准表 → 各线路 cityStops（可重复执行，幂等）
//
//   规则 1：某线 cityStops = 该城市基准表 - 该线已作为 IP 点位的景点（excludeIp 精确匹配）
//   规则 2：同一景点在任意线路（含它的 IP 点位）都引用同一批图片文件（照片以基准表为准）
//
// 用法：node data/gen-city-stops.mjs [--dry] [--root=<仓库根>]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const flag = (name) => process.argv.includes(`--${name}`)
const opt = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}
const DRY = flag('dry')
const root = resolve(opt('root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
const CITY_DIR = join(root, 'data/cities')
const LINE_DIR = join(root, 'data/lines')

const pad = (n) => String(n).padStart(2, '0')
const prefixOf = (doc) => {
  const id = [...doc.ipStops, ...doc.cityStops][0]?.poiId ?? ''
  const m = id.match(/^(.*)-(?:ip|sp)-\d+$/)
  return m ? m[1] : doc.line.lineId
}

const bases = readdirSync(CITY_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(CITY_DIR, f), 'utf8')))
const byCity = new Map(bases.map((b) => [b.city, b]))

for (const file of readdirSync(LINE_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
  const path = join(LINE_DIR, file)
  const doc = JSON.parse(readFileSync(path, 'utf8'))
  const base = byCity.get(doc.line?.city)
  if (!base) continue

  const ipNames = new Set(doc.ipStops.map((p) => p.name))
  const dropped = []
  const keep = base.spots.filter((s) => {
    const hit = s.excludeIp.some((n) => ipNames.has(n))
    if (hit) dropped.push(s.name)
    return !hit
  })

  const prefix = prefixOf(doc)
  doc.cityStops = keep.map((s, i) => ({
    poiId: `${prefix}-sp-${pad(i + 1)}`,
    lineId: doc.line.lineId,
    type: 'classic',
    name: s.name,
    lng: s.lng,
    lat: s.lat,
    cluster: s.cluster,
    popularity: s.popularity,
    durationNormal: s.durationNormal,
    durationRush: s.durationRush,
    intro: s.intro,
    realPhoto: s.realPhoto,
    photos: [...s.photos],
    photoCredit: s.photoCredit,
    ticket: s.ticket ?? '',
    openHours: s.openHours ?? ''
  }))

  // 规则 2：同名 IP 点位换成基准表那批图
  const unified = []
  for (const ip of doc.ipStops) {
    const hit = base.spots.find((s) => s.unifyIp.includes(ip.name))
    if (!hit) continue
    if (ip.realPhoto !== hit.realPhoto) unified.push(`${ip.name}(${ip.realPhoto} → ${hit.realPhoto})`)
    ip.realPhoto = hit.realPhoto
    ip.photos = [...hit.photos]
  }

  // clusters：保留原顺序，补上新出现的片区
  const used = [...doc.ipStops, ...doc.cityStops].map((p) => p.cluster)
  const addedClusters = [...new Set(used)].filter((c) => !doc.clusters.includes(c))
  doc.clusters.push(...addedClusters)

  // bounds：只扩不缩，覆盖全部点位
  const pts = [...doc.ipStops, ...doc.cityStops]
  const before = JSON.stringify(doc._bounds)
  doc._bounds = {
    lng: [Math.min(doc._bounds.lng[0], ...pts.map((p) => p.lng)), Math.max(doc._bounds.lng[1], ...pts.map((p) => p.lng))],
    lat: [Math.min(doc._bounds.lat[0], ...pts.map((p) => p.lat)), Math.max(doc._bounds.lat[1], ...pts.map((p) => p.lat))]
  }

  const lo = Math.min(10, doc.cityStops.length)
  const hi = Math.max(20, doc.cityStops.length)
  doc._expected = { ...doc._expected, cityStops: [lo, hi] }

  if (!DRY) writeFileSync(path, JSON.stringify(doc, null, 2) + '\n')

  console.log(
    `${DRY ? '[dry] ' : ''}${doc.line.lineId}\t城市景点 ${doc.cityStops.length} 个` +
    `\t剔除(已在IP) ${dropped.length}${dropped.length ? '：' + dropped.join('、') : ''}` +
    `\t统一IP图 ${unified.length}${unified.length ? '：' + unified.join('，') : ''}` +
    `\t新增片区 ${addedClusters.length}${addedClusters.length ? '：' + addedClusters.join('、') : ''}` +
    `${before !== JSON.stringify(doc._bounds) ? '\t已扩 bounds' : ''}`
  )
}
