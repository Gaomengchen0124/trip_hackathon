import { reactive } from 'vue'
import { getAuthSession } from '../auth/session.mjs'
import { authRequest } from '../auth/server-session.mjs'
import { emptyInterests,validateInterests } from './options.mjs'
export const profileState=reactive({userId:null,interests:emptyInterests(),loading:true,error:'',open:false,onboarding:false,revision:0})
let generation=0, unsubscribe, currentIdentity, cancelOnboarding=()=>{}
const dismissed=new Set()
const localKey=id=>'pilgrimage.interests.v1.'+id
function localRead(id){try{return JSON.parse(localStorage.getItem(localKey(id)) || 'null')}catch{return null}}
// Queue behind existing dialogs instead of losing the onboarding prompt after one timer.
function queueOnboarding(version,id){
  cancelOnboarding()
  let timer
  const stop=()=>{observer.disconnect();clearTimeout(timer)}
  const attempt=()=>{
    if(version!==generation || dismissed.has(id)){stop();return}
    if(document.querySelector('dialog[open]'))return
    stop();openInterests(true)
  }
  const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(attempt,0)})
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']})
  timer=setTimeout(attempt,0)
  cancelOnboarding=stop
}
export function initInterests(){
  if(unsubscribe)return
  const auth=getAuthSession()
  unsubscribe=auth.subscribe(async snapshot=>{
    if(snapshot.loading)return
    const id=snapshot.user?.id || 'guest'
    if(currentIdentity===id)return
    const signingIn=currentIdentity==='guest' && snapshot.isLoggedIn
    if(signingIn)dismissed.delete(id)
    cancelOnboarding()
    currentIdentity=id
    const version=++generation
    profileState.loading=true
    profileState.userId=snapshot.user?.id || null
    profileState.open=false;profileState.interests=emptyInterests();profileState.error='';profileState.loading=true
    try{
      const profile=snapshot.isLoggedIn && snapshot.mode==='server' ? (await authRequest('/api/me/interests')).profile : localRead(id)
      if(version!==generation)return
      profileState.interests=profile?validateInterests(profile.interests):emptyInterests()
      profileState.revision++
      const hasInterests=Object.values(profileState.interests).some(values=>values.length>0)
      if(snapshot.isLoggedIn && (!profile || (signingIn && !hasInterests)) && !dismissed.has(id))queueOnboarding(version,id)
    }catch(error){if(version===generation)profileState.error=error.message}
    finally{if(version===generation)profileState.loading=false}
  })
}
export function openInterests(onboarding=false){cancelOnboarding();profileState.onboarding=onboarding;profileState.open=true}
export function dismissInterests(){cancelOnboarding();dismissed.add(currentIdentity);profileState.open=false}
export async function saveInterests(input,status='saved'){
  const auth=getAuthSession().getSnapshot(),version=generation,interests=validateInterests(input)
  if(auth.isLoggedIn && auth.mode==='server')await authRequest('/api/me/interests',{method:'PUT',body:{interests,status}})
  else localStorage.setItem(localKey(auth.user?.id || 'guest'),JSON.stringify({interests,status}))
  if(version!==generation)return false
  profileState.interests=interests;profileState.revision++;profileState.error='';dismissInterests();return true
}

export async function reloadInterests(){
  const version=generation,auth=getAuthSession().getSnapshot()
  profileState.loading=true;profileState.error=''
  try{
    const profile=auth.isLoggedIn && auth.mode==='server' ? (await authRequest('/api/me/interests')).profile : localRead(auth.user?.id || 'guest')
    if(version===generation){profileState.interests=profile?validateInterests(profile.interests):emptyInterests();profileState.revision++}
  }catch(error){if(version===generation)profileState.error=error.message}
  finally{if(version===generation)profileState.loading=false}
}
