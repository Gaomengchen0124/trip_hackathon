import { DatabaseSync } from 'node:sqlite'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'
import { validateProfile } from '../src/auth/profile.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')
const TTL = 7 * 86400000
export function createAuthStore({ file = 'var/auth.sqlite', now = Date.now } = {}) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(file)
  if (file !== ':memory:') chmodSync(file, 0o600)
  if (db.prepare('PRAGMA user_version').get().user_version > 5) { db.close(); throw new Error('Unsupported database version') }
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
    db.exec('PRAGMA user_version = 5; COMMIT')
  } catch (error) { db.exec('ROLLBACK'); db.close(); throw error }
  function getUser(id) {
    const row = db.prepare('SELECT id,nickname,avatar FROM users WHERE id=?').get(id)
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
          db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, '巡礼读者', '', now())
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
    close() { db.close() },
  }
}
