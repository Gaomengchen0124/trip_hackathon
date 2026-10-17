import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {createHash,scryptSync} from 'node:crypto'
import {mkdtemp,rm,rmdir} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createAuthStore} from '../server/auth-store.mjs'

for(const version of [5,6,7])test(`interest/password migration preserves version ${version} account data and can reopen`,async()=>{
 const dir=await mkdtemp(join(tmpdir(),'travel-interest-migration-')),file=join(dir,'auth.sqlite')
 const db=new DatabaseSync(file)
 let store
 try{
  db.exec(`
   CREATE TABLE users(id TEXT PRIMARY KEY,nickname TEXT NOT NULL,avatar TEXT NOT NULL,created_at INTEGER NOT NULL);
   CREATE TABLE identities(provider TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(provider,subject));
   CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
   CREATE TABLE favorites(user_id TEXT NOT NULL,entity_key TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,entity_key));
   CREATE TABLE comments(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,entity_key TEXT NOT NULL,content TEXT NOT NULL,request_id TEXT NOT NULL,created_at INTEGER NOT NULL,deleted_at INTEGER,moderated_at INTEGER,UNIQUE(user_id,request_id));
   INSERT INTO users VALUES('reader','原有读者','',1);
   INSERT INTO identities VALUES('email','reader@example.com','reader');
   INSERT INTO favorites VALUES('reader','line:kaiduan-xiamen',1);
   INSERT INTO comments(user_id,entity_key,content,request_id,created_at) VALUES('reader','line:kaiduan-xiamen','原有评论','old-comment',1);
   PRAGMA user_version=${version};
  `)
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update('a'.repeat(43)).digest('hex'),'reader',Date.now()+60000)
  if(version===6){
   db.exec('CREATE TABLE recommendation_profiles(user_id TEXT PRIMARY KEY,interests TEXT NOT NULL,status TEXT NOT NULL,updated_at INTEGER NOT NULL)')
   db.prepare('INSERT INTO recommendation_profiles VALUES(?,?,?,?)').run('reader',JSON.stringify({kinds:[],themes:['mystery'],moods:[],ipIds:[]}),'saved',1)
  }
  if(version===7){
   db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'; CREATE TABLE passwords(user_id TEXT PRIMARY KEY,digest TEXT NOT NULL,updated_at INTEGER NOT NULL);")
   db.prepare('INSERT INTO passwords VALUES(?,?,?)').run('reader',`scrypt$fixture-salt$${scryptSync('existing-password','fixture-salt',32).toString('base64')}`,1)
  }
  db.close()
  for(let run=0;run<2;run++){
   store=createAuthStore({file,adminEmails:[]})
   assert.equal(store.sessionUser('a'.repeat(43)).nickname,'原有读者')
   assert.deepEqual(store.listFavorites('reader'),['line:kaiduan-xiamen'])
   assert.equal(store.listComments('line:kaiduan-xiamen')[0].content,'原有评论')
   if(version===7)assert.equal(store.verifyPassword('reader@example.com','existing-password').id,'reader')
   if(version===6 || run===1)assert.deepEqual(store.getInterests('reader').interests.themes,['mystery'])
   store.setInterests('reader',{status:'saved',interests:{themes:['mystery']}})
   store.close();store=null
  }
  const inspect=new DatabaseSync(file)
  assert.equal(inspect.prepare('PRAGMA user_version').get().user_version,8);inspect.close()
 }finally{store?.close();if(db.isOpen)db.close();await rm(file,{force:true});await rmdir(dir)}
})
