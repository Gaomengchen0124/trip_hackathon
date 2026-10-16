export async function authRequest(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000), headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch { throw new Error('无法连接服务，请稍后重试。') }
  const value = await response.json().catch(() => ({}))
  if (response.status === 401) globalThis.window?.dispatchEvent(new Event('travel-auth-expired'))
  if (!response.ok) throw Object.assign(new Error(value.error || '请求失败，请重试。'), { status: response.status })
  return value
}
export function createServerSession() {
  let state = { user: null, isLoggedIn: false, mode: 'server', notice: '', loading: true }
  let revision = 0
  const listeners = new Set()
  const publish = value => { state = { ...state, ...value }; for (const listener of listeners) listener(state) }
  async function refresh() {
    const current = ++revision
    try { const { user } = await authRequest('/api/auth/session'); if (current === revision) publish({ user, isLoggedIn: !!user, loading: false, notice: '' }) }
    catch (error) { if (current === revision) publish({ user: null, isLoggedIn: false, loading: false, notice: error.message }) }
  }
  const expired = () => { revision++; publish({ user: null, isLoggedIn: false, loading: false, notice: '登录已失效，请重新登录。' }) }
  globalThis.window?.addEventListener('focus', refresh)
  globalThis.window?.addEventListener('travel-auth-expired', expired)
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener) },
    refresh,
    destroy() { revision++; listeners.clear(); globalThis.window?.removeEventListener('focus', refresh); globalThis.window?.removeEventListener('travel-auth-expired', expired) },
    async sendCode(email) { await authRequest('/api/auth/email/send', { method: 'POST', body: { email } }) },
    async loginEmail(email, code) { revision++; const { user } = await authRequest('/api/auth/email/verify', { method: 'POST', body: { email, code } }); publish({ user, isLoggedIn: true, loading: false, notice: '' }) },
    async loginPassword(email, password) { revision++; const { user } = await authRequest('/api/auth/password/login', { method: 'POST', body: { email, password } }); publish({ user, isLoggedIn: true, loading: false, notice: '' }) },
    async setPassword(password) { await authRequest('/api/auth/password/set', { method: 'POST', body: { password } }) },
    async logout() {
      revision++
      try { await authRequest('/api/auth/logout', { method: 'POST' }); publish({ user: null, isLoggedIn: false, loading: false, notice: '' }) }
      catch (error) { publish({ notice: error.message }) }
    },
    async updateProfile(profile) {
      try { const { user } = await authRequest('/api/auth/profile', { method: 'PATCH', body: profile }); publish({ user, isLoggedIn: true, notice: '' }); return { ok: true, error: '' } }
      catch (error) { if (error.status === 401) publish({ user: null, isLoggedIn: false }); return { ok: false, error: error.message } }
    },
  }
}
