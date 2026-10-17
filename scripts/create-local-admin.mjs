import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { authConfig } from '../server/auth-config.mjs'
import { createAuthStore } from '../server/auth-store.mjs'

export function createLocalAdmin({ email, file = authConfig().file } = {}) {
  const password = 'Trip!' + randomBytes(16).toString('base64url')
  const store = createAuthStore({ file, adminEmails: [] })
  try {
    const user = store.createLocalAdmin(email, password)
    return { email: email.trim().toLowerCase(), password, user }
  } finally { store.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { email: { type: 'string' } } })
    if (!values.email) throw new Error('Usage: npm run auth:create-admin -- --email admin@pilgrimage.test')
    const { email, password } = createLocalAdmin({ email: values.email })
    console.log('本地管理员已创建（请保存密码）：\n账号：' + email + '\n密码：' + password)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
