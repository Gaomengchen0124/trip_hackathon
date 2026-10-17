export const OPENING_SEEN_KEY = 'story-pilgrim.opening.v1'

// Direct links and browser back should lead straight to the requested content.
export function shouldShowOpening(location, storage) {
  if (location.pathname !== '/' || location.hash) return false
  const preview = new URLSearchParams(location.search).get('intro')
  if (preview === '0') return false
  if (preview === '1') return true
  try { return storage.getItem(OPENING_SEEN_KEY) !== 'seen' } catch { return true }
}

export function rememberOpening(storage) {
  try { storage.setItem(OPENING_SEEN_KEY, 'seen') } catch { /* Storage is optional. */ }
}
