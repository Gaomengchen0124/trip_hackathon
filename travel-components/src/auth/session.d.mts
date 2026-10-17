export interface User {
  readonly id: string
  readonly nickname: string
  readonly avatar: string | null
  readonly provider?: 'demo'
}
export interface AuthState {
  user: Readonly<User> | null
  isLoggedIn: boolean
  mode: 'demo' | 'server'
  notice: string
  loading?: boolean
}
export interface AuthSession {
  getSnapshot(): AuthState
  subscribe(listener: (state: AuthState) => void): () => void
  loginDemo?(): void
  sendCode?(email: string): Promise<void>
  loginEmail?(email: string, code: string): Promise<void>
  refresh?(): Promise<void>
  updateProfile(profile: { nickname: string; avatar: string | null }): { ok: boolean; error: string } | Promise<{ ok: boolean; error: string }>
  logout(): void | Promise<void>
  destroy(): void
}
export const SESSION_KEY: string
export function createAuthSession(options?: { storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; events?: Window; now?: () => number }): AuthSession
export function getAuthSession(): AuthSession
