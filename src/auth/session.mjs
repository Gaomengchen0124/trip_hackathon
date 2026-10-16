import { createServerSession } from './server-session.mjs'
import { PROFILE_KEY, validateProfile } from './profile.mjs'
/** @typedef {{id: string, nickname: string, avatar: string|null, provider: 'demo'}} User */
export const SESSION_KEY = 'book-travel.demo-session.v1'
const MAX_AGE = 7 * 24 * 60 * 60 * 1000
const DEMO_USER = Object.freeze({ id: 'demo-reader', nickname: '巡礼体验官', avatar: null, provider: 'demo' })

// Demo only: browser data is never proof of identity for server APIs.
export function createAuthSession({ storage, events, now = Date.now } = {}) {
  let user = null
  let notice = ''
  const listeners = new Set()
  const snapshot = () => ({ user, isLoggedIn: user !== null, mode: 'demo', notice })
  function readUser() {
    try {
      const profile = JSON.parse(storage?.getItem(PROFILE_KEY) || 'null')
      if (profile?.version === 1 && !validateProfile(profile)) {
        return Object.freeze({ ...DEMO_USER, nickname: profile.nickname.trim(), avatar: profile.avatar })
      }
    } catch { /* Ignore corrupt profile; identity always remains the demo identity. */ }
    return DEMO_USER
  }
  function restore() {
    user = null
    notice = ''
    try {
      const raw = storage?.getItem(SESSION_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (saved.version === 1 && saved.userId === DEMO_USER.id &&
          Number.isFinite(saved.createdAt) && saved.createdAt <= now() &&
          now() - saved.createdAt < MAX_AGE) user = readUser()
      else storage?.removeItem(SESSION_KEY)
    } catch {
      notice = '无法恢复演示状态，可重新体验登录。'
    }
  }
  function publish() { for (const listener of listeners) listener(snapshot()) }
  restore()
  function onStorage(event) {
    if (event.key === SESSION_KEY || event.key === PROFILE_KEY || event.key === null) { restore(); publish() }
  }
  events?.addEventListener('storage', onStorage)
  return {
    getSnapshot: snapshot,
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener) },
    loginDemo() {
      notice = ''
      try {
        if (!storage) throw new Error('Storage unavailable')
        storage.setItem(SESSION_KEY, JSON.stringify({ version: 1, userId: DEMO_USER.id, createdAt: now() }))
      } catch { notice = '浏览器无法保存状态，本次登录仅在当前页面有效。' }
      user = readUser()
      publish()
    },
    updateProfile(profile) {
      if (!user) return { ok: false, error: '请先登录后再编辑个人资料。' }
      const error = validateProfile(profile)
      if (error) return { ok: false, error }
      const saved = { version: 1, nickname: profile.nickname.trim(), avatar: profile.avatar }
      try {
        if (!storage) throw new Error('Storage unavailable')
        storage.setItem(PROFILE_KEY, JSON.stringify(saved))
      } catch { return { ok: false, error: '浏览器无法保存资料，请检查站点存储设置后重试。' } }
      user = Object.freeze({ ...DEMO_USER, nickname: saved.nickname, avatar: saved.avatar })
      notice = ''
      publish()
      return { ok: true, error: '' }
    },
    logout() {
      notice = ''
      try { storage?.removeItem(SESSION_KEY) }
      catch { notice = '本页已退出，但无法清除浏览器记录，请清理站点数据以防刷新恢复。' }
      user = null
      publish()
    },
    destroy() { events?.removeEventListener('storage', onStorage); listeners.clear() },
  }
}
let browserSession
export function getAuthSession() {
  if (!browserSession) {
    const location = globalThis.location
    const demo = location?.pathname.endsWith('/demo.html') && new URLSearchParams(location.search).get('auth') !== 'server'
    if (location && !demo) {
      browserSession = createServerSession()
      browserSession.refresh()
      return browserSession
    }
    let storage
    try { storage = globalThis.localStorage } catch { /* blocked by browser */ }
    browserSession = createAuthSession({ storage, events: globalThis.window })
  }
  return browserSession
}
