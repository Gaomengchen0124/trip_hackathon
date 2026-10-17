import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const AUTH_PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url))

export function authConfig(env = process.env) {
  const port = Number(env.AUTH_PORT || 8788)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid AUTH_PORT')
  return {
    port,
    // A relative path must not silently select another database when cwd changes.
    file: resolve(AUTH_PROJECT_ROOT, env.AUTH_DATA_FILE || 'var/auth.sqlite'),
    origin: env.AUTH_ORIGIN || 'http://127.0.0.1:5173',
    additionalOrigins: (env.AUTH_ADDITIONAL_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
    secure: env.AUTH_LOCAL_HTTP !== '1',
    secret: env.AUTH_CODE_SECRET,
  }
}
