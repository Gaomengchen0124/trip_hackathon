import '../server/env.mjs'
import {loadLocalEnv} from '../server/planning/config.mjs'
import {spawn} from 'node:child_process'
loadLocalEnv()
const port=Number(process.env.WEB_PORT||5180)
const origins=[...new Set([port,5173,5174,4173].flatMap(p=>[`http://localhost:${p}`,`http://127.0.0.1:${p}`]))]
const env={...process.env,AUTH_ORIGIN:process.env.AUTH_ORIGIN||`http://127.0.0.1:${port}`,AUTH_ADDITIONAL_ORIGINS:process.env.AUTH_ADDITIONAL_ORIGINS||origins.join(','),AUTH_LOCAL_HTTP:process.env.AUTH_LOCAL_HTTP||'1',WISH_ALLOWED_ORIGINS:process.env.WISH_ALLOWED_ORIGINS||origins.join(','),CONTENT_ORIGIN:process.env.CONTENT_ORIGIN||`http://127.0.0.1:${port}`,PLANNING_PORT:'8790',PLANNING_ALLOWED_ORIGINS:process.env.PLANNING_ALLOWED_ORIGINS||origins.join(',')}
Object.assign(env,{AUTH_PORT:process.env.INTEGRATED_AUTH_PORT||'18888',WISH_PORT:process.env.INTEGRATED_WISH_PORT||'18887',CONTENT_PORT:process.env.INTEGRATED_CONTENT_PORT||'18889',PLANNING_PORT:process.env.INTEGRATED_PLANNING_PORT||'18790'})
env.AUTH_BASE_URL=`http://127.0.0.1:${env.AUTH_PORT}`
env.WISH_BASE_URL=`http://127.0.0.1:${env.WISH_PORT}`
for(const key of ['AUTH_ADDITIONAL_ORIGINS','WISH_ALLOWED_ORIGINS','PLANNING_ALLOWED_ORIGINS'])env[key]=[...new Set([...origins,...(env[key]||'').split(',').filter(Boolean)])].join(',')
env.CONTENT_ORIGIN=`http://127.0.0.1:${port}`
const children=[]
let stopping=false
function stop(code=0){if(stopping)return;stopping=true;process.exitCode=code;for(const child of children)child.kill('SIGTERM')}
for(const args of [['server/auth.mjs'],['scripts/start-api.mjs'],['server/content.mjs'],['scripts/start-planning.mjs'],['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort']]){
 const child=spawn(process.execPath,args,{env,stdio:'inherit'});children.push(child)
 child.on('error',error=>{console.error(error.message);stop(1)})
 child.on('exit',(code,signal)=>{if(!stopping){console.error(`${args[0]} stopped (${signal||code})`);stop(code||1)}})
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop())
console.log(`Integrated site: http://127.0.0.1:${port}/ (planning:${env.PLANNING_PORT}, content:${env.CONTENT_PORT}, auth:${env.AUTH_PORT}, recommendations:${env.WISH_PORT})`)
