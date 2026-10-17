import test from 'node:test';import assert from 'node:assert/strict';
import {removalProposal,additionProposal,additionFits,endSlack} from '../src/planning/negotiation.mjs';
const ranked=['a','b','c','d'].map(poiId=>({poiId}));
test('removal finds first feasible ranked prefix, protects retained stops and can replace one by several',async()=>{
 const calls=[];const result=await removalProposal({ids:['a','b','c','d'],ranked,protectedIds:['a'],trial:async ids=>{calls.push(ids);return {feasible:ids.length<=2}}});
 assert.deepEqual(result.ids,['b','c']);assert.deepEqual(calls,[['a','b','c','d'],['a','c','d'],['a','d']]);
});
test('extended time clears every removal, exhausted protection cannot authorize generation',async()=>{
 assert.deepEqual((await removalProposal({ids:['a','b'],ranked,trial:async()=>({feasible:true})})).ids,[]);
 assert.equal((await removalProposal({ids:['a','b'],ranked,protectedIds:['a','b'],trial:async()=>({feasible:false})})).feasible,false);
});
const day=(ids,slack)=>({endAt:'2026-11-01T18:00:00+08:00',items:ids.map(poiId=>({type:'visit',poiId,endAt:`2026-11-01T17:${String(60-slack).padStart(2,'0')}:00+08:00`}))});
test('additions jointly fit, replace rejected points and retain fifteen minute buffer',async()=>{
 const result=await additionProposal({ids:['a'],ranked,rejectedIds:['b'],trial:async ids=>({feasible:ids.length<=2,days:[day(ids,20)]})});
 assert.deepEqual(result.ids,['c']);assert(result.baseFeasible);
 assert.equal(additionFits({feasible:true,days:[day(['a','b'],10)]},['a']),false);
 assert.equal(endSlack(day(['b'],20)),20);
 assert.equal(additionFits({feasible:true},['a']),false);
});
test('invalid base or failed/aborted trial never yields an actionable addition or removal',async()=>{
 assert.equal((await additionProposal({ids:['a'],ranked,trial:async()=>({feasible:false})})).baseFeasible,false);
 await assert.rejects(removalProposal({ids:['a','b'],ranked,trial:async()=>{throw Error('offline')}}),/offline/);
 const ctrl=new AbortController();ctrl.abort();await assert.rejects(removalProposal({ids:['a'],ranked,trial:async()=>({feasible:true}),signal:ctrl.signal}),{name:'AbortError'});
});
test('a confirmed fixed activity permits discarding all optional ordinary stops',async()=>{const result=await removalProposal({ids:['a'],ranked:[{poiId:'a'}],allowEmpty:true,trial:async ids=>({feasible:ids.length===0})});assert.equal(result.feasible,true);assert.deepEqual(result.ids,['a']);});
