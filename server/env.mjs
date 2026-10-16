// 同 Vite 一样从项目根目录读取本地配置；密钥仅由 Node 服务使用。
import { resolve } from 'node:path'
const existing={...process.env}
for(const name of ['.env','.env.local']){
 try{process.loadEnvFile(resolve(name))}catch(error){if(error.code!=='ENOENT')throw error}
}
Object.assign(process.env,existing)
