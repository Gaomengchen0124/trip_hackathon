import { DatabaseSync } from 'node:sqlite'
import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'
import { validateProfile } from '../src/auth/profile.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')
const TTL = 7 * 86400000
export function createAuthStore({ file = 'var/auth.sqlite', now = Date.now, adminEmails = process.env.ADMIN_EMAILS || '' } = {}) {
  const bootstrapEmails = (Array.isArray(adminEmails) ? adminEmails : String(adminEmails).split(',')).map(s => s.trim().toLowerCase()).filter(Boolean)
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(file)
  if (file !== ':memory:') chmodSync(file, 0o600)
  if (db.prepare('PRAGMA user_version').get().user_version > 7) { db.close(); throw new Error('Unsupported database version') }
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, avatar TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(provider, subject));
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS email_codes (email TEXT PRIMARY KEY, digest TEXT NOT NULL, sent_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS request_limits (key TEXT PRIMARY KEY, start INTEGER NOT NULL, count INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS favorites (user_id TEXT NOT NULL REFERENCES users(id), entity_key TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id, entity_key));
    CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id), entity_key TEXT NOT NULL, content TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(user_id, request_id));
    CREATE INDEX IF NOT EXISTS comments_page ON comments(entity_key,id DESC);
    CREATE TABLE IF NOT EXISTS comment_reports (id INTEGER PRIMARY KEY AUTOINCREMENT,comment_id INTEGER NOT NULL REFERENCES comments(id),user_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL,UNIQUE(comment_id,user_id));
    `)
  db.exec('BEGIN IMMEDIATE')
  try {
    if (!db.prepare('PRAGMA table_info(comments)').all().some(column => column.name === 'deleted_at')) db.exec('ALTER TABLE comments ADD COLUMN deleted_at INTEGER')
    if (!db.prepare('PRAGMA table_info(comments)').all().some(column => column.name === 'moderated_at')) db.exec('ALTER TABLE comments ADD COLUMN moderated_at INTEGER')
    if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
    db.exec(`CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      detail TEXT,
      created_at INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS passwords (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      digest TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`)
    // 首批管理员引导：ADMIN_EMAILS 中的邮箱对应账号直接获得 admin 角色（幂等，每次启动都执行以支持追加）
    const promote = db.prepare("UPDATE users SET role='admin' WHERE id=(SELECT user_id FROM identities WHERE provider='email' AND subject=?)")
    for (const email of bootstrapEmails) promote.run(email)
    db.exec('PRAGMA user_version = 7; COMMIT')
  } catch (error) { db.exec('ROLLBACK'); db.close(); throw error }
  function getUser(id) {
    const row = db.prepare('SELECT id,nickname,avatar,role FROM users WHERE id=?').get(id)
    return row ? { ...row } : null
  }
  return {
    // Internal only: call AFTER verifying a provider credential. No public registration bypass.
    verifiedIdentity(provider, subject) {
      if (!['email', 'phone'].includes(provider) || typeof subject !== 'string' || !subject.trim() || subject.length > 254) throw new Error('Invalid verified identity')
      const normalized = provider === 'email' ? subject.trim().toLowerCase() : subject.trim()
      db.exec('BEGIN IMMEDIATE')
      try {
        const existing = db.prepare('SELECT user_id FROM identities WHERE provider=? AND subject=?').get(provider, normalized)
        let id = existing?.user_id
        if (!id) {
          id = randomUUID()
          db.prepare('INSERT INTO users(id,nickname,avatar,created_at) VALUES(?,?,?,?)').run(id, '巡礼读者', '', now())
          db.prepare('INSERT INTO identities VALUES(?,?,?)').run(provider, normalized, id)
        }
        db.exec('COMMIT'); return getUser(id)
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    issueSession(userId) {
      if (!getUser(userId)) throw new Error('Unknown user')
      const token = randomBytes(32).toString('base64url')
      db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now())
      db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), userId, now() + TTL)
      return { token, maxAge: TTL / 1000 }
    },
    sessionUser(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
      const row = db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(token), now())
      return row ? getUser(row.user_id) : null
    },
    revoke(token) { if (typeof token === 'string') db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token)) },
    updateProfile(userId, profile) {
      const error = validateProfile(profile)
      if (error) throw new Error(error)
      if (!getUser(userId)) throw new Error('Unknown user')
      db.prepare('UPDATE users SET nickname=?,avatar=? WHERE id=?').run(profile.nickname.trim(), profile.avatar || '', userId)
      return getUser(userId)
    },
    rateLimit(key, max, windowMs) {
      db.prepare('DELETE FROM request_limits WHERE start<=?').run(now() - windowMs)
      const row = db.prepare('SELECT * FROM request_limits WHERE key=?').get(key)
      if (row && row.count >= max) return false
      db.prepare('INSERT INTO request_limits VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now())
      return true
    },
    reserveCode(email, digest) {
      db.prepare('DELETE FROM email_codes WHERE expires_at<=?').run(now())
      const previous = db.prepare('SELECT sent_at FROM email_codes WHERE email=?').get(email)
      if (previous && now() - previous.sent_at < 60000) return false
      db.prepare('INSERT INTO email_codes VALUES(?,?,?,?,0) ON CONFLICT(email) DO UPDATE SET digest=excluded.digest,sent_at=excluded.sent_at,expires_at=excluded.expires_at,attempts=0').run(email,digest,now(),now()+300000)
      return true
    },
    discardCode(email, digest) { db.prepare('DELETE FROM email_codes WHERE email=? AND digest=?').run(email,digest) },
    consumeCode(email, digest) {
      const row = db.prepare('SELECT * FROM email_codes WHERE email=?').get(email)
      if (!row || row.expires_at <= now() || row.attempts >= 5) return false
      if (row.digest !== digest) { db.prepare('UPDATE email_codes SET attempts=attempts+1 WHERE email=?').run(email); return false }
      db.prepare('DELETE FROM email_codes WHERE email=?').run(email)
      return true
    },
    listFavorites(userId) { return db.prepare('SELECT entity_key AS entityKey FROM favorites WHERE user_id=? ORDER BY created_at DESC,entity_key').all(userId).map(row => row.entityKey) },
    setFavorite(userId, key, saved) {
      if (saved) db.prepare('INSERT OR IGNORE INTO favorites VALUES(?,?,?)').run(userId,key,now())
      else db.prepare('DELETE FROM favorites WHERE user_id=? AND entity_key=?').run(userId,key)
      return this.listFavorites(userId)
    },
    listComments(key, before = Number.MAX_SAFE_INTEGER) {
      return db.prepare('SELECT c.id,c.entity_key AS entityKey,c.content,c.created_at AS createdAt,u.id AS authorId,u.nickname FROM comments c JOIN users u ON u.id=c.user_id WHERE c.entity_key=? AND c.id<? AND c.deleted_at IS NULL ORDER BY c.id DESC LIMIT 21').all(key,before).map(row => ({ ...row }))
    },
    addComment(userId, key, content, requestId) {
      const existing = db.prepare('SELECT id,entity_key,content FROM comments WHERE user_id=? AND request_id=?').get(userId,requestId)
      if (existing) {
        if (existing.entity_key !== key || existing.content !== content) throw new Error('Request conflict')
        return Number(existing.id)
      }
      if (db.prepare('SELECT id FROM comments WHERE user_id=? AND entity_key=? AND content=? AND created_at>?').get(userId,key,content,now()-60000)) throw new Error('Duplicate comment')
      return Number(db.prepare('INSERT INTO comments(user_id,entity_key,content,request_id,created_at) VALUES(?,?,?,?,?)').run(userId,key,content,requestId,now()).lastInsertRowid)
    },
    setCommentDeleted(userId, id, key, deleted) {
      const row = db.prepare('SELECT id,moderated_at FROM comments WHERE id=? AND user_id=? AND entity_key=?').get(id,userId,key)
      if (!row || (!deleted && row.moderated_at !== null)) return false
      if (deleted) db.prepare('UPDATE comments SET deleted_at=COALESCE(deleted_at,?) WHERE id=? AND user_id=?').run(now(),id,userId)
      else db.prepare('UPDATE comments SET deleted_at=NULL WHERE id=? AND user_id=?').run(id,userId)
      return true
    },
    myComments(userId, before = Number.MAX_SAFE_INTEGER) {
      return db.prepare('SELECT id,entity_key AS entityKey,content,created_at AS createdAt,deleted_at AS deletedAt,moderated_at AS moderatedAt FROM comments WHERE user_id=? AND id<? ORDER BY id DESC LIMIT 21').all(userId,before).map(row=>({...row}))
    },
    reportComment(userId,id,reason) {
      const comment=db.prepare('SELECT id,user_id FROM comments WHERE id=? AND deleted_at IS NULL').get(id)
      if (!comment) return null
      if (comment.user_id===userId) throw new Error('Cannot report own comment')
      db.prepare('INSERT OR IGNORE INTO comment_reports(comment_id,user_id,reason,created_at) VALUES(?,?,?,?)').run(id,userId,reason,now())
      return Number(db.prepare('SELECT id FROM comment_reports WHERE comment_id=? AND user_id=?').get(id,userId).id)
    },
    pendingReports() { return db.prepare("SELECT r.id,r.comment_id AS commentId,r.reason,r.created_at AS createdAt,c.content FROM comment_reports r JOIN comments c ON c.id=r.comment_id WHERE r.status='pending' ORDER BY r.id").all().map(row=>({...row})) },
    resolveReport(id,action) {
      if (!['hide','dismiss'].includes(action)) throw new Error('Invalid action')
      db.exec('BEGIN IMMEDIATE')
      try {
        const row=db.prepare("SELECT comment_id FROM comment_reports WHERE id=? AND status='pending'").get(id)
        if (!row) { db.exec('ROLLBACK'); return false }
        if (action==='hide') db.prepare('UPDATE comments SET deleted_at=COALESCE(deleted_at,?),moderated_at=? WHERE id=?').run(now(),now(),row.comment_id)
        db.prepare('UPDATE comment_reports SET status=? WHERE id=?').run(action,id)
        db.exec('COMMIT');return true
      } catch(error) { db.exec('ROLLBACK');throw error }
    },
    // ---- 管理后台：用户与角色 ----
    isAdmin(user) { return !!user && user.role === 'admin' },
    listUsers(before = Number.MAX_SAFE_INTEGER, limit = 50) {
      const rows = db.prepare(`SELECT u.rowid AS rowid,u.id,u.nickname,u.role,u.created_at AS createdAt,
          (SELECT subject FROM identities WHERE provider='email' AND user_id=u.id) AS email,
          (SELECT COUNT(*) FROM comments c WHERE c.user_id=u.id) AS commentCount
        FROM users u WHERE u.rowid<? ORDER BY u.rowid DESC LIMIT ?`).all(before, limit + 1)
      const users = rows.slice(0, limit).map(({ rowid, ...row }) => row)
      return { users, nextCursor: rows.length > limit ? rows[limit - 1].rowid : null }
    },
    setUserRole(adminId, userId, role) {
      if (!['user', 'admin'].includes(role)) throw new Error('Invalid role')
      if (userId === adminId) throw new Error('不能修改自己的角色')
      db.exec('BEGIN IMMEDIATE')
      try {
        const target = db.prepare('SELECT role FROM users WHERE id=?').get(userId)
        if (!target) throw new Error('用户不存在')
        if (target.role === 'admin' && role === 'user') {
          const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").get().n
          if (admins <= 1) throw new Error('至少保留一名管理员')
        }
        db.prepare('UPDATE users SET role=? WHERE id=?').run(role, userId)
        db.exec('COMMIT')
        return getUser(userId)
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    // ---- 管理后台：举报与评论管理 ----
    listReports(status = 'pending', before = Number.MAX_SAFE_INTEGER, limit = 50) {
      const where = status === 'all' ? 'r.id<?' : "r.status=? AND r.id<?"
      const args = status === 'all' ? [before, limit + 1] : [status, before, limit + 1]
      const rows = db.prepare(`SELECT r.id,r.comment_id AS commentId,r.reason,r.status,r.created_at AS createdAt,
          c.content,c.entity_key AS entityKey,c.deleted_at AS deletedAt,u.nickname AS author
        FROM comment_reports r JOIN comments c ON c.id=r.comment_id JOIN users u ON u.id=c.user_id
        WHERE ${where} ORDER BY r.id LIMIT ?`).all(...args)
      const reports = rows.slice(0, limit).map(row => ({ ...row }))
      return { reports, nextCursor: rows.length > limit ? reports[reports.length - 1].id : null }
    },
    moderateComment(adminId, id, deleted) {
      const row = db.prepare('SELECT id FROM comments WHERE id=?').get(id)
      if (!row) return false
      if (deleted) db.prepare('UPDATE comments SET deleted_at=COALESCE(deleted_at,?),moderated_at=? WHERE id=?').run(now(), now(), id)
      else db.prepare('UPDATE comments SET deleted_at=NULL WHERE id=?').run(id)
      return true
    },
    adminAudit(actor, action, target, detail = '') {
      const nick = db.prepare('SELECT nickname FROM users WHERE id=?').get(actor)?.nickname ?? actor
      db.prepare('INSERT INTO admin_audit(actor,action,target,detail,created_at) VALUES(?,?,?,?,?)').run(nick, action, target, typeof detail === 'string' ? detail : JSON.stringify(detail), now())
    },
    listAdminAudit(before = Number.MAX_SAFE_INTEGER, limit = 50) {
      const rows = db.prepare('SELECT id,actor,action,target,detail,created_at AS createdAt FROM admin_audit WHERE id<? ORDER BY id DESC LIMIT ?').all(before, limit + 1)
      const items = rows.slice(0, limit).map(row => ({ ...row }))
      return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null }
    },
    // ---- 管理后台：用户偏好（队友的推荐服务定义 schema，此处防御式只读）----
    preferencesAvailable() {
      return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_preferences'").get()
    },
    listUserPreferences(userIds) {
      if (!this.preferencesAvailable() || !Array.isArray(userIds) || !userIds.length) return {}
      const placeholders = userIds.map(() => '?').join(',')
      const rows = db.prepare(`SELECT user_id AS userId, tags, updated_at AS updatedAt FROM user_preferences WHERE user_id IN (${placeholders})`).all(...userIds)
      return Object.fromEntries(rows.map(row => { try { return [row.userId, { tags: JSON.parse(row.tags), updatedAt: row.updatedAt }] } catch { return [row.userId, { tags: [], updatedAt: row.updatedAt }] } }))
    },
    preferenceStats() {
      if (!this.preferencesAvailable()) return null
      const rows = db.prepare('SELECT tags FROM user_preferences').all()
      const counts = new Map()
      for (const row of rows) {
        let tags = []
        try { tags = JSON.parse(row.tags) } catch { /* 忽略坏行 */ }
        for (const tag of Array.isArray(tags) ? tags : []) counts.set(tag, (counts.get(tag) || 0) + 1)
      }
      return { total: rows.length, tags: [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count) }
    },
    // ---- 账号密码登录（与邮箱验证码并行的第二种凭证，会话机制复用）----
    setPassword(userId, password) {
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('密码长度需为 8-128 位')
      if (!getUser(userId)) throw new Error('用户不存在')
      const salt = randomBytes(16).toString('base64')
      const hash = scryptSync(password, salt, 32).toString('base64')
      db.prepare('INSERT INTO passwords(user_id,digest,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET digest=excluded.digest,updated_at=excluded.updated_at')
        .run(userId, `scrypt$${salt}$${hash}`, now())
    },
    verifyPassword(email, password) {
      if (typeof email !== 'string' || typeof password !== 'string') return null
      const identity = db.prepare("SELECT user_id FROM identities WHERE provider='email' AND subject=?").get(email.trim().toLowerCase())
      if (!identity) return null
      const row = db.prepare('SELECT digest FROM passwords WHERE user_id=?').get(identity.user_id)
      if (!row) return null
      const parts = row.digest.split('$')
      if (parts.length !== 3 || parts[0] !== 'scrypt') return null
      const attempt = scryptSync(password, parts[1], 32)
      const expected = Buffer.from(parts[2], 'base64')
      if (attempt.length !== expected.length || !timingSafeEqual(attempt, expected)) return null
      return getUser(identity.user_id)
    },
    hasPassword(userId) { return !!db.prepare('SELECT user_id FROM passwords WHERE user_id=?').get(userId) },
    // ---- 管理后台：概览统计 ----
    manageStats() {
      return {
        users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
        comments: db.prepare('SELECT COUNT(*) AS n FROM comments').get().n,
        pendingReports: db.prepare("SELECT COUNT(*) AS n FROM comment_reports WHERE status='pending'").get().n,
        preferencesAvailable: this.preferencesAvailable(),
        preferenceStats: this.preferenceStats(),
      }
    },
    close() { db.close() },
  }
}
