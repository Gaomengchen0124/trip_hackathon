<script setup>
import {ref,computed,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {usePlanStore} from '../stores/plan'
import MapContainer from '../components/MapContainer.vue'
import PoiCheckList from '../components/PoiCheckList.vue'
import PlanningConversation from '../components/PlanningConversation.vue'
const route=useRoute(),router=useRouter(),store=usePlanStore()
const loading=ref(false),busy=ref(false),error=ref('')
watch(()=>route.params.lineId,async id=>{if(!id)return;loading.value=true;error.value='';try{if(store.lineId!==id||!store.line)await store.loadLine(id);const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(!store.timeRange.startDate)store.timeRange.startDate=today;if(!store.timeRange.endDate)store.timeRange.endDate=store.timeRange.startDate}catch{error.value='路线加载失败，请返回首页后重试。'}finally{loading.value=false}},{immediate:true})
const sortedIp=computed(()=>[...store.ipPois].sort((a,b)=>({S:0,A:1,B:2}[a.tier]??9)-({S:0,A:1,B:2}[b.tier]??9)))
const context=computed(()=>({lineId:store.lineId,selectedPoiIds:[...store.checkedIds].sort(),dateRange:{startDate:store.timeRange.startDate,endDate:store.timeRange.endDate},timeZone:store.line?.timeZone||(store.lineId?.endsWith('-london')?'Europe/London':store.lineId?.endsWith('-japan')?'Asia/Tokyo':'Asia/Shanghai')}))
const datesValid=computed(()=>context.value.dateRange.startDate&&context.value.dateRange.endDate>=context.value.dateRange.startDate)
function generated(it){store.checkedIds=[...it.context.selectedPoiIds];router.push(`/itinerary/${it.id}`)}
</script>
<template>
 <div class="page planning-customize">
  <header class="bar"><button type="button" :disabled="busy" @click="router.push('/')">← 首页</button><h1>{{store.line?.title||'行程定制'}}</h1></header>
  <p v-if="error" class="error" role="alert">{{error}}</p>
  <template v-if="!loading&&store.line">
   <div class="map-wrap"><MapContainer :pois="store.pois" :selected-ids="store.checkedIds" :interactive="!busy" :city="store.line.city" :ip-name="store.ip?.name" /></div>
   <fieldset class="date-range" :disabled="busy"><legend>出行日期</legend><label>开始日期<input v-model="store.timeRange.startDate" type="date" /></label><label>结束日期<input v-model="store.timeRange.endDate" type="date" :min="store.timeRange.startDate" /></label><span>已选 {{store.checkedIds.length}} 个景点</span></fieldset>
   <div class="cols"><PoiCheckList title="IP 打卡点" :pois="sortedIp" :checked-ids="store.checkedIds" :disabled="busy" @toggle="store.togglePoi"/><PoiCheckList title="城市著名景点" :pois="store.classicPois" :checked-ids="store.checkedIds" :disabled="busy" @toggle="store.togglePoi"/></div>
   <PlanningConversation v-if="datesValid" :context="context" :pois="store.pois" @busy="busy=$event" @selection="store.checkedIds=$event" @generated="generated"/>
   <p v-else role="alert">请选择有效日期，结束日期不能早于开始日期。</p>
  </template><p v-else-if="loading" role="status">正在读取路线…</p>
 </div>
</template>
<style scoped>
.bar{display:flex;align-items:center;gap:18px;margin-bottom:18px}.bar h1{font-size:22px}.map-wrap{height:320px;margin-bottom:18px}.date-range{display:flex;flex-wrap:wrap;align-items:center;gap:18px;border:0;background:var(--paper,#fff);border-radius:18px;padding:18px}.date-range label{display:flex;align-items:center;gap:10px}.date-range input{padding:8px 12px;border:1px solid var(--line);border-radius:10px;font:inherit}.date-range span{font-size:13px;color:var(--ink-2)}.cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-top:20px}.error{padding:14px;background:#fbe8e5;border-radius:12px}@media(max-width:720px){.cols{grid-template-columns:1fr}.map-wrap{height:250px}}
</style>
