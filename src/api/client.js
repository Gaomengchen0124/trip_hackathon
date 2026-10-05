const BASE = import.meta.env.VITE_API_BASE || '/api'
const TIMEOUT = 8000

/** 统一 fetch 封装：超时 + JSON + 错误 */
async function request(path, options = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      ...options,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export const httpGet = (path) => request(path)
export const httpPost = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) })
