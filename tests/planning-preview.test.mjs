import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { mkdtemp,rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
test('preview integrates planning and auth without exposing local configuration',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'planning-preview-'));
 const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const child=spawn(process.execPath,['server/preview.mjs'],{env:{...process.env,DEEPSEEK_API_KEY:'',PREVIEW_PORT:String(port),AUTH_DATA_FILE:join(dir,'auth.sqlite'),PLANNING_DATA_FILE:join(dir,'planning.sqlite')},stdio:['ignore','pipe','pipe']});
 try {
  await Promise.race([new Promise((resolve,reject)=>{child.stdout.on('data',d=>{if(d.toString().includes('Preview:'))resolve()});child.on('error',reject);child.on('exit',()=>reject(Error('preview exited before ready')))}),new Promise((_,reject)=>setTimeout(()=>reject(Error('startup timeout')),5000).unref())]);
  const base=`http://127.0.0.1:${port}`;
  assert.equal((await fetch(base+'/')).status,200);
  const status=await (await fetch(base+'/api/planning/status')).json();assert.equal(status.data.configured,false);
  assert.equal((await fetch(base+'/api/auth/session')).status,200);
  assert.equal((await fetch(base+'/server/.env.local')).status,404);
  const request=await fetch(base+'/api/planning/sessions',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:'preview_smoke',context:{}})});assert.equal(request.status,503);
 } finally {child.kill('SIGTERM');if(child.exitCode===null)await once(child,'exit');await rm(dir,{recursive:true,force:true})}
});
