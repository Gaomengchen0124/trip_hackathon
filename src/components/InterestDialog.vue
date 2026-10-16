<script setup>
import { computed,ref,onMounted,nextTick } from 'vue'
import DialogSheet from './ui/DialogSheet.vue'
import InterestFields from './InterestFields.vue'
import { getCatalog } from '../recommendation/client.mjs'
import { profileState,saveInterests,dismissInterests,reloadInterests } from '../recommendation/profile.mjs'
import { emptyInterests } from '../recommendation/options.mjs'
const interests=ref(JSON.parse(JSON.stringify(profileState.interests)))
const works=ref([]),error=ref(''),busy=ref(false),catalogError=ref(false),step=ref(0),questionHeading=ref(null)
const questions=[
  {key:'kinds',title:'平时喜欢看些什么？',hint:'从熟悉的内容开始，可多选。',symbol:'01'},
  {key:'themes',title:'哪些故事题材会吸引你？',hint:'选出想走进的故事，也可以先不选。',symbol:'02'},
  {key:'moods',title:'喜欢故事带来怎样的感受？',hint:'找到与你此刻心情相近的故事氛围。',symbol:'03'},
  {key:'ipIds',title:'有没有特别喜欢的作品？',hint:'写下任何喜欢的作品，也可以说说喜欢它的原因。',symbol:'04'},
]
const current=computed(()=>questions[step.value]),last=computed(()=>step.value===questions.length-1)
async function load(){catalogError.value=false;try{works.value=(await getCatalog()).works}catch{catalogError.value=true}}
onMounted(load)
async function save(skipAll=false){
  busy.value=true;error.value=''
  const value=skipAll?emptyInterests():interests.value
  const status=Object.values(value).some(values=>values.length)?'saved':'skipped'
  try{await saveInterests(value,status)}
  catch(e){error.value=skipAll?'跳过状态暂未保存。你仍可关闭并继续浏览。':e.message}
  finally{busy.value=false}
}
async function moveTo(index){step.value=index;await nextTick();questionHeading.value?.focus({preventScroll:true});questionHeading.value?.scrollIntoView({block:'nearest'})}
async function next(skip=false){
  if(busy.value)return
  if(skip)interests.value={...interests.value,[current.value.key]:[],...(current.value.key==='ipIds'?{favoriteWorks:''}:{})}
  if(last.value)await save()
  else await moveTo(step.value+1)
}
async function reload(){await reloadInterests();if(!profileState.error)interests.value=JSON.parse(JSON.stringify(profileState.interests))}
function close(){if(profileState.onboarding && !profileState.error)save(true);else dismissInterests()}
</script>
<template>
  <DialogSheet title="我的兴趣" :busy="busy" @close="close">
    <p class="intro">让下一次巡礼更懂你。每题都可跳过，也可以稍后再选。</p>
    <p class="storage">{{ profileState.userId ? '选择将保存到你的账号，之后可在个人中心修改。' : '游客兴趣保存在当前浏览器，登录后可另行保存到账号。' }}</p>
    <p v-if="profileState.error" role="alert">{{ profileState.error }} <button :disabled="profileState.loading" @click="reload">{{ profileState.loading?'加载中…':'重试加载' }}</button></p>
    <template v-if="profileState.onboarding">
      <div class="question-progress" role="status" aria-live="polite"><span>第 {{ step+1 }} / {{ questions.length }} 题</span><span>可多选 · 可跳过</span></div>
      <div class="progress-track" aria-hidden="true"><span v-for="(_,index) in questions" :key="index" :class="{done:index<=step}"></span></div>
      <fieldset class="question-card" :disabled="busy || profileState.loading || !!profileState.error" :aria-labelledby="`interest-question-${current.key}`">
        <span class="question-number" aria-hidden="true">{{ current.symbol }}</span>
        <h3 :id="`interest-question-${current.key}`" ref="questionHeading" tabindex="-1">{{ current.title }}</h3>
        <p class="question-hint">{{ current.hint }}</p>
        <InterestFields :key="current.key" v-model="interests" :groups="current.key==='ipIds'?[]:[current.key]" :show-works="current.key==='ipIds'" :works="works" />
        <p v-if="current.key==='ipIds' && catalogError" class="storage">作品列表暂不可用，仍可自由填写，也可跳过本题或<button type="button" @click="load">重试加载</button>。</p>
      </fieldset>
    </template>
    <InterestFields v-else v-model="interests" :works="works" />
    <p v-if="!profileState.onboarding && catalogError" class="storage">作品列表暂不可用，仍可保存标签。<button @click="load">重试加载</button></p>
    <p v-if="error" role="alert">{{ error }} <button v-if="profileState.onboarding" @click="dismissInterests">继续浏览</button></p>
    <div v-if="profileState.onboarding" class="wizard-actions">
      <div class="step-actions"><button v-if="step>0" type="button" class="btn-ghost" :disabled="busy" @click="moveTo(step-1)">上一题</button><button type="button" class="btn-ghost" :disabled="busy || profileState.loading || !!profileState.error" @click="next(true)">跳过本题</button><button type="button" class="btn" :disabled="busy || profileState.loading || !!profileState.error" @click="next()">{{ busy?'保存中…':last?'完成并保存':'下一题' }}</button></div>
      <button type="button" class="skip-all" :disabled="busy" @click="profileState.error?dismissInterests():save(true)">暂时跳过</button>
    </div>
    <div v-else class="actions"><button class="btn" :disabled="busy || profileState.loading || !!profileState.error" @click="save()">{{ busy?'保存中…':'保存兴趣' }}</button><button class="btn-ghost" :disabled="busy" @click="dismissInterests()">取消</button></div>
  </DialogSheet>
</template>
<style scoped>
.intro{margin-bottom:6px}.storage{font-size:12px;color:var(--ink-2);margin-bottom:20px}.storage button,[role=alert] button{text-decoration:underline;color:#795f32}.actions{display:flex;gap:12px;position:sticky;bottom:-24px;background:white;padding:16px 0;margin-top:12px}[role=alert]{color:#a34531;font-size:13px}
.question-progress{display:flex;justify-content:space-between;font-size:12px;color:#806333;margin:18px 0 9px}.progress-track{display:flex;gap:7px;margin-bottom:18px}.progress-track span{height:4px;flex:1;border-radius:4px;background:#eee9df}.progress-track .done{background:#a88d58}.question-card{border:1px solid #e4d9c5;background:#faf7f0;border-radius:18px;padding:22px 20px;min-width:0}.question-number{font-family:serif;color:#a88d58;font-size:27px}.question-card h3{font-family:serif;font-size:24px;margin:8px 0;line-height:1.45}.question-hint{font-size:13px;color:var(--ink-2);margin-bottom:22px}.question-card :deep(fieldset){margin-bottom:0}.question-card h3:focus-visible{outline:2px solid var(--brand);outline-offset:4px}.wizard-actions{padding-top:20px;text-align:center}.step-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.skip-all{font-size:12px;color:var(--ink-2);text-decoration:underline;text-underline-offset:4px;margin-top:18px;padding:5px 10px}.skip-all:focus-visible{outline:2px solid var(--brand);outline-offset:3px}button:disabled{opacity:.6;cursor:wait}@media(max-width:600px){.question-card{padding:18px 14px}.question-card h3{font-size:21px}.step-actions{gap:8px}.step-actions button{flex:1;padding:10px;white-space:nowrap}}
</style>
