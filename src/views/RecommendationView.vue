<script setup>
import { computed,ref,watch,onMounted,onBeforeUnmount,nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InterestFields from '../components/InterestFields.vue'
import PhotoFrame from '../components/ui/PhotoFrame.vue'
import WishForm from '../components/WishForm.vue'
import FavoriteButton from '../components/FavoriteButton.vue'
import DialogSheet from '../components/ui/DialogSheet.vue'
import { dictionaries,emptyInterests,validateInterests } from '../recommendation/options.mjs'
import { getCatalog,request } from '../recommendation/client.mjs'
import { profileState,initInterests,reloadInterests } from '../recommendation/profile.mjs'
const route=useRoute(),router=useRouter()
const returnToFilters=route.query.edit==='1'
const fresh=()=>({mode:'discover',ipId:'',city:'',text:'',interests:emptyInterests(),excludedIpIds:[]})
const form=ref(fresh()),expanded=ref(true),catalog=ref(null),catalogError=ref(''),busy=ref(false),error=ref(''),result=ref(null),submitted=ref(''),feedback=ref(''),wishOpen=ref(false),sourceInfoOpen=ref(false),storageNotice=ref(''),filterBar=ref(null)
let controller,requestVersion=0,cacheKey='',activeIdentity=null
const clone=x=>JSON.parse(JSON.stringify(x))
const sourceLabel=computed(()=>result.value?.source==='ai'?'AI 智能推荐':result.value?.source==='basic'?'基础推荐':'暂无匹配')
const pending=computed(()=>!!result.value && JSON.stringify(form.value)!==submitted.value)
const summary=computed(()=>{
  const tags=['kinds','themes','moods'].flatMap(key=>form.value.interests[key].map(id=>dictionaries[key].find(t=>t.id===id)?.label).filter(Boolean))
  return ['旅行灵感',form.value.city || '目的地不限',...tags,...(form.value.interests.ipIds.length?[`${form.value.interests.ipIds.length} 部喜欢的作品`]:[]),...(form.value.text?['附有兴趣描述']:[]),...(form.value.excludedIpIds.length?[`${form.value.excludedIpIds.length} 部暂不推荐`]:[])].join(' · ')
})
const kindLabel=id=>dictionaries.kinds.find(x=>x.id===id)?.label || '作品'
const tagLabel=(group,id)=>dictionaries[group].find(x=>x.id===id)?.label || id
function persist(){
  if(!cacheKey)return
  try{sessionStorage.setItem(cacheKey,JSON.stringify({version:1,expires:Date.now()+2*3600000,form:form.value,result:result.value,submitted:submitted.value,expanded:expanded.value}));storageNotice.value=''}
  catch{storageNotice.value='浏览器暂时无法保存本次推荐，刷新后可能需要重新选择。'}
}
function restore(id,previous){
  controller?.abort();requestVersion++;busy.value=false;error.value='';feedback.value='';sourceInfoOpen.value=false
  cacheKey='pilgrimage.recommendation.v1:'+id
  if(previous==='guest' && id!=='guest'){persist();return}
  form.value=fresh();result.value=null;submitted.value='';expanded.value=true
  form.value.interests=clone(profileState.interests)
  try{
    const saved=JSON.parse(sessionStorage.getItem(cacheKey) || 'null')
    if(saved?.version!==1 || saved.expires<Date.now())return
    const f=saved.form
    if(!['discover','by_work'].includes(f.mode) || typeof f.ipId!=='string' || typeof f.city!=='string' || typeof f.text!=='string' || f.text.length>500 || !Array.isArray(f.excludedIpIds))return
    const interests=validateInterests(f.interests)
    if(f.mode==='by_work'){
      if(f.ipId)interests.ipIds=[...new Set([...interests.ipIds,f.ipId])].slice(0,20)
      form.value={...fresh(),city:f.city,text:f.text,interests,excludedIpIds:f.excludedIpIds}
      feedback.value='之前选择的作品已加入偏好，可探索更多相关故事。'
      return
    }
    form.value={...fresh(),...f,mode:'discover',ipId:'',interests}
    if(saved.result && Array.isArray(saved.result.items) && saved.result.items.every(x=>typeof x.lineId==='string' && x.ip && Array.isArray(x.reasons) && Array.isArray(x.highlights) && Array.isArray(x.themes)))result.value=saved.result
    submitted.value=typeof saved.submitted==='string'?saved.submitted:'';expanded.value=returnToFilters || !result.value || saved.expanded!==false
  }catch{storageNotice.value='之前的推荐记录无法恢复，可以重新选择。'}
}
watch(()=>profileState.loading?null:(profileState.userId || 'guest'),id=>{if(id && id!==activeIdentity){const previous=activeIdentity;activeIdentity=id;restore(id,previous)}}, {immediate:true})
watch([form,result,submitted,expanded],persist,{deep:true})
async function loadCatalog(){catalogError.value='';try{catalog.value=await getCatalog()}catch(e){catalogError.value=e.message}}
function collapseOutside(event){
  if(expanded.value && filterBar.value && !event.composedPath().includes(filterBar.value))expanded.value=false
}
function collapseOnEscape(event){
  if(event.key==='Escape' && expanded.value && filterBar.value?.contains(document.activeElement)){
    expanded.value=false;filterBar.value.querySelector('.toggle-filter')?.focus()
  }
}
onMounted(()=>{if(returnToFilters){const {edit,...query}=route.query;router.replace({query})}initInterests();loadCatalog();document.addEventListener('click',collapseOutside);document.addEventListener('keydown',collapseOnEscape)})
onBeforeUnmount(()=>{requestVersion++;controller?.abort();document.removeEventListener('click',collapseOutside);document.removeEventListener('keydown',collapseOnEscape)})
function useProfile(){form.value.interests=clone(profileState.interests);feedback.value='已带入保存的兴趣，点击推荐后生效。'}
function reset(){form.value=fresh();feedback.value='';error.value=''}
function toggleWork(id){
  const ids=form.value.interests.ipIds
  form.value.interests.ipIds=ids.includes(id)?ids.filter(x=>x!==id):[...ids,id].slice(0,20)
}
async function generate(){
  if(busy.value)return
  error.value='';feedback.value='';busy.value=true;sourceInfoOpen.value=false
  const version=++requestVersion,body=clone(form.value)
  controller=new AbortController();const timer=setTimeout(()=>controller.abort(),35000)
  try{
    const value=await request('/api/recommendations',{method:'POST',body,signal:controller.signal})
    if(version!==requestVersion)return
    result.value=value;submitted.value=JSON.stringify(body);expanded.value=false
    await nextTick();filterBar.value?.scrollIntoView({block:'start',behavior:'auto'})
  }catch(e){if(version===requestVersion)error.value=e.name==='AbortError'?'推荐等待超时，请重试；你的条件已保留。':e.message}
  finally{clearTimeout(timer);if(version===requestVersion)busy.value=false}
}
function exclude(item){
  const ids=form.value.excludedIpIds
  form.value.excludedIpIds=ids.includes(item.ipId)?ids.filter(x=>x!==item.ipId):[...ids,item.ipId]
  feedback.value='反馈已记下，点击重新推荐后生效；不会改动长期兴趣。'
}
</script>
<template>
  <main class="page recommend-page">
    <router-link to="/" class="back">← 回到首页</router-link>
    <header class="recommend-heading"><span class="eyebrow">STORIES LEAD THE WAY</span><h1>让故事，带你去下一站</h1><p>从题材与故事氛围出发，发现意想不到的作品和巡礼路线。</p></header>
    <p v-if="catalogError" class="error-box" role="alert">{{ catalogError }} <button @click="loadCatalog">重试加载</button><router-link to="/">返回首页浏览路线</router-link></p>
    <p v-else-if="!catalog" role="status" class="loading">正在整理作品与目的地…</p>
    <section v-if="catalog" ref="filterBar" class="filter-shell" aria-label="推荐筛选">
      <div class="filter-bar" @click="expanded=!expanded">
        <button type="button" class="toggle-filter" :aria-expanded="expanded" aria-controls="recommend-filters" @click.stop="expanded=!expanded">
          <span class="filter-summary"><strong>你的巡礼线索 <span v-if="pending" class="pending">待更新</span></strong><span :title="summary">{{ summary }}</span></span>
          <span class="toggle-label">{{ expanded?'收起筛选':'展开筛选' }} <span aria-hidden="true">{{ expanded?'−':'＋' }}</span></span>
        </button>
        <button v-if="!expanded" class="btn compact-generate" :disabled="busy" @click.stop="generate">{{ busy?'寻找中…':'重新推荐' }}</button>
      </div>
      <form v-show="expanded" id="recommend-filters" class="filter-content" @submit.prevent="generate">
        <fieldset :disabled="busy" class="filter-fields">
          <div class="section-label"><h2>什么样的故事会打动你？</h2><button type="button" class="text-link" :disabled="profileState.loading" @click="useProfile">我的兴趣</button></div>
          <p class="hint">都可以不选，先看看有哪些灵感。点击“我的兴趣”可带入已保存的选择；本页修改仅用于本次推荐。</p>
          <p v-if="profileState.error" class="hint" role="status">保存的兴趣暂未载入，本次仍可自行选择。<button type="button" class="text-link" @click="reloadInterests">重新加载兴趣</button></p>
          <InterestFields v-model="form.interests" :show-works="false" />
          <div class="destination-row"><label for="recommend-city">想去哪里？<small>可选</small></label><select id="recommend-city" v-model="form.city"><option value="">目的地不限</option><option v-for="city in catalog.cities" :key="city">{{ city }}</option></select></div>
          <section class="preference-extra" aria-labelledby="preference-title">
            <label id="preference-title" for="recommend-text" class="text-label">偏好补充 <small>可选</small></label>
            <textarea id="recommend-text" v-model="form.text" rows="2" maxlength="500" aria-describedby="preference-help" placeholder="喜欢哪些作品、人物或故事？例如：喜欢《盗墓笔记》的探险和悬念，也想发现类似的故事。"></textarea>
            <div id="preference-help" class="hint text-help"><span>作品、人物和兴趣均可填写</span><span>{{ form.text.length }}/500</span></div>
            <p class="work-hint">也可以点选已收录作品 <small>可多选，仅作为偏好</small></p>
            <div class="preference-works" role="group" aria-label="偏好的作品"><button v-for="work in catalog.works" :key="work.ipId" type="button" :aria-pressed="form.interests.ipIds.includes(work.ipId)" @click="toggleWork(work.ipId)">{{ work.name }}</button></div>
          </section>
          <p v-if="form.excludedIpIds.length" class="hint">本次暂不推荐 {{ form.excludedIpIds.length }} 部作品。<button type="button" class="text-link" @click="form.excludedIpIds=[]">撤销全部反馈</button></p>
          <div class="filter-actions"><button class="btn generate" type="submit">{{ busy?'正在寻找你的下一站…':result?'重新推荐':'为我寻找灵感' }}</button><button type="button" class="text-link" @click="reset">清空条件</button></div>
        </fieldset>
      </form>
    </section>
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>
    <p v-if="feedback" role="status" class="feedback">{{ feedback }}</p>
    <p v-if="storageNotice" class="hint">{{ storageNotice }}</p>
    <div v-if="busy" class="loading" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span>正在从已有路线里寻找适合你的故事…</div>
    <section v-if="result" class="results" :aria-busy="busy" aria-label="推荐结果">
      <div class="result-heading"><div><span class="eyebrow">YOUR NEXT CHAPTER</span><h2>{{ result.items.length?'这些故事，值得你亲自走一趟':'还没有找到合适的下一站' }}</h2></div><button type="button" class="source-badge" aria-haspopup="dialog" :aria-label="`查看${sourceLabel}说明`" @click="sourceInfoOpen=true">{{ sourceLabel }} <span aria-hidden="true">ⓘ</span></button></div>
      <p class="result-notice">{{ result.notice }}</p>
      <p v-if="pending" class="changed-notice">筛选条件已修改，下方仍是上一次的结果。点击“重新推荐”后更新。</p>
      <div v-if="result.items.length" class="result-grid">
        <article v-for="(item,index) in result.items" :key="item.lineId" class="recommend-card">
          <div class="cover-wrap"><PhotoFrame :src="item.cover" :alt="item.title" ratio="16 / 10" :eager="index===0" /><span class="card-number">0{{ index+1 }}</span></div>
          <div class="card-body"><p class="card-meta">{{ item.city }} · {{ kindLabel(item.ip.kind) }}</p><h3>{{ item.title }}</h3><div class="tag-row"><span v-for="id in item.themes" :key="id">{{ tagLabel('themes',id) }}</span></div>
            <div class="reason-box"><strong>为什么推荐给你</strong><ul><li v-for="reason in item.reasons" :key="reason">{{ reason }}</li></ul></div>
            <p v-if="item.caveat" class="caveat">{{ item.caveat }}</p>
            <div v-if="item.highlights.length" class="highlights"><strong>路线中的代表地点</strong><p>{{ item.highlights.map(p=>p.name).join(' · ') }}</p></div>
            <p class="data-note">{{ item.dataNotice }}</p>
            <router-link class="btn route-link" :to="{name:'route-intro',params:{lineId:item.lineId},query:{from:'recommend'}}">查看路线 <span aria-hidden="true">↗</span></router-link>
            <div class="card-feedback"><FavoriteButton :entity-key="`line:${item.lineId}`" label="收藏路线" /><button :aria-pressed="form.excludedIpIds.includes(item.ipId)" :disabled="busy" @click="exclude(item)">{{ form.excludedIpIds.includes(item.ipId)?'撤销不感兴趣':'暂不感兴趣' }}</button></div>
          </div>
        </article>
      </div>
      <div v-else class="empty-state"><span aria-hidden="true">✧</span><p>试试调整目的地或兴趣偏好，或告诉我们你期待收录的作品。</p><div><button class="btn-ghost" @click.stop="expanded=true;filterBar?.scrollIntoView({block:'start'})">调整条件</button><button class="btn" @click="wishOpen=true">去许愿</button></div></div>
      <p class="end-note">兴趣与结果只为发现路线。出发日期、每天时长和具体景点，在选定路线后安排。</p>
    </section>
    <div v-else-if="!busy" class="before-results"><span aria-hidden="true">✧</span><h2>下一段故事，从你的喜欢开始</h2><p>告诉我们你的兴趣，或直接开始探索。每次为你挑选最多三条已有路线。</p></div>
    <DialogSheet v-if="sourceInfoOpen && result" :title="`关于${sourceLabel}`" @close="sourceInfoOpen=false">
      <div class="source-explanation">
        <p v-if="result.source==='basic'">本次按你选择的内容标签和作品偏好匹配已有路线，自由描述尚未经过 AI 理解。</p>
        <p v-else-if="result.source==='ai'">本次由 AI 结合你的偏好，对已收录路线进行排序。路线与地点信息来自已有资料。</p>
        <p v-else>当前目的地与排除条件下没有可推荐的路线。可以调整筛选条件后再试。</p>
        <p v-if="result.source==='basic'">你仍然可以查看路线，登录后收藏喜欢的路线。收藏不会改变筛选条件或“我的兴趣”。</p>
        <p v-if="result.source==='basic'" class="hint">想再试一次智能推荐，可以按当前筛选条件重新推荐；若 AI 暂时不可用，仍会提供基础推荐。</p>
        <div class="source-actions"><button v-if="result.source==='basic'" type="button" class="btn" :disabled="busy" @click="generate">按当前条件重新推荐</button><button type="button" class="btn-ghost" @click="sourceInfoOpen=false">知道了</button></div>
      </div>
    </DialogSheet>
    <WishForm v-if="wishOpen" @close="wishOpen=false" />
  </main>
</template>
<style scoped>
.recommend-page{max-width:1120px;padding-top:22px}.back{font-size:13px;color:var(--ink-2)}.recommend-heading{text-align:center;padding:28px 0 34px}.eyebrow{font-size:10px;letter-spacing:.22em;color:#856b40}.recommend-heading h1{font-size:34px;letter-spacing:.06em;margin:8px 0 10px}.recommend-heading p{font-size:14px;color:var(--ink-2)}.filter-shell{position:sticky;top:8px;z-index:20;background:#fffdf9;border:1px solid #ded5c6;border-radius:18px;box-shadow:0 8px 24px #493d2910;scroll-margin-top:8px}.filter-bar{display:flex;align-items:center;gap:0;padding:0;min-height:76px;background:#fffdf9;border-radius:18px;cursor:pointer}.filter-summary{min-width:0;flex:1;display:grid;gap:2px}.filter-summary strong{font-size:14px}.filter-summary>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--ink-2)}.pending{font-size:10px;font-weight:400;background:#f1e5cf;color:#795b23;border-radius:5px;padding:2px 5px;margin-left:5px}.toggle-filter{flex:1;min-width:0;display:flex;align-items:center;gap:16px;align-self:stretch;text-align:left;padding:15px 22px;border-radius:18px;background:transparent;color:inherit}.toggle-label{white-space:nowrap;font-size:13px;color:#705628}.toggle-label>span{margin-left:5px}.toggle-filter:hover{background:#f5efe433}.filter-content{border-top:1px solid var(--line);padding:22px;max-height:65dvh;overflow-y:auto;overscroll-behavior:contain;border-radius:0 0 18px 18px;scrollbar-gutter:stable}.filter-fields{padding:0;border:0;min-width:0}.filter-fields:disabled{opacity:.6}.section-label{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}.section-label h2{font-size:19px}.section-label>span{font-size:12px;color:var(--ink-2)}.hint{font-size:12px;color:var(--ink-2);margin:8px 0 16px}.text-link{text-decoration:underline;text-underline-offset:4px;font-size:12px;color:#705628}.destination-row{display:flex;gap:18px;align-items:center;border-top:1px solid var(--line);padding-top:18px;margin-top:16px;margin-bottom:18px}.destination-row label,.text-label{font-size:14px;font-weight:600}small{font-size:11px;color:var(--ink-2);font-weight:400;margin-left:6px}select{padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;min-width:160px}.text-label{display:block;margin-bottom:8px}textarea{width:100%;resize:vertical;min-height:72px;max-height:180px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;font:inherit;font-size:13px;background:#fff}.text-help{display:flex;justify-content:space-between;gap:18px}.text-help>span:last-child{white-space:nowrap}.filter-actions{position:sticky;bottom:-22px;background:#fffdf9;border-top:1px solid var(--line);display:flex;gap:20px;align-items:center;padding:14px 0 12px;margin-top:14px;z-index:2}.generate{font-weight:600}.compact-generate{margin-right:22px;padding:8px 16px;font-size:12px;white-space:nowrap}.loading{padding:24px;text-align:center;color:#806333;font-size:14px}.spinner{display:inline-block;width:16px;height:16px;border:2px solid #e5d9c4;border-top-color:#806333;border-radius:50%;animation:spin 1s linear infinite;margin-right:8px;vertical-align:middle}@keyframes spin{to{transform:rotate(360deg)}}.results{padding-top:32px}.result-heading{display:flex;justify-content:space-between;align-items:center;gap:16px}.result-heading h2{font-size:25px;margin-top:5px}.source-badge{border:1px solid #cfc0a3;border-radius:999px;padding:5px 12px;font-size:11px;white-space:nowrap;color:#705628;background:#f4eddf}.result-notice{font-size:12px;color:var(--ink-2);margin:12px 0 22px}.changed-notice,.feedback{font-size:13px;background:#f3eddf;padding:12px 16px;border-radius:10px;margin:14px 0}.result-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.recommend-card{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:white;display:flex;flex-direction:column}.cover-wrap{position:relative}.card-number{position:absolute;left:14px;top:14px;display:grid;place-items:center;border-radius:50%;width:30px;height:30px;font-family:serif;background:#fffc;color:#59421e}.card-body{padding:20px;display:flex;flex-direction:column;flex:1}.card-meta{font-size:11px;letter-spacing:.04em;color:#806333}.card-body h3{font-size:24px;margin:5px 0 10px}.tag-row{display:flex;flex-wrap:wrap;gap:6px}.tag-row span{font-size:10px;background:#f5f1ea;padding:3px 8px;border-radius:4px;color:#73614b}.reason-box{background:#faf8f3;border-radius:10px;padding:13px;margin:18px 0 10px;font-size:12px}.reason-box strong,.highlights strong{font-size:11px;color:#705628}.reason-box ul{padding-left:14px;margin-top:7px;display:grid;gap:6px}.caveat{font-size:11px;color:#8d6c3f;margin-bottom:10px}.highlights p{font-size:12px;margin:6px 0 12px}.data-note{font-size:10px;color:var(--ink-2);margin-bottom:16px}.route-link{margin-top:auto;display:flex;justify-content:space-between;align-items:center;font-size:13px;border-radius:10px;padding:11px 16px}.card-feedback{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.card-feedback>button{font-size:11px;color:var(--ink-2);text-decoration:underline;text-underline-offset:4px;padding:3px 0}.card-feedback>button[aria-pressed=true]{color:#795b23}.end-note{text-align:center;font-size:12px;color:var(--ink-2);padding:30px 10px}.empty-state,.before-results{padding:45px 24px;text-align:center;color:var(--ink-2)}.empty-state>span,.before-results>span{font-size:36px;color:var(--brand)}.empty-state p,.before-results p{font-size:13px;margin:12px 0 20px}.empty-state>div{display:flex;justify-content:center;gap:12px}.before-results h2{font-size:22px;color:#76664d;font-weight:400}.error-box{padding:14px;background:#fbefeb;color:#9a4436;border-radius:10px;margin:14px 0;font-size:13px}.error-box button,.error-box a{margin-left:12px;text-decoration:underline}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #806333;outline-offset:3px}button:disabled{cursor:wait;opacity:.65}
.source-badge:hover{background:#eadfc9}.source-explanation p{font-size:14px;line-height:1.8;margin-bottom:16px}.source-explanation .hint{font-size:12px}.source-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.card-feedback{align-items:flex-start}.card-feedback :deep(.favorite-action){margin:0;min-width:0}.card-feedback :deep(.favorite-action button){font-size:12px;padding:6px 12px}.card-feedback :deep(.favorite-action p){font-size:11px;max-width:170px}.card-feedback>button{padding-top:8px}
.work-hint{font-size:12px;color:var(--ink-2);margin:8px 0}.preference-works{display:flex;flex-wrap:wrap;gap:8px;max-height:150px;overflow:auto;padding:3px}.preference-works button{font-size:13px;padding:7px 14px;border:1px solid var(--line);border-radius:999px;background:white}.preference-works button[aria-pressed=true]{background:#eee5d4;border-color:#9c7b42;color:#59421e}
@media(max-width:760px){.recommend-heading h1{font-size:27px}.recommend-heading{padding:22px 0}.result-grid{grid-template-columns:1fr}.recommend-card{max-width:560px;width:100%;margin:auto}.result-heading h2{font-size:21px}.filter-content{padding:16px;max-height:60dvh}.filter-bar{min-height:68px}.filter-summary strong{font-size:12px}.filter-summary>span{max-width:100%;font-size:11px}.toggle-filter{padding:12px;gap:8px}.toggle-label{font-size:11px}.compact-generate{margin-right:12px;padding:8px 10px;font-size:11px}.section-label h2{font-size:17px}.filter-actions{bottom:-16px;flex-wrap:wrap;gap:14px}.generate{flex:1;min-width:180px}.text-help{font-size:11px}.result-heading{align-items:flex-start}.card-body h3{font-size:25px}.filter-shell{top:5px;scroll-margin-top:5px}.before-results{padding:32px 12px}.destination-row{gap:10px}.source-badge{font-size:10px;padding:4px 8px}}
@media(prefers-reduced-motion:reduce){.spinner{animation:none}}
</style>
