// 内容库存储 v2 —— 管理单元是 IP（作品），一个 IP 可含多条城市线（longzu: beijing/japan）。
// 发布时把 online IP 的每条线拆成引擎消费的 line doc（顶层 _bounds/ip/line/clusters/ipStops/cityStops）。
// 迁移模式照抄 server/auth-store.mjs。
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, chmodSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const IP_STATUS = ['draft', 'online', 'offline']

export function createContentStore({ file = 'var/content.sqlite', now = Date.now } = {}) {
  if (file !== ':memory:') mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(file)
  if (file !== ':memory:') chmodSync(file, 0o600)
  if (db.prepare('PRAGMA user_version').get().user_version > 2) { db.close(); throw new Error('Unsupported database version') }
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS ips (
      ip_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','online','offline')),
      doc TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by TEXT,
      published_at INTEGER
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      detail TEXT,
      created_at INTEGER NOT NULL
    )`)
    db.exec('CREATE INDEX IF NOT EXISTS audit_time ON audit_log(id DESC)')
    // v1 的 lines 表（未上生产，直接废弃）
    db.exec("DROP TABLE IF EXISTS lines")
    db.exec('PRAGMA user_version = 2; COMMIT')
  } catch (error) { db.exec('ROLLBACK'); db.close(); throw error }

  const rowToIp = (row) => row ? ({
    ipId: row.ip_id,
    status: row.status,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    publishedAt: row.published_at,
    doc: JSON.parse(row.doc),
  }) : null

  /** 旧数据没有线级 status 时按 IP 级状态推导 */
  function lineStatus(line, ipStatus) {
    if (['draft', 'online', 'offline'].includes(line?.status)) return line.status
    return ipStatus === 'online' ? 'online' : 'draft'
  }
  /** 全部线状态 → IP 级汇总 */
  function deriveIpStatus(lines) {
    const statuses = Object.values(lines).map((l) => l.status)
    if (statuses.length && statuses.every((s) => s === 'online')) return 'online'
    if (statuses.length && statuses.every((s) => s === 'offline')) return 'offline'
    return 'draft'
  }

  return {
    /** 公开接口：line.status==='online' 的线拆成引擎 doc 输出（IP 级可能是混合状态，所以扫全表按线过滤） */
    onlineLines() {
      const rows = db.prepare('SELECT status,doc FROM ips ORDER BY ip_id').all()
      const out = {}
      for (const row of rows) {
        const doc = JSON.parse(row.doc)
        for (const line of Object.values(doc.lines ?? {})) {
          if (lineStatus(line, row.status) !== 'online') continue
          if (line?.line?.lineId) out[line.line.lineId] = { _bounds: line._bounds, _expected: line._expected, ip: doc.ip, line: line.line, clusters: line.clusters ?? [], ipStops: line.ipStops ?? [], cityStops: line.cityStops ?? [] }
        }
      }
      return out
    },
    /** 公开接口：offline 线的 lineId（消费端屏蔽同名打包线） */
    hiddenLineIds() {
      const rows = db.prepare('SELECT status,doc FROM ips').all()
      return rows.flatMap((row) => Object.values(JSON.parse(row.doc).lines ?? {})
        .filter((l) => lineStatus(l, row.status) === 'offline')
        .map((l) => l?.line?.lineId).filter(Boolean))
    },
    listIps() { return db.prepare('SELECT * FROM ips ORDER BY status=\'online\' DESC,updated_at DESC').all().map(rowToIp) },
    getIp(ipId) { return rowToIp(db.prepare('SELECT * FROM ips WHERE ip_id=?').get(ipId)) },
    createIp({ ipId, doc, status = 'draft', actor }) {
      if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(ipId)) throw new Error('ipId 只能含小写字母/数字/连字符')
      if (!IP_STATUS.includes(status)) throw new Error('Invalid status')
      db.exec('BEGIN IMMEDIATE')
      try {
        if (db.prepare('SELECT ip_id FROM ips WHERE ip_id=?').get(ipId)) throw new Error('IP 已存在')
        const publishedAt = status === 'online' ? now() : null
        db.prepare('INSERT INTO ips(ip_id,status,doc,updated_at,updated_by,published_at) VALUES(?,?,?,?,?,?)')
          .run(ipId, status, JSON.stringify(doc), now(), actor ?? null, publishedAt)
        db.prepare('INSERT INTO audit_log(actor,action,target,detail,created_at) VALUES(?,?,?,?,?)').run(actor ?? '', 'ip.create', `ip:${ipId}`, `status=${status}`, now())
        db.exec('COMMIT')
        return this.getIp(ipId)
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    saveIp(ipId, doc, actor) {
      db.exec('BEGIN IMMEDIATE')
      try {
        if (!db.prepare('SELECT ip_id FROM ips WHERE ip_id=?').get(ipId)) throw new Error('IP 不存在')
        db.prepare('UPDATE ips SET doc=?,updated_at=?,updated_by=? WHERE ip_id=?').run(JSON.stringify(doc), now(), actor ?? null, ipId)
        db.exec('COMMIT')
        return this.getIp(ipId)
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    setStatus(ipId, status, { cityKeys, actor } = {}) {
      if (!IP_STATUS.includes(status)) throw new Error('Invalid status')
      db.exec('BEGIN IMMEDIATE')
      try {
        const row = db.prepare('SELECT status,doc FROM ips WHERE ip_id=?').get(ipId)
        if (!row) throw new Error('IP 不存在')
        const doc = JSON.parse(row.doc)
        const keys = Array.isArray(cityKeys) && cityKeys.length ? cityKeys : Object.keys(doc.lines ?? {})
        const publishedAt = status === 'online' ? now() : null
        // 先把没有显式状态的线初始化为推导状态（旧数据迁移），再应用本次变更
        for (const [key, line] of Object.entries(doc.lines ?? {})) {
          line.status = lineStatus(line, row.status)
        }
        for (const key of keys) {
          if (doc.lines?.[key]) doc.lines[key].status = status
        }
        const ipStatus = deriveIpStatus(Object.fromEntries(Object.entries(doc.lines ?? {}).map(([k, l]) => [k, { status: lineStatus(l, row.status) }])))
        db.prepare('UPDATE ips SET status=?,doc=?,published_at=COALESCE(?,published_at),updated_at=?,updated_by=? WHERE ip_id=?')
          .run(ipStatus, JSON.stringify(doc), publishedAt, now(), actor ?? null, ipId)
        const action = status === 'online' ? 'ip.publish' : status === 'offline' ? 'ip.unpublish' : 'ip.draft'
        db.prepare('INSERT INTO audit_log(actor,action,target,detail,created_at) VALUES(?,?,?,?,?)').run(actor ?? '', action, `ip:${ipId}`, `from=${row.status},lines=${keys.join('/')}`, now())
        db.exec('COMMIT')
        return this.getIp(ipId)
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    deleteIp(ipId, actor) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const row = db.prepare('SELECT status,doc FROM ips WHERE ip_id=?').get(ipId)
        if (!row) throw new Error('IP 不存在')
        const hasOnline = Object.values(JSON.parse(row.doc).lines ?? {}).some((l) => lineStatus(l, row.status) === 'online')
        if (hasOnline) throw new Error('有线路仍在上线状态，请先下架')
        db.prepare('DELETE FROM ips WHERE ip_id=?').run(ipId)
        db.prepare('INSERT INTO audit_log(actor,action,target,detail,created_at) VALUES(?,?,?,?,?)').run(actor ?? '', 'ip.delete', `ip:${ipId}`, '', now())
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    audit(actor, action, target, detail = '') {
      db.prepare('INSERT INTO audit_log(actor,action,target,detail,created_at) VALUES(?,?,?,?,?)').run(actor, action, target, typeof detail === 'string' ? detail : JSON.stringify(detail), now())
    },
    listAudit(before = Number.MAX_SAFE_INTEGER, limit = 50) {
      const rows = db.prepare('SELECT id,actor,action,target,detail,created_at AS createdAt FROM audit_log WHERE id<? ORDER BY id DESC LIMIT ?').all(before, limit + 1)
      const items = rows.slice(0, limit).map((row) => ({ ...row }))
      return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null }
    },
    close() { db.close() },
  }
}

/** 从打包 data/lines/*.json 聚合出 { ipId: {status:'bundled', doc} }（同 ipId 多条线合并成一个 IP doc） */
export function aggregateBundledIps(bundledLinesDir) {
  const ips = new Map()
  for (const f of readdirSync(bundledLinesDir)) {
    if (!f.endsWith('.json') || f === 'index.json') continue
    const line = JSON.parse(readFileSync(join(bundledLinesDir, f), 'utf8'))
    if (!line?.ip?.ipId || !line?.line?.lineId) continue
    const ipId = line.ip.ipId
    if (!ips.has(ipId)) {
      ips.set(ipId, { ipId, status: 'bundled', updatedAt: 0, updatedBy: null, publishedAt: null, doc: { _schema: 'ip-v1', ip: line.ip, lines: {} } })
    }
    const doc = ips.get(ipId).doc
    doc.lines[line.line.city || line.line.lineId] = {
      _bounds: line._bounds, _expected: line._expected,
      line: line.line, clusters: line.clusters ?? [],
      ipStops: line.ipStops ?? [], cityStops: line.cityStops ?? [],
    }
  }
  return ips
}
