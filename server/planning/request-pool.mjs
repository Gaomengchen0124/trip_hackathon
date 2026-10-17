import {PlanningError} from '../../src/planning/core.mjs'
export function waitWithSignal(ms,signal){
 signal?.throwIfAborted();return new Promise((resolve,reject)=>{const finish=()=>{signal?.removeEventListener('abort',abort);resolve();},timer=setTimeout(finish,ms),abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);};signal?.addEventListener('abort',abort,{once:true});});
}
export function createRequestPool(limit,{maxQueued=32}={}){
 let active=0;const waiting=[];
 function pump(){while(active<limit&&waiting.length){const item=waiting.shift();item.signal?.removeEventListener('abort',item.abort);if(item.signal?.aborted){item.reject(item.signal.reason);continue;}active++;let released=false;item.resolve(()=>{if(released)return;released=true;active--;pump();});}}
 return {acquire(signal){signal?.throwIfAborted();if(waiting.length>=maxQueued)return Promise.reject(new PlanningError('LLM_BUSY','智能服务等待任务较多，请稍后重试',429,true));return new Promise((resolve,reject)=>{const item={resolve,reject,signal,abort:()=>{const index=waiting.indexOf(item);if(index>=0)waiting.splice(index,1);reject(signal.reason);}};signal?.addEventListener('abort',item.abort,{once:true});waiting.push(item);pump();});}};
}
