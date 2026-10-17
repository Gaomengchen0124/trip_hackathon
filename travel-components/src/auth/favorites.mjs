import { getAuthSession } from './session.mjs'
import { authRequest } from './server-session.mjs'
const listeners = new Set()
let keys = new Set(), owner = null, generation = 0
let initialized = false
const auth = () => getAuthSession()
const publish = () => { for (const listener of listeners) listener(new Set(keys)) }
export function subscribeFavorites(listener) {
  if (!initialized) {
    initialized = true
    auth().subscribe(state => {
      if (state.user?.id === owner) return
      owner = state.user?.id || null; keys = new Set(); generation++; publish()
      if (owner) refreshFavorites().catch(() => {})
    })
  }
  listeners.add(listener); listener(new Set(keys)); return () => listeners.delete(listener)
}
export async function refreshFavorites() {
  const id = auth().getSnapshot().user?.id
  const current = generation
  if (!id) return
  if (auth().getSnapshot().mode === 'server') {
    const value = await authRequest('/api/favorites')
    if (current === generation) { keys = new Set(value.favorites); publish() }
  } else {
    try { keys = new Set(JSON.parse(localStorage.getItem(`book-travel.favorites.${id}`) || '[]')); publish() } catch { keys = new Set(); publish() }
  }
}
export async function setFavorite(key, saved) {
  const id = auth().getSnapshot().user?.id
  if (!id) throw new Error('请先登录。')
  const current = ++generation
  if (auth().getSnapshot().mode === 'server') {
    const value = await authRequest('/api/favorites', { method: 'PUT', body: { entityKey: key, saved } })
    if (current !== generation) return
    keys = new Set(value.favorites)
  } else {
    const updated = new Set(keys); saved ? updated.add(key) : updated.delete(key)
    localStorage.setItem(`book-travel.favorites.${id}`, JSON.stringify([...updated])); keys = updated
  }
  publish()
}
