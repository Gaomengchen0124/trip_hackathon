import { DatabaseSync } from 'node:sqlite'
import { mkdirSync,chmodSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { assert } from '../../src/planning/core.mjs'
export const digest=s=>createHash('sha256').update(s).digest('hex');
export function createPlanningStore({file='var/planning.sqlite',now=Date.now}={}) {
  if(file!==':memory:')mkdirSync(dirname(file),{recursive:true,mode:0o700});
  const db=new DatabaseSync(file);if(file!==':memory:')chmodSync(file,0o600);
  if(db.prepare('PRAGMA user_version').get().user_version>1){db.close();throw new Error('Unsupported planning database version')}
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS resources(id TEXT PRIMARY KEY,owner TEXT NOT NULL,kind TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,expires INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS resource_owner ON resources(owner,kind); CREATE TABLE IF NOT EXISTS idempotency(owner TEXT,route TEXT,key TEXT,hash TEXT,result TEXT,expires INTEGER,PRIMARY KEY(owner,route,key)); CREATE TABLE IF NOT EXISTS limits(owner TEXT PRIMARY KEY,start INTEGER,count INTEGER);`);
  db.exec('PRAGMA user_version=1');
  db.exec('CREATE TABLE IF NOT EXISTS itinerary_versions(owner TEXT,id TEXT,version INTEGER,body TEXT NOT NULL,PRIMARY KEY(owner,id,version))');
  db.prepare('UPDATE idempotency SET result=? WHERE result IS NULL').run(JSON.stringify({status:503,error:{code:'SERVER_RESTARTED',message:'服务重启，请使用新幂等键重试',retryable:true}}));
  // A restart cannot silently resume an interrupted remote request.
  for(const row of db.prepare("SELECT id,body FROM resources WHERE kind='job'").all()) {const body=JSON.parse(row.body);if(['running','queued'].includes(body.state)){body.state='failed';body.error={code:'SERVER_RESTARTED',message:'服务重启，请重新生成',retryable:true};db.prepare('UPDATE resources SET body=? WHERE id=?').run(JSON.stringify(body),row.id)}}
  return {
    get(owner,id,kind) {const r=db.prepare('SELECT * FROM resources WHERE id=? AND owner=? AND kind=? AND expires>?').get(id,owner,kind,now());assert(r,'NOT_FOUND','资源不存在或无权访问',404);return JSON.parse(r.body)},
    put(owner,id,kind,body,{expectedRevision,revision=kind==='itinerary'?body.version:body.intakeRevision||body.version||1}={}) {
      if(expectedRevision!==undefined) {const r=db.prepare('UPDATE resources SET body=?,revision=? WHERE id=? AND owner=? AND kind=? AND revision=? AND expires>?').run(JSON.stringify(body),revision,id,owner,kind,expectedRevision,now());assert(r.changes===1,'STALE_INTAKE','需求已更新，请重新读取',409)}
      else db.prepare('INSERT INTO resources VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,revision=excluded.revision WHERE resources.owner=excluded.owner AND resources.kind=excluded.kind').run(id,owner,kind,revision,JSON.stringify(body),now()+7*86400000);
      return body;
    },
    version(owner,id,version) {const r=db.prepare('SELECT body FROM itinerary_versions WHERE owner=? AND id=? AND version=?').get(owner,id,version);if(r)return JSON.parse(r.body);const c=db.prepare("SELECT body FROM resources WHERE owner=? AND id=? AND kind='itinerary' AND expires>?").get(owner,id,now());assert(c&&JSON.parse(c.body).version===version,'NOT_FOUND','历史版本不存在',404);return JSON.parse(c.body)},
    commit(owner,{itinerary,session,baseVersion,baseIntakeRevision}) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const row=db.prepare("SELECT body FROM resources WHERE id=? AND owner=? AND kind='itinerary' AND expires>?").get(itinerary.id,owner,now());
        const old=row&&JSON.parse(row.body);assert(old&&old.version===baseVersion,'STALE_VERSION','行程已更新，请重新预览',409);
        const sr=db.prepare("SELECT body FROM resources WHERE id=? AND owner=? AND kind='session' AND expires>?").get(session.planningSessionId,owner,now());
        assert(sr&&JSON.parse(sr.body).intakeRevision===baseIntakeRevision,'STALE_INTAKE','需求已更新，请重新预览',409);
        db.prepare('INSERT OR IGNORE INTO itinerary_versions VALUES(?,?,?,?)').run(owner,old.id,old.version,JSON.stringify(old));
        db.prepare('INSERT INTO itinerary_versions VALUES(?,?,?,?)').run(owner,itinerary.id,itinerary.version,JSON.stringify(itinerary));
        db.prepare("UPDATE resources SET revision=?,body=? WHERE id=? AND owner=? AND kind='itinerary'").run(itinerary.version,JSON.stringify(itinerary),itinerary.id,owner);
        db.prepare("UPDATE resources SET revision=?,body=? WHERE id=? AND owner=? AND kind='session'").run(session.intakeRevision,JSON.stringify(session),session.planningSessionId,owner);
        db.exec('COMMIT');return itinerary;
      } catch(e) {db.exec('ROLLBACK');throw e}
    },
    idempotentStart(owner,route,key,body) {
      assert(typeof key==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(key),'INVALID_IDEMPOTENCY_KEY','请提供8至100位幂等键');
      const h=digest(JSON.stringify(body));db.prepare('DELETE FROM idempotency WHERE expires<=?').run(now());
      const r=db.prepare('SELECT * FROM idempotency WHERE owner=? AND route=? AND key=?').get(owner,route,key);
      if(r) {assert(r.hash===h,'IDEMPOTENCY_CONFLICT','相同幂等键对应不同请求',409);assert(r.result,'REQUEST_IN_PROGRESS','请求正在处理，请稍后重试',409);return JSON.parse(r.result)}
      db.prepare('INSERT INTO idempotency VALUES(?,?,?,?,NULL,?)').run(owner,route,key,h,now()+86400000);return null;
    },
    idempotentFinish(owner,route,key,result) {db.prepare('UPDATE idempotency SET result=? WHERE owner=? AND route=? AND key=?').run(JSON.stringify(result),owner,route,key)},
    rateLimit(owner,max,windowMs) {db.prepare('DELETE FROM limits WHERE start<=?').run(now()-windowMs);const r=db.prepare('SELECT count FROM limits WHERE owner=?').get(owner);if(r?.count>=max)return false;db.prepare('INSERT INTO limits VALUES(?,?,1) ON CONFLICT(owner) DO UPDATE SET count=count+1').run(owner,now());return true},
    cleanup() {db.prepare('DELETE FROM resources WHERE expires<=?').run(now());db.prepare('DELETE FROM idempotency WHERE expires<=?').run(now());db.exec("DELETE FROM itinerary_versions WHERE NOT EXISTS (SELECT 1 FROM resources r WHERE r.id=itinerary_versions.id AND r.owner=itinerary_versions.owner AND r.kind='itinerary')")},
    close(){db.close()}
  }
}
