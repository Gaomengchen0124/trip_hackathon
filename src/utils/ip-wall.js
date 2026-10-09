// 首页 IP 墙的纯数据组装:线路列表 → 按 IP 去重 → 每 IP 一组照片 tile → 交错分入 N 行。
// 照片来源只信任 scripts/gen-img-manifest.mjs 扫描磁盘的结果(见 img-manifest.json),
// 不读数据 JSON 里的 realPhoto(引用与磁盘不一致)。
import manifest from '../data/img-manifest.json'

// ipId → public/img 文件名前缀(取值同 gen-img-manifest 按磁盘文件分出的组名)。
// 未列出的 IP 会退化成占位卡。
export const IP_PREFIX = {
  fanhua: 'sh',
  santi: 'st',
  daomu: 'dm',
  woyuditan: 'wd',
  qianfu: 'qf',
  kaiduan: 'kd',
  quyoufengdedifang: 'yf',
  aiqingshenhua: 'aqsh',
  harrypotter: 'hp',
  longzu: 'bj'
}

// 单行最少 tile 数:低于视口宽度会让无缝循环露出空白,太少时自我重复补齐。
export const MIN_PER_ROW = 8

// lines: Line[] 按 priority 排序传入;按 ipId 去重(龙族保留首个 = 主线路)。
// 返回 [{ ipId, ipName, title, lineId, tiles: [{ key, kind, src, ipName, title, lineId }] }]
export function buildIpGroups(lines) {
  const seen = new Set()
  const groups = []
  for (const line of lines) {
    if (!line?.ipId || seen.has(line.ipId)) continue
    seen.add(line.ipId)
    const prefix = IP_PREFIX[line.ipId]
    const photos = prefix ? (manifest[prefix] ?? []) : []
    // Line 契约没有 ipName 字段;标题约定是「IP·城市」,据此拆出 IP 名
    const ipName =
      line.city && line.title?.includes(`·${line.city}`)
        ? line.title.split('·')[0]
        : (line.title ?? line.ipId)
    const base = { ipId: line.ipId, ipName, title: line.title, lineId: line.lineId }
    const tiles = photos.length
      ? photos.map((name, i) => ({
          key: `${line.ipId}-${i}`,
          kind: 'photo',
          src: `img/${name}`,
          ...base
        }))
      : [{ key: `${line.ipId}-ph`, kind: 'placeholder', src: '', ...base }]
    groups.push({ ...base, tiles })
  }
  return groups
}

// 按 IP 轮转交错取片(round-robin),再轮流分入 rowCount 行:
// 每行都是 IP 混合,小 IP(如 qf 只有 2 张)的照片也不会挤在同一行。
export function distribute(groups, rowCount = 3) {
  const rows = Array.from({ length: rowCount }, () => [])
  // 交错:第 k 轮每个 IP 出第 k 张
  const maxTiles = Math.max(...groups.map((g) => g.tiles.length))
  const interleaved = []
  for (let k = 0; k < maxTiles; k++) {
    for (const g of groups) {
      if (g.tiles[k]) interleaved.push(g.tiles[k])
    }
  }
  interleaved.forEach((tile, i) => rows[i % rowCount].push(tile))
  // 稀疏兜底:复制自身到 ≥ MIN_PER_ROW(无缝循环只要求「两份拷贝一致」,行内重复合法)
  return rows.map((row) => {
    if (!row.length) return row
    const out = [...row]
    while (out.length < MIN_PER_ROW) out.push(...out)
    return out
  })
}

export function buildWallRows(lines, rowCount = 3) {
  return distribute(buildIpGroups(lines), rowCount)
}
