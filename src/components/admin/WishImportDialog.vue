<script setup>
import {computed,onMounted,ref} from 'vue'
import {manage} from '../../api/manage.js'
import {workKey} from '../../utils/wish-import.mjs'
import DialogSheet from '../ui/DialogSheet.vue'
import './wish-workflow.css'
const props=defineProps({initialIds:{type:Array,default:()=>[]},mode:{type:String,default:'select'},targetId:{type:String,default:''}})
const emit=defineEmits(['close','select','imported'])
const rows=ref([]),ips=ref([]),links=ref([]),selected=ref([...props.initialIds]),q=ref(''),status=ref(''),step=ref(0),plans=ref([]),target=ref(props.targetId),busy=ref(false),error=ref(''),confirmed=ref(false),confirmedMismatch=ref(false)
const operationId=ref(crypto.randomUUID())
let lastRequest=''
const chosen=computed(()=>rows.value.filter(w=>selected.value.includes(w.id)))
const selectedWork=computed(()=>chosen.value[0]?workKey(chosen.value[0].ip):'')
const filtered=computed(()=>rows.value.filter(w=>(!status.value||w.status===status.value)&&`${w.ip} ${w.city} ${w.points.join(' ')}`.toLowerCase().includes(q.value.toLowerCase())))
const targetIp=computed(()=>ips.value.find(ip=>ip.ipId===target.value))
const targetMismatch=computed(()=>!!targetIp.value&&!!chosen.value[0]&&![targetIp.value.doc.ip.name,...(targetIp.value.doc.ip.aliases??[])].some(name=>workKey(name)===workKey(chosen.value[0].ip)))
const linkedCount=id=>links.value.filter(l=>l.wishId===id).length
onMounted(async()=>{busy.value=true;try{const [w,i,l]=await Promise.all([manage('/api/wishes/export'),manage('/api/manage/content/ips'),manage('/api/manage/content/wish-links')]);rows.value=w;ips.value=i.ips;links.value=l.links}catch(e){error.value=e.message}finally{busy.value=false}})
function next(){
 if(!chosen.value.length)return
 plans.value=chosen.value.flatMap(w=>plans.value.some(p=>p.wishId===w.id)?plans.value.filter(p=>p.wishId===w.id):[{key:crypto.randomUUID(),wishId:w.id,cityKey:w.uncertain?'':w.city,points:[...w.points]}])
 confirmed.value=false;step.value=1;error.value=''
}
function split(plan){plans.value.push({key:crypto.randomUUID(),wishId:plan.wishId,cityKey:'',points:[]});confirmed.value=false}
function source(id){return rows.value.find(w=>w.id===id)}
async function apply(){
 error.value=''
 if(plans.value.some(p=>!p.cityKey.trim()||/[\/／,，]/.test(p.cityKey))){error.value='请分别填写目标城市线；多个城市请使用“添加城市归属”。';return}
 if(!confirmed.value){error.value='请核对作品及城市归属后勾选确认';return}
 const clean=plans.value.map(({wishId,cityKey,points})=>({wishId,cityKey:cityKey.trim(),points}))
 if(props.mode==='select'){emit('select',{plans:clean,wishes:chosen.value});return}
 if(!targetIp.value){error.value='请选择要关联的 IP';return}
 if(targetMismatch.value&&!confirmedMismatch.value){error.value='目标作品与心愿名称不同，请确认是否确实为同一作品';return}
 busy.value=true
 try{
  const signature=JSON.stringify({target:target.value,plans:clean,confirmDifferentWork:confirmedMismatch.value});if(lastRequest&&signature!==lastRequest)operationId.value=crypto.randomUUID();lastRequest=signature
  const result=await manage('/api/manage/content/wish-imports',{method:'POST',body:{operationId:operationId.value,targetIpId:target.value,expectedUpdatedAt:targetIp.value.updatedAt??0,plans:clean,confirmDifferentWork:targetMismatch.value&&confirmedMismatch.value}})
  emit('imported',result)
 }catch(e){error.value=e.message}finally{busy.value=false}
}
</script>
<template>
 <DialogSheet :title="mode==='select'?'导入心愿单':'关联已有 IP'" :busy="busy" @close="emit('close')">
  <div class="wish-workflow">
   <p class="muted">{{ step===0?'① 选择同一作品的心愿 → ② 核对目的地与点位':'② 核对导入 · 原始心愿不会被改写' }}</p>
   <p v-if="error" class="error" role="alert">{{ error }}</p>
   <p v-if="busy" role="status">{{ rows.length?'正在保存，请稍候…':'正在加载心愿…' }}</p>
   <template v-if="step===0">
    <div class="toolbar"><input v-model="q" aria-label="搜索待导入心愿" placeholder="搜索作品、目的地或点位" /><select v-model="status" aria-label="导入状态筛选"><option value="">全部状态</option><option>待整理</option><option>筹备中</option><option>已收录</option></select></div>
    <div class="pick-list"><label v-for="w in filtered" :key="w.id" class="pick-card" :class="{selected:selected.includes(w.id)}">
     <input v-model="selected" type="checkbox" :value="w.id" :disabled="busy||w.status==='已拒绝'||(!!selectedWork&&selectedWork!==workKey(w.ip))" />
     <span><strong>《{{ w.ip }}》 · {{ w.city||'目的地待定' }}</strong><small>{{ w.status }} · {{ w.likes||0 }} 赞<span v-if="linkedCount(w.id)"> · 已关联 {{ linkedCount(w.id) }} 条线路</span></small><small>{{ w.points.join('、')||'尚未提供点位' }}</small></span>
    </label></div>
    <p v-if="!filtered.length&&!busy" class="muted">没有匹配的心愿，可清除筛选或返回手动填写。</p>
    <p class="muted">一次整理同一作品；已拒绝的心愿需先在详情中重新打开。</p>
    <div class="actions"><button class="btn-ghost" @click="emit('close')">返回</button><button class="btn" :disabled="!chosen.length||busy" @click="next">下一步：核对 {{ chosen.length }} 条心愿</button></div>
   </template>
   <template v-else>
    <label v-if="mode==='existing'" class="field">目标 IP<select v-model="target" :disabled="!!targetId" aria-label="目标 IP"><option value="">请选择作品</option><option v-for="ip in ips" :key="ip.ipId" :value="ip.ipId">{{ ip.doc.ip.name }} · {{ ip.ipId }}{{ ip.status==='online'||ip.status==='bundled'?'（保留线上版本，编辑修订草稿）':'' }}</option></select></label>
    <p v-if="targetIp" class="muted">已有城市线：{{ Object.keys(targetIp.doc.lines).join('、') }}。同名点位将关联现有点位，不覆盖其内容。</p>
    <label v-if="targetMismatch" class="check error"><input v-model="confirmedMismatch" type="checkbox" />所选 IP 作品名与心愿不同，我已核对这是同一作品或别名。</label>
    <article v-for="(plan,index) in plans" :key="plan.key" class="source-card">
     <strong>《{{ source(plan.wishId)?.ip }}》</strong><p class="muted">心愿原始目的地：{{ source(plan.wishId)?.city||'未确定' }}</p>
     <label class="field">目标城市线<input v-model="plan.cityKey" :list="targetIp?'wish-target-cities':undefined" placeholder="例如上海；国家/地区需人工确认" /></label>
     <div class="point-choices"><label v-for="point in source(plan.wishId)?.points" :key="point"><input v-model="plan.points" type="checkbox" :value="point" />{{ point }}</label></div>
     <p class="muted">勾选的名称生成待核实点位；不勾选时仅关联线索。场景、偏好与补充线索保存在来源心愿面板。</p>
     <div class="actions"><button class="link-button" @click="split(plan)">＋ 添加城市归属</button><button v-if="plans.length>1" class="link-button" @click="plans.splice(index,1)">移除此归属</button></div>
    </article>
    <datalist id="wish-target-cities"><option v-for="city in Object.keys(targetIp?.doc.lines??{})" :key="city" :value="city" /></datalist>
    <label class="check"><input v-model="confirmed" type="checkbox" />我已核对作品和城市归属，了解这些点位仍需核实。</label>
    <div class="actions"><button class="btn-ghost" :disabled="busy" @click="step=0">上一步</button><button class="btn" :disabled="busy||!confirmed" @click="apply">{{ mode==='select'?'填入新建表单':'保存草稿并关联心愿' }}</button></div>
   </template>
  </div>
 </DialogSheet>
</template>
