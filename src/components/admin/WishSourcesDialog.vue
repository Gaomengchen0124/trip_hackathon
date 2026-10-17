<script setup>
import {onMounted,ref,computed} from 'vue'
import DialogSheet from '../ui/DialogSheet.vue'
import {manage} from '../../api/manage.js'
import './wish-workflow.css'
const props=defineProps({ipId:{type:String,required:true},returnTo:{type:String,default:''}})
function sourceRoute(id){const url=new URL(props.returnTo||'/manage/wishes',window.location.origin);url.searchParams.set('wish',id);return url.pathname+url.search}
const emit=defineEmits(['close','changed'])
const links=ref([]),pending=ref([]),selected=ref([]),error=ref(''),notice=ref(''),busy=ref(false),confirmed=ref(false),note=ref(''),unlinking=ref('')
const key=l=>`${l.wishId}|${l.cityKey}`
const available=computed(()=>links.value.filter(l=>l.canComplete&&!l.completedAt))
async function load(){try{const data=await manage(`/api/manage/content/wish-links?ipId=${encodeURIComponent(props.ipId)}`);links.value=data.links;pending.value=data.pending.filter(p=>p.ipId===props.ipId);selected.value=selected.value.filter(k=>available.value.some(l=>key(l)===k))}catch(e){error.value=e.message}}
onMounted(load)
async function complete(){busy.value=true;error.value='';try{const result=await manage('/api/manage/content/wish-completions',{method:'POST',body:{operationId:crypto.randomUUID(),ipId:props.ipId,keys:selected.value,note:note.value}});notice.value=result.syncPending?'收录记录已保存，心愿状态同步待重试。':'已记录收录结果；仍有未完成关联的心愿保持筹备中。';await load();emit('changed')}catch(e){error.value=e.message}finally{busy.value=false}}
async function retry(id){busy.value=true;try{const r=await manage(`/api/manage/content/wish-imports/${id}/retry`,{method:'POST',body:{}});notice.value=r.syncPending?'同步未完成，请检查心愿服务或在心愿详情核对最新状态。':'状态同步完成';await load()}catch(e){error.value=e.message}finally{busy.value=false}}
async function unlink(l){busy.value=true;try{await manage('/api/manage/content/wish-links',{method:'DELETE',body:{wishId:l.wishId,ipId:l.ipId,cityKey:l.cityKey}});unlinking.value='';await load();emit('changed');notice.value='已解除关联，原心愿和已创建点位均保留；可回心愿详情调整处理状态。'}catch(e){error.value=e.message}finally{busy.value=false}}
</script>
<template>
 <DialogSheet title="来源心愿与收录进度" side :busy="busy" @close="emit('close')"><div class="wish-workflow">
  <p class="muted">原始场景和线索供核对使用，不等于已验证引文。收录以对应城市线和点位实际发布为准。</p>
  <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="notice" class="notice" role="status">{{ notice }}</p>
  <div v-for="op in pending" :key="op.id" class="source-card">有 {{ op.count }} 条状态尚未同步 <button class="link-button" :disabled="busy" @click="retry(op.id)">重试同步</button></div>
  <p v-if="!links.length" class="empty">还没有关联心愿。</p>
  <article v-for="l in links" :key="key(l)" class="source-card">
   <strong>《{{ l.source.ip }}》 → {{ l.cityKey }}</strong><small>{{ l.completedAt?(l.online?'已确认收录':'历史已确认收录 · 关联线已下架，需复核'):l.canComplete?'已上线，待确认满足心愿':'筹备中，关联内容尚未全部上线' }}</small>
   <p><b>原始目的地：</b>{{ l.source.city||'未确定' }}</p><p><b>想去的点位：</b>{{ l.source.points.join('、')||'未提供' }}</p><p><b>想重温的一幕：</b>{{ l.source.scene||'未提供' }}</p><p><b>巡礼方式：</b>{{ l.source.styles.join('、')||'未提供' }}</p><p><b>补充线索：</b>{{ l.source.clues||'未提供' }}</p>
   <label v-if="l.canComplete&&!l.completedAt" class="check"><input v-model="selected" type="checkbox" :value="key(l)" />将这条城市线的关联记为已满足</label>
   <div class="actions"><router-link :to="sourceRoute(l.wishId)" @click="emit('close')">查看原心愿</router-link><button class="link-button" @click="unlinking=key(l)">解除关联</button></div>
   <div v-if="unlinking===key(l)" class="notice">只解除来源关系，不删除点位；原心愿状态保留。<div class="actions"><button class="btn-ghost" @click="unlinking=''">保留关联</button><button class="btn" :disabled="busy" @click="unlink(l)">确认解除关联</button></div></div>
  </article>
  <template v-if="available.length"><label class="field">收录说明<textarea v-model="note" maxlength="1000" placeholder="说明已满足哪些需求、仍有哪些线索需要后续处理" /></label><label class="check"><input v-model="confirmed" type="checkbox" />我已核对所选线上内容满足对应需求；这不会发送邮件。</label><div class="actions"><button class="btn" :disabled="busy||!selected.length||!confirmed" @click="complete">确认所选收录结果（{{ selected.length }}）</button></div></template>
 </div></DialogSheet>
</template>
