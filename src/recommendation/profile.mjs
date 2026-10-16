import { reactive } from 'vue'
import { getAuthSession } from '../auth/session.mjs'
import { authRequest } from '../auth/server-session.mjs'
import { emptyInterests,validateInterests } from './options.mjs'
export const profileState=reactive({userId:null,interests:emptyInterests(),loading:true,error:'',open:false,onboarding:false,revision:0})
let generation=0, unsubscribe, currentIdentity
const dismissed=new Set()
const localKey=id=>'pilgrimage.interests.v1.'+id
function localRead(id){try{return JSON.parse(localStorage.getItem(localKey(id)) || 'null')}catch{return null}}
export function initInterests(){
  if(unsubscribe)return
  const auth=getAuthSession()
  unsubscribe=auth.subscribe(async snapshot=>{
    if(snapshot.loading)return
    const id=snapshot.user?.id || 'guest'
    if(currentIdentity===id)return
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
      if(snapshot.isLoggedIn && !profile && !dismissed.has(id)) {
        // Login dialog closes first, so the interest sheet does not compete for focus.
        setTimeout(()=>{if(version===generation && !document.querySelector('dialog[open]'))openInterests(true)},100)
      }
    }catch(error){if(version===generation)profileState.error=error.message}
    finally{if(version===generation)profileState.loading=false}
  })
}
export function openInterests(onboarding=false){profileState.onboarding=onboarding;profileState.open=true}
export function dismissInterests(){dismissed.add(currentIdentity);profileState.open=false}
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
