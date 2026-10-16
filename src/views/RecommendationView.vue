<script setup>
import { computed,ref,watch,onMounted,onBeforeUnmount,nextTick } from 'vue'
import InterestFields from '../components/InterestFields.vue'
import PhotoFrame from '../components/ui/PhotoFrame.vue'
import WishForm from '../components/WishForm.vue'
import { dictionaries,emptyInterests,validateInterests } from '../recommendation/options.mjs'
import { getCatalog,request } from '../recommendation/client.mjs'
import { profileState,initInterests,openInterests,reloadInterests } from '../recommendation/profile.mjs'
const fresh=()=>({mode:'discover',ipId:'',city:'',text:'',interests:emptyInterests(),excludedIpIds:[]})
const form=ref(fresh()),expanded=ref(true),catalog=ref(null),catalogError=ref(''),busy=ref(false),error=ref(''),result=ref(null),submitted=ref(''),feedback=ref(''),search=ref(''),wishOpen=ref(false),storageNotice=ref(''),filterBar=ref(null)
let controller,requestVersion=0,cacheKey='',activeIdentity=null
const clone=x=>JSON.parse(JSON.stringify(x))
const submittedMode=computed(()=>{try{return JSON.parse(submitted.value).mode}catch{return ''}})
const pending=computed(()=>!!result.value && JSON.stringify(form.value)!==submitted.value)
const selectedWork=computed(()=>catalog.value?.works.find(w=>w.ipId===form.value.ipId))
const works=computed(()=>(catalog.value?.works || []).filter(w=>[w.name,...w.aliases].some(x=>x.toLowerCase().includes(search.value.trim().toLowerCase()))))
const summary=computed(()=>{
  const tags=['kinds','themes','moods'].flatMap(key=>form.value.interests[key].map(id=>dictionaries[key].find(t=>t.id===id)?.label).filter(Boolean))
  return [form.value.mode==='by_work'?(selectedWork.value?.name || '待选作品'):'旅行灵感',form.value.city || '目的地不限',...(form.value.mode==='discover'?tags:[]),...(form.value.interests.ipIds.length&&form.value.mode==='discover'?[`${form.value.interests.ipIds.length} 部喜欢的作品`]:[]),...(form.value.text?['附有兴趣描述']:[]),...(form.value.excludedIpIds.length?[`${form.value.excludedIpIds.length} 部暂不推荐`]:[])].join(' · ')
})
const kindLabel=id=>dictionaries.kinds.find(x=>x.id===id)?.label || '作品'
const tagLabel=(group,id)=>dictionaries[group].find(x=>x.id===id)?.label || id
function persist(){
  if(!cacheKey)return
  try{sessionStorage.setItem(cacheKey,JSON.stringify({version:1,expires:Date.now()+2*3600000,form:form.value,result:result.value,submitted:submitted.value,expanded:expanded.value}));storageNotice.value=''}
  catch{storageNotice.value='浏览器暂时无法保存本次推荐，刷新后可能需要重新选择。'}
}
function restore(id,previous){
  controller?.abort();requestVersion++;busy.value=false;error.value='';feedback.value=''
  cacheKey='pilgrimage.recommendation.v1:'+id
  if(previous==='guest' && id!=='guest'){persist();return}
  form.value=fresh();result.value=null;submitted.value='';expanded.value=true
  form.value.interests=clone(profileState.interests)
  try{
    const saved=JSON.parse(sessionStorage.getItem(cacheKey) || 'null')
    if(saved?.version!==1 || saved.expires<Date.now())return
    const f=saved.form
    if(!['discover','by_work'].includes(f.mode) || typeof f.ipId!=='string' || typeof f.city!=='string' || typeof f.text!=='string' || f.text.length>500 || !Array.isArray(f.excludedIpIds))return
    form.value={...fresh(),...f,interests:validateInterests(f.interests)}
    if(saved.result && Array.isArray(saved.result.items) && saved.result.items.every(x=>typeof x.lineId==='string' && x.ip && Array.isArray(x.reasons) && Array.isArray(x.highlights) && Array.isArray(x.themes)))result.value=saved.result
    submitted.value=typeof saved.submitted==='string'?saved.submitted:'';expanded.value=!result.value || saved.expanded!==false
  }catch{storageNotice.value='之前的推荐记录无法恢复，可以重新选择。'}
}
watch(()=>profileState.loading?null:(profileState.userId || 'guest'),id=>{if(id && id!==activeIdentity){const previous=activeIdentity;activeIdentity=id;restore(id,previous)}}, {immediate:true})
watch([form,result,submitted,expanded],persist,{deep:true})
async function loadCatalog(){catalogError.value='';try{catalog.value=await getCatalog()}catch(e){catalogError.value=e.message}}
onMounted(()=>{initInterests();loadCatalog()})
onBeforeUnmount(()=>{requestVersion++;controller?.abort()})
function useProfile(){form.value.interests=clone(profileState.interests);feedback.value='已带入保存的兴趣，点击推荐后生效。'}
function reset(){form.value={...fresh(),mode:form.value.mode};search.value='';feedback.value='';error.value=''}
function switchMode(mode){form.value.mode=mode;form.value.excludedIpIds=[];feedback.value='';error.value=''}
async function generate(){
  if(busy.value)return
  if(form.value.mode==='by_work' && !selectedWork.value){expanded.value=true;error.value='请先选择一部作品。';return}
  error.value='';feedback.value='';busy.value=true
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
function like(item){
  form.value.mode='discover'
  for(const key of ['themes','moods'])form.value.interests[key]=[...new Set([...form.value.interests[key],...item[key]])]
  feedback.value='已加入这部作品的题材与氛围，点击重新推荐寻找相近故事。'
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
    <header class="recommend-heading"><span class="eyebrow">STORIES LEAD THE WAY</span><h1>让故事，带你去下一站</h1><p>从心爱的作品出发，或发现一段意想不到的巡礼。</p></header>
    <p v-if="catalogError" class="error-box" role="alert">{{ catalogError }} <button @click="loadCatalog">重试加载</button><router-link to="/">返回首页浏览路线</router-link></p>
    <p v-else-if="!catalog" role="status" class="loading">正在整理作品与目的地…</p>
    <section v-if="catalog" ref="filterBar" class="filter-shell" aria-label="推荐筛选">
      <div class="filter-bar">
        <div class="filter-summary"><strong>你的巡礼线索 <span v-if="pending" class="pending">待更新</span></strong><span :title="summary">{{ summary }}</span></div>
        <button class="toggle-filter" :aria-expanded="expanded" aria-controls="recommend-filters" @click="expanded=!expanded">{{ expanded?'收起筛选':'修改条件' }} <span aria-hidden="true">{{ expanded?'−':'＋' }}</span></button>
        <button v-if="!expanded" class="btn compact-generate" :disabled="busy" @click="generate">{{ busy?'寻找中…':'重新推荐' }}</button>
      </div>
      <form v-show="expanded" id="recommend-filters" class="filter-content" @submit.prevent="generate">
        <fieldset :disabled="busy" class="filter-fields">
          <div class="mode-grid" role="group" aria-label="推荐方式">
            <button type="button" class="mode-card" :aria-pressed="form.mode==='by_work'" @click="switchMode('by_work')"><span class="mode-icon" aria-hidden="true">01 / 故事出发</span><strong>我有喜欢的作品</strong><span>选定一本书或一部剧，寻找它的巡礼路线。</span></button>
            <button type="button" class="mode-card" :aria-pressed="form.mode==='discover'" @click="switchMode('discover')"><span class="mode-icon" aria-hidden="true">02 / 灵感漫游</span><strong>帮我找旅行灵感</strong><span>从题材与故事氛围出发，邂逅新的作品和城市。</span></button>
          </div>
          <template v-if="form.mode==='by_work'">
            <div class="section-label"><h2>想走进哪一个故事？</h2><span>选择一部作品</span></div>
            <input v-model="search" class="work-search" type="search" maxlength="100" aria-label="搜索作品或人物" placeholder="搜作品或人物，如：龙族、李诗情">
            <div class="work-grid" role="group" aria-label="选择作品"><button v-for="work in works" :key="work.ipId" type="button" :aria-pressed="form.ipId===work.ipId" @click="form.ipId=work.ipId"><strong>{{ work.name }}</strong><span>{{ kindLabel(work.kind) }}</span></button></div>
            <p v-if="selectedWork" class="hint">已选《{{ selectedWork.name }}》：只推荐这部作品的路线。</p>
            <p v-if="!works.length" class="hint">没有找到这部作品。<button type="button" class="text-link" @click="wishOpen=true">许愿收录 →</button></p>
          </template>
          <template v-else>
            <div class="section-label"><h2>什么样的故事会打动你？</h2><button type="button" class="text-link" :disabled="profileState.loading" @click="useProfile">使用我的兴趣</button></div>
            <p class="hint">都可以不选，先看看有哪些灵感。标签用于排序，不限制你探索其他故事。</p>
            <p v-if="profileState.error" class="hint" role="status">保存的兴趣暂未载入，本次仍可自行选择。<button type="button" class="text-link" @click="reloadInterests">重新加载兴趣</button></p>
            <InterestFields v-model="form.interests" :works="catalog.works" />
          </template>
          <div class="destination-row"><label for="recommend-city">想去哪里？<small>可选</small></label><select id="recommend-city" v-model="form.city"><option value="">目的地不限</option><option v-for="city in catalog.cities" :key="city">{{ city }}</option></select></div>
          <label for="recommend-text" class="text-label">再说一点你的兴趣 <small>可选</small></label>
          <textarea id="recommend-text" v-model="form.text" rows="2" maxlength="500" placeholder="例如：喜欢悬疑故事里的反转，也想发现不熟悉的作品。"></textarea>
          <div class="hint text-help"><span>明确限定作品和目的地，请使用上方选项。日期、活动与景点在规划页选择。</span><span>{{ form.text.length }}/500</span></div>
          <p v-if="form.excludedIpIds.length" class="hint">本次暂不推荐 {{ form.excludedIpIds.length }} 部作品。<button type="button" class="text-link" @click="form.excludedIpIds=[]">撤销全部反馈</button></p>
          <div class="filter-actions"><button class="btn generate" type="submit">{{ busy?'正在寻找你的下一站…':result?'重新推荐':form.mode==='by_work'?'寻找这部作品的路线':'为我寻找灵感' }}</button><button type="button" class="text-link" @click="reset">清空条件</button><button type="button" class="text-link edit-profile" @click="openInterests()">编辑长期兴趣</button></div>
        </fieldset>
      </form>
    </section>
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>
    <p v-if="feedback" role="status" class="feedback">{{ feedback }}</p>
    <p v-if="storageNotice" class="hint">{{ storageNotice }}</p>
    <div v-if="busy" class="loading" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span>正在从已有路线里寻找适合你的故事…</div>
    <section v-if="result" class="results" :aria-busy="busy" aria-label="推荐结果">
      <div class="result-heading"><div><span class="eyebrow">YOUR NEXT CHAPTER</span><h2>{{ result.items.length?'这些故事，值得你亲自走一趟':'还没有找到合适的下一站' }}</h2></div><span class="source-badge">{{ result.source==='ai'?'AI 智能推荐':result.source==='basic'?'基础推荐':'暂无匹配' }}</span></div>
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
            <router-link class="btn route-link" :to="`/line/${item.lineId}`">查看路线 <span aria-hidden="true">↗</span></router-link>
            <div v-if="submittedMode==='discover'" class="card-feedback"><button :disabled="busy" @click="like(item)">更想看这类</button><button :aria-pressed="form.excludedIpIds.includes(item.ipId)" :disabled="busy" @click="exclude(item)">{{ form.excludedIpIds.includes(item.ipId)?'撤销不感兴趣':'暂不感兴趣' }}</button></div>
          </div>
        </article>
      </div>
      <div v-else class="empty-state"><span aria-hidden="true">✧</span><p>试试调整目的地、切换推荐方式，或告诉我们你期待收录的作品。</p><div><button class="btn-ghost" @click="expanded=true;filterBar?.scrollIntoView({block:'start'})">调整条件</button><button class="btn" @click="wishOpen=true">去许愿</button></div></div>
      <p class="end-note">兴趣与结果只为发现路线。出发日期、每天时长和具体景点，在选定路线后安排。</p>
    </section>
    <div v-else-if="!busy" class="before-results"><span aria-hidden="true">✧</span><h2>下一段故事，从你的喜欢开始</h2><p>选择一种起点，我们会从已有路线中为你挑选最多三条。</p></div>
    <WishForm v-if="wishOpen" :initial-ip="search || selectedWork?.name || ''" @close="wishOpen=false" />
  </main>
</template>
<style scoped>
.recommend-page{max-width:1120px;padding-top:22px}.back{font-size:13px;color:var(--ink-2)}.recommend-heading{text-align:center;padding:28px 0 34px}.eyebrow{font-size:10px;letter-spacing:.22em;color:#856b40}.recommend-heading h1{font-size:34px;letter-spacing:.06em;margin:8px 0 10px}.recommend-heading p{font-size:14px;color:var(--ink-2)}.filter-shell{position:sticky;top:8px;z-index:20;background:#fffdf9;border:1px solid #ded5c6;border-radius:18px;box-shadow:0 8px 24px #493d2910;scroll-margin-top:8px}.filter-bar{display:flex;align-items:center;gap:14px;padding:15px 22px;min-height:76px;background:#fffdf9;border-radius:18px}.filter-summary{min-width:0;flex:1;display:grid;gap:2px}.filter-summary strong{font-size:14px}.filter-summary>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--ink-2)}.pending{font-size:10px;font-weight:400;background:#f1e5cf;color:#795b23;border-radius:5px;padding:2px 5px;margin-left:5px}.toggle-filter{white-space:nowrap;font-size:13px;color:#705628;padding:8px}.toggle-filter span{margin-left:5px}.filter-content{border-top:1px solid var(--line);padding:22px;max-height:65dvh;overflow-y:auto;overscroll-behavior:contain;border-radius:0 0 18px 18px;scrollbar-gutter:stable}.filter-fields{padding:0;border:0;min-width:0}.filter-fields:disabled{opacity:.6}.mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:26px}.mode-card{display:flex;flex-direction:column;text-align:left;gap:6px;padding:18px;border:1px solid var(--line);border-radius:12px;background:white}.mode-card[aria-pressed=true]{border-color:#9f814b;background:#f4eddf;box-shadow:inset 0 0 0 1px #9f814b}.mode-card strong{font-family:serif;font-size:19px}.mode-card>span:last-child{font-size:12px;color:var(--ink-2)}.mode-icon{font-size:10px;letter-spacing:.1em;color:#806333}.section-label{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}.section-label h2{font-size:19px}.section-label>span{font-size:12px;color:var(--ink-2)}.hint{font-size:12px;color:var(--ink-2);margin:8px 0 16px}.text-link{text-decoration:underline;text-underline-offset:4px;font-size:12px;color:#705628}.work-search{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:10px;margin-bottom:12px}.work-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-height:230px;overflow:auto;padding:3px}.work-grid button{padding:10px 12px;border:1px solid var(--line);border-radius:10px;display:grid;text-align:left;background:white;gap:3px}.work-grid button[aria-pressed=true]{border-color:#9f814b;background:#f4eddf}.work-grid strong{font-size:14px}.work-grid span{font-size:11px;color:var(--ink-2)}.destination-row{display:flex;gap:18px;align-items:center;border-top:1px solid var(--line);padding-top:18px;margin-top:16px;margin-bottom:18px}.destination-row label,.text-label{font-size:14px;font-weight:600}small{font-size:11px;color:var(--ink-2);font-weight:400;margin-left:6px}select{padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;min-width:160px}.text-label{display:block;margin-bottom:8px}textarea{width:100%;resize:vertical;min-height:72px;max-height:180px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;font:inherit;font-size:13px;background:#fff}.text-help{display:flex;justify-content:space-between;gap:18px}.text-help>span:last-child{white-space:nowrap}.filter-actions{position:sticky;bottom:-22px;background:#fffdf9;border-top:1px solid var(--line);display:flex;gap:20px;align-items:center;padding:14px 0 12px;margin-top:14px;z-index:2}.generate{font-weight:600}.edit-profile{margin-left:auto}.compact-generate{padding:8px 16px;font-size:12px;white-space:nowrap}.loading{padding:24px;text-align:center;color:#806333;font-size:14px}.spinner{display:inline-block;width:16px;height:16px;border:2px solid #e5d9c4;border-top-color:#806333;border-radius:50%;animation:spin 1s linear infinite;margin-right:8px;vertical-align:middle}@keyframes spin{to{transform:rotate(360deg)}}.results{padding-top:32px}.result-heading{display:flex;justify-content:space-between;align-items:center;gap:16px}.result-heading h2{font-size:25px;margin-top:5px}.source-badge{border:1px solid #cfc0a3;border-radius:999px;padding:5px 12px;font-size:11px;white-space:nowrap;color:#705628;background:#f4eddf}.result-notice{font-size:12px;color:var(--ink-2);margin:12px 0 22px}.changed-notice,.feedback{font-size:13px;background:#f3eddf;padding:12px 16px;border-radius:10px;margin:14px 0}.result-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.recommend-card{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:white;display:flex;flex-direction:column}.cover-wrap{position:relative}.card-number{position:absolute;left:14px;top:14px;display:grid;place-items:center;border-radius:50%;width:30px;height:30px;font-family:serif;background:#fffc;color:#59421e}.card-body{padding:20px;display:flex;flex-direction:column;flex:1}.card-meta{font-size:11px;letter-spacing:.04em;color:#806333}.card-body h3{font-size:24px;margin:5px 0 10px}.tag-row{display:flex;flex-wrap:wrap;gap:6px}.tag-row span{font-size:10px;background:#f5f1ea;padding:3px 8px;border-radius:4px;color:#73614b}.reason-box{background:#faf8f3;border-radius:10px;padding:13px;margin:18px 0 10px;font-size:12px}.reason-box strong,.highlights strong{font-size:11px;color:#705628}.reason-box ul{padding-left:14px;margin-top:7px;display:grid;gap:6px}.caveat{font-size:11px;color:#8d6c3f;margin-bottom:10px}.highlights p{font-size:12px;margin:6px 0 12px}.data-note{font-size:10px;color:var(--ink-2);margin-bottom:16px}.route-link{margin-top:auto;display:flex;justify-content:space-between;align-items:center;font-size:13px;border-radius:10px;padding:11px 16px}.card-feedback{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.card-feedback button{font-size:11px;color:var(--ink-2);text-decoration:underline;text-underline-offset:4px;padding:3px 0}.card-feedback button[aria-pressed=true]{color:#795b23}.end-note{text-align:center;font-size:12px;color:var(--ink-2);padding:30px 10px}.empty-state,.before-results{padding:45px 24px;text-align:center;color:var(--ink-2)}.empty-state>span,.before-results>span{font-size:36px;color:var(--brand)}.empty-state p,.before-results p{font-size:13px;margin:12px 0 20px}.empty-state>div{display:flex;justify-content:center;gap:12px}.before-results h2{font-size:22px;color:#76664d;font-weight:400}.error-box{padding:14px;background:#fbefeb;color:#9a4436;border-radius:10px;margin:14px 0;font-size:13px}.error-box button,.error-box a{margin-left:12px;text-decoration:underline}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #806333;outline-offset:3px}button:disabled{cursor:wait;opacity:.65}
@media(max-width:760px){.recommend-heading h1{font-size:27px}.recommend-heading{padding:22px 0}.result-grid{grid-template-columns:1fr}.recommend-card{max-width:560px;width:100%;margin:auto}.result-heading h2{font-size:21px}.filter-content{padding:16px;max-height:60dvh}.filter-bar{padding:12px;gap:6px;min-height:68px}.filter-summary strong{font-size:12px}.filter-summary>span{max-width:100%;font-size:11px}.toggle-filter{font-size:12px;padding:6px}.compact-generate{padding:8px 10px;font-size:11px}.mode-grid{gap:8px}.mode-card{padding:12px}.mode-card strong{font-size:16px}.mode-card>span:last-child{font-size:11px}.work-grid{grid-template-columns:repeat(2,1fr)}.section-label h2{font-size:17px}.filter-actions{bottom:-16px;flex-wrap:wrap;gap:14px}.edit-profile{margin-left:0}.generate{flex:1;min-width:180px}.text-help{font-size:11px}.result-heading{align-items:flex-start}.card-body h3{font-size:25px}.filter-shell{top:5px;scroll-margin-top:5px}.before-results{padding:32px 12px}.destination-row{gap:10px}.source-badge{font-size:10px;padding:4px 8px}}
@media(prefers-reduced-motion:reduce){.spinner{animation:none}}
</style>
