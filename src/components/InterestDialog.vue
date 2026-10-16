<script setup>
import { ref,onMounted } from 'vue'
import DialogSheet from './ui/DialogSheet.vue'
import InterestFields from './InterestFields.vue'
import { getCatalog } from '../recommendation/client.mjs'
import { profileState,saveInterests,dismissInterests,reloadInterests } from '../recommendation/profile.mjs'
import { emptyInterests } from '../recommendation/options.mjs'
const interests=ref(structuredClone(JSON.parse(JSON.stringify(profileState.interests))))
const works=ref([]),error=ref(''),busy=ref(false),catalogError=ref(false)
async function load(){catalogError.value=false;try{works.value=(await getCatalog()).works}catch{catalogError.value=true}}
onMounted(load)
async function save(skip=false){
  busy.value=true;error.value=''
  try{await saveInterests(skip?emptyInterests():interests.value,skip?'skipped':'saved')}
  catch(e){error.value=skip?'跳过状态暂未保存。你仍可关闭并继续浏览。':e.message}
  finally{busy.value=false}
}
async function reload(){await reloadInterests();if(!profileState.error)interests.value=JSON.parse(JSON.stringify(profileState.interests))}
function close(){if(profileState.onboarding)save(true);else dismissInterests()}
</script>
<template>
  <DialogSheet title="我的兴趣" :busy="busy" @close="close">
    <p class="intro">让下一次巡礼更懂你。选几项就好，也可以全部留空。</p>
    <p class="storage">{{ profileState.userId ? '兴趣将保存到你的账号，随时可以修改。' : '游客兴趣保存在当前浏览器，登录后可另行保存到账号。' }}</p>
    <p v-if="profileState.error" role="alert">此前的兴趣尚未载入，请先<button @click="reload">重试加载</button>。</p>
    <InterestFields v-model="interests" :works="works" />
    <p v-if="catalogError" class="storage">作品列表暂不可用，仍可保存标签。<button @click="load">重试加载</button></p>
    <p v-if="error" role="alert">{{ error }} <button v-if="profileState.onboarding" @click="dismissInterests">继续浏览</button></p>
    <div class="actions"><button class="btn" :disabled="busy || profileState.loading || !!profileState.error" @click="save()">{{ busy?'保存中…':'保存兴趣' }}</button><button class="btn-ghost" :disabled="busy" @click="profileState.onboarding ? save(true) : dismissInterests()">{{ profileState.onboarding?'暂时跳过':'取消' }}</button></div>
  </DialogSheet>
</template>
<style scoped>
.intro{margin-bottom:6px}.storage{font-size:12px;color:var(--ink-2);margin-bottom:20px}.storage button,[role=alert] button{text-decoration:underline;color:#795f32}.actions{display:flex;gap:12px;position:sticky;bottom:-24px;background:white;padding:16px 0;margin-top:12px}[role=alert]{color:#a34531;font-size:13px}
</style>
