import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const env={...process.env}
// 本机 Node 的内置 CA 集合可能不含系统证书；扩展系统信任包，始终保留 TLS 验证。
if(process.platform==='darwin'&&!env.NODE_EXTRA_CA_CERTS&&existsSync('/etc/ssl/cert.pem'))env.NODE_EXTRA_CA_CERTS='/etc/ssl/cert.pem'
const child=spawn(process.execPath,['server/wishes.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env,stdio:'inherit'})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
child.on('error',error=>{console.error(error.message);process.exitCode=1})
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0)})
