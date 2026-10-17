import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {searchLines, lineReadiness} from '../src/engine/catalog.mjs'
import {makeTravelFn} from '../src/engine/planner.mjs'
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)))
const index=read('../data/lines/index.json')
const docs=Object.fromEntries(index.lines.map(l=>[l.lineId,read('../'+l.file)]))
const sherlock=docs['sherlock-london']
test('Sherlock is searchable by Chinese, English and character names',()=>{
 for(const q of ['神探夏洛克','Sherlock','卷福','约翰·华生']) assert.ok(searchLines(q,index,docs).some(l=>l.lineId==='sherlock-london'))
})
test('Sherlock keeps globally unique IDs, preserving source IDs separately',()=>{
 const all=Object.values(docs).flatMap(d=>[...d.ipStops,...d.cityStops])
 assert.equal(new Set(all.map(p=>p.poiId)).size,all.length)
 assert.equal(sherlock.ipStops.length,7);assert.equal(sherlock.cityStops.length,15)
 for(const p of [...sherlock.ipStops,...sherlock.cityStops]){
  assert.match(p.poiId,/^sherlock-/);assert.match(p.sourcePoiId,/^sh-/)
  assert.ok(p.lng<0&&p.lat>51&&p.lat<52)
  assert.ok(p.mapUrl.includes(`mlat=${p.lat}&mlon=${p.lng}`))
 }
})
test('Apartment and cafe form one selectable stop without duplicate time or markers',()=>{
 assert.ok(!sherlock.ipStops.some(p=>p.poiId==='sherlock-ip-02'))
 assert.ok(sherlock.ipStops[0].name.includes('&'))
 assert.deepEqual(sherlock.ipStops[0].sourcePoiIds,['sh-ip-01','sh-ip-02'])
 assert.equal(sherlock.ipStops[0].durationNormal,75)
 assert.ok(sherlock.ipStops.every(p=>p.quotes.length===0))
})
test('Sourced location evidence works without fabricated quotes; unresolved scenes remain incomplete',()=>{
 const p={name:'Location',lng:-.1,lat:51.5,cluster:'London',basis:'Documented location',basisSources:['https://example.org/source'],quotes:[]}
 assert.equal(lineReadiness({ipStops:[p],cityStops:[p]}).ready,true)
 assert.equal(lineReadiness({ipStops:[{...p,basisSources:[]}],cityStops:[p]}).ready,false)
 assert.equal(lineReadiness(sherlock).ipDone,5)
 assert.equal(lineReadiness(sherlock).ready,false)
})

test('Pending photos never appear as a real-photo gallery',async()=>{
 const {poiPhotos}=await import('../src/utils/travel-ui.js')
 assert.deepEqual(poiPhotos({photoPending:true,realPhoto:'img/unavailable.jpg'}),[])
 assert.ok(poiPhotos(sherlock.ipStops[0]).length>0)
 assert.ok(sherlock.cityStops.some(p=>poiPhotos(p).length>0))
})
