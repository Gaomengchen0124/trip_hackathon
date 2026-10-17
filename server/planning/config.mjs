import { resolve } from 'node:path'
export function loadLocalEnv() {
  try{process.loadEnvFile(resolve('server/.env.local'))}catch(e){if(e.code!=='ENOENT')throw e}
}
