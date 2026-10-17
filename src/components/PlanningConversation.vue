<script setup>
import {ref,onMounted,onBeforeUnmount,watch,nextTick} from 'vue'
import {getAuthSession} from '../auth/session.mjs'
import {planningPointers} from '../planning/pointers.mjs'
import {createPlanningAPI} from '../planning/client.mjs'
import {createPlanningExperience} from '../planning/ui.mjs'
import '../planning/ui.css'
const props=defineProps({context:{type:Object,required:true},pois:{type:Array,required:true}})
const emit=defineEmits(['busy','selection','generated'])
const host=ref(null)
let selectedOverride=null,unsubscribe,identity=null,ready=false
const experience=createPlanningExperience({getContext:()=>selectedOverride?{...props.context,selectedPoiIds:selectedOverride}:props.context,getPois:()=>props.pois,onBusy:v=>emit('busy',v),onSelectionChange:ids=>{selectedOverride=[...ids];emit('selection',ids)},onItinerary:it=>{planningPointers.set(it.context.lineId,it.id);emit('generated',it)}})
onMounted(async()=>{const id=planningPointers.get(props.context.lineId);if(id){try{const it=await createPlanningAPI()(`/api/itineraries/${id}`);if(host.value&&it.context.lineId===props.context.lineId)experience.restoreSession({planningSessionId:it.planningSessionId,intakeRevision:it.intakeRevision,context:it.context,requirements:it.requirements})}catch{planningPointers.delete(props.context.lineId)}}if(!host.value)return;ready=true;experience.mount(host.value);unsubscribe=getAuthSession().subscribe(snapshot=>{if(snapshot.loading)return;const next=snapshot.user?.id||'guest';if(identity!==null&&next!==identity){planningPointers.clear();experience.reset()};identity=next})})
watch(()=>props.context,async()=>{selectedOverride=null;await nextTick();if(ready&&host.value&&!experience.busy){experience.unmount();experience.mount(host.value)}},{deep:true})
onBeforeUnmount(()=>{unsubscribe?.();experience.unmount()})
</script>
<template><section id="planning-panel" ref="host" class="planning-panel" aria-label="智能行程需求" /></template>
