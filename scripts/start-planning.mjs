import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const env={...process.env}
if(process.platform==='darwin'&&!env.NODE_EXTRA_CA_CERTS&&existsSync('/etc/ssl/cert.pem'))env.NODE_EXTRA_CA_CERTS='/etc/ssl/cert.pem'
const child=spawn(process.execPath,['--env-file-if-exists=server/.env.auth.local','server/planning-api.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env,stdio:'inherit'})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
child.on('exit',code=>{process.exitCode=code||0})
