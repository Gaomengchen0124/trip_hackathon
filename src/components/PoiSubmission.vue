<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import DialogSheet from './ui/DialogSheet.vue'
import LocationPicker from './LocationPicker.vue'
const props = defineProps({ line:{type:Object,required:true}, ip:{type:Object,required:true}, existingPois:{type:Array,default:()=>[]} })
const emit = defineEmits(['close'])
const draftKey = `poi-draft-v1-${props.line.lineId}`
const blank = () => ({requestId:crypto.randomUUID(),type:'ip',place:null,city:props.line.city,locationDetail:'',alias:'',intro:'',tips:'',scene:'',relation:'故事发生地',edition:'原著',chapter:'',excerpt:'',source:'',confirmed:false})
let restored
try {restored=JSON.parse(localStorage.getItem(draftKey))}catch{}
const form=ref({...blank(),...(restored && typeof restored==='object'?restored:{})})
const step=ref(1), query=ref(''), results=ref([]), searched=ref(false), searching=ref(false), searchNotice=ref(''), searchError=ref(''), error=ref(''), busy=ref(false), processing=ref(false), receipt=ref(null), photos=ref([]), photoError=ref(''), draftError=ref('')
const pendingPlace=ref(form.value.place), reverseBusy=ref(false), mapError=ref(''), locationConfirmed=ref(!!(form.value.place?.name?.trim()&&form.value.place?.address?.trim()))
const composing=ref(false), searchMessage=ref('')
const cityCenters={'上海':[31.23,121.47],'北京':[39.90,116.40],'杭州':[30.27,120.15],'天津':[39.13,117.20],'厦门':[24.48,118.09],'大理':[25.69,100.16],'伦敦':[51.51,-.12],'东京及近郊':[35.68,139.76],'东京':[35.68,139.76]}
const center=computed(()=>cityCenters[form.value.city]||[31.23,121.47])
const duplicate=computed(()=>{
 const place=form.value.place;if(!place)return null
 return props.existingPois.find(p=>p.name===place.name || (Math.abs(p.lat-place.lat)<.00035 && Math.abs(p.lng-place.lng)<.00035))
})
const steps=computed(()=>form.value.type==='ip'?['地点信息','照片与介绍','IP 关联']:['地点信息','照片与介绍'])
watch(form,value=>{try {localStorage.setItem(draftKey,JSON.stringify(value));draftError.value=''}catch{draftError.value='草稿暂无法保存，请保持页面开启。'}},{deep:true})
let searchId=0, reverseId=0, searchTimer, reverseTimer, controller
function scheduleSearch(){
 clearTimeout(searchTimer);controller?.abort();searchId++;results.value=[];searched.value=false;searchError.value='';searchNotice.value='';searchMessage.value='';searching.value=false
 if(!composing.value&&query.value.trim().length>=2)searchTimer=setTimeout(search,700)
}
watch(query,scheduleSearch)
watch(composing,value=>{if(!value)scheduleSearch()})
watch(()=>form.value.city,()=>{form.value.place=null;pendingPlace.value=null;locationConfirmed.value=false;mapError.value='';reverseId++;clearTimeout(reverseTimer);reverseBusy.value=false;scheduleSearch()})
async function search(){
 clearTimeout(searchTimer)
 const text=query.value.trim();if(!text||composing.value)return
 controller?.abort();const currentController=new AbortController();controller=currentController
 const current=++searchId;searching.value=true;searchError.value=''
 const timer=setTimeout(()=>currentController.abort(),40000)
 try{
 const url=new URL('/api/places',location.origin);url.searchParams.set('q',text);url.searchParams.set('city',form.value.city);url.searchParams.set('lineId',props.line.lineId)
 const res=await fetch(url,{signal:currentController.signal});const data=await res.json();if(current!==searchId)return
 if(!res.ok)throw Error(data.error||'地址搜索暂不可用，请稍后重试')
 results.value=data.results;searchNotice.value=data.notice||'';searchMessage.value=data.message||'';searched.value=true
 }catch(e){if(current===searchId&&e.name!=='AbortError')searchError.value=e.message==='Failed to fetch'?'地址搜索暂不可用，请稍后重试':e.message}
 finally{clearTimeout(timer);if(current===searchId){searching.value=false;if(currentController.signal.aborted)searchError.value='地址搜索超时，请重试'}}
}
function selectPlace(place){
 clearTimeout(reverseTimer);reverseId++;reverseBusy.value=false;mapError.value='';pendingPlace.value={...place};results.value=[];searched.value=false;searchMessage.value=place.approximate?'道路参考位置，请在地图上确认后补充门牌。':'';form.value.place=null;locationConfirmed.value=false;error.value=''
}
function pick(point){
 clearTimeout(reverseTimer);const current=++reverseId
 pendingPlace.value={...point,name:'',address:'',source:'manual'};form.value.place=null;locationConfirmed.value=false;mapError.value='';reverseBusy.value=true
 reverseTimer=setTimeout(async()=>{
 try{
 const url=new URL('/api/places/reverse',location.origin);for(const [k,v]of Object.entries({...point,city:form.value.city,lineId:props.line.lineId}))url.searchParams.set(k,v)
 const res=await fetch(url,{signal:AbortSignal.timeout(25000)}),data=await res.json();if(current!==reverseId)return
 if(!res.ok)throw Error(data.error||'未能识别此处地址，请重新选点')
 pendingPlace.value=data.place;searchNotice.value=data.notice||'';searchMessage.value=data.message||''
 }catch(e){if(current===reverseId)mapError.value=e.message==='Failed to fetch'?'地址识别暂不可用，请从搜索结果选择地点':e.message}
 finally{if(current===reverseId)reverseBusy.value=false}
 },400)
}
function confirmPlace(){
 if(!pendingPlace.value?.address||!pendingPlace.value?.name||reverseBusy.value)return
 form.value.place={...pendingPlace.value};locationConfirmed.value=true;error.value=''
}
async function addPhotos(event){
 photoError.value='';processing.value=true
 try{
 for(const file of Array.from(event.target.files||[])){
 if(photos.value.length>=5){photoError.value='最多上传 5 张照片';break}
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){photoError.value='请选用不超过 10 MB 的 JPG/PNG/WebP 照片';continue}
 let bitmap
 try{
 bitmap=await createImageBitmap(file)
 if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>50000000)throw Error()
 const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas')
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height)
 // 重编码去除 EXIF，减小上传体积。
 const data=canvas.toDataURL('image/jpeg',.85)
 photos.value.push({name:file.name,data})
 }catch{photoError.value='照片无法读取，请换一张重试'}finally{bitmap?.close()}
 }
 }finally{processing.value=false;event.target.value=''}
}
function validate(){
 if(step.value===1){if(!locationConfirmed.value||!form.value.place?.name?.trim()||!form.value.place?.address?.trim())return '请先选择并确认地点';if(duplicate.value)return '该点位已收录，请选择尚未收录的地点'}
 if(step.value===2){if(!photos.value.length)return '请上传至少一张景点照片';if(form.value.intro.trim().length<20)return '点位介绍至少 20 字';if(!form.value.confirmed)return '请确认照片符合要求且可授权用于路线展示'}
 if(step.value===3 && form.value.type==='ip' && form.value.scene.trim().length<10)return '对应情节至少 10 字'
 return ''
}
function next(){error.value=validate();if(!error.value)step.value++}
async function submit(){
 if(busy.value||processing.value)return
 error.value=validate();if(error.value)return
 busy.value=true
 try{
 const payload={...form.value,lineId:props.line.lineId,photos:photos.value.map(p=>p.data)}
 const res=await fetch('/api/poi-submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)})
 const data=await res.json();if(!res.ok)throw Error(data.error||'提交失败')
 receipt.value={...data,name:form.value.place.name};try{localStorage.removeItem(draftKey)}catch{}
 }catch(e){error.value=e.name==='TimeoutError'?'提交超时，内容已保留，请重试。':e.message==='Failed to fetch'?'提交暂未完成，内容已保留，请重试。':e.message}finally{busy.value=false}
}
function again(){form.value=blank();pendingPlace.value=null;locationConfirmed.value=false;photos.value=[];receipt.value=null;step.value=1;error.value='';query.value='';results.value=[]}
onBeforeUnmount(()=>{searchId++;reverseId++;clearTimeout(searchTimer);clearTimeout(reverseTimer);controller?.abort()})
</script>
<template>
<DialogSheet title="补充巡礼点位" :busy="busy || processing" @close="emit('close')">
 <div v-if="receipt" class="receipt" role="status"><div aria-hidden="true">📍</div><h3>点位已提交</h3><p>{{ receipt.name }} · {{ line.title }}</p><span class="status">待审核</span><p class="hint">投稿编号：{{ receipt.id }}</p><div class="buttons"><button class="btn" @click="emit('close')">返回路线</button><button class="btn-ghost" @click="again">继续补充</button></div></div>
 <form v-else @submit.prevent="step < steps.length ? next() : submit()">
  <p class="route-label">{{ line.title }}</p>
  <ol class="steps"><li v-for="(s,i) in steps" :key="s" :class="{current:step===i+1,done:step>i+1}" :aria-current="step===i+1?'step':undefined"><span>{{ i+1 }}</span>{{ s }}</li></ol>
  <fieldset :disabled="busy || processing">
  <div v-if="step===1">
   <p class="label">点位类型</p><div class="type-switch"><label><input v-model="form.type" type="radio" value="ip" /> IP 点</label><label><input v-model="form.type" type="radio" value="classic" /> 其他点</label></div>
   <label for="place-city">所在城市</label><input id="place-city" v-model="form.city" list="place-cities" maxlength="80" placeholder="选择或输入城市"/><datalist id="place-cities"><option v-for="c in Object.keys(cityCenters)" :key="c" :value="c"/></datalist>
   <label for="place-query">地点搜索</label><div class="search-row"><input id="place-query" v-model="query" maxlength="100" autocomplete="off" placeholder="地点名称/道路/门牌号" :aria-expanded="results.length>0" aria-controls="place-results" @compositionstart="composing=true" @compositionend="composing=false" @keydown.enter.prevent="search"/><button class="btn-ghost" type="button" :disabled="searching || !query.trim() || !form.city.trim()" @click="search">搜索</button></div>
   <p class="hint">输入关键词，选择下方具体地点。</p>
   <p v-if="searching" class="hint" role="status">正在查找地址…</p><p v-if="searchError" class="search-error" role="alert">{{searchError}}<button type="button" @click="search">重试</button></p>
   <p v-if="searchMessage" class="hint" role="status">{{searchMessage}}</p><p v-if="searched && !results.length" class="hint">未找到匹配地址，可补充道路和门牌号，或在地图上选点。</p>
   <div id="place-results" class="results" aria-label="地址候选"><button v-for="(p,i) in results" :key="i" type="button" :class="{picked:pendingPlace?.name===p.name && pendingPlace?.address===p.address}" @click="selectPlace(p)"><span class="result-pin" aria-hidden="true">⌖</span><span class="result-copy"><strong>{{p.name}}</strong><small>{{p.address}}</small><em v-if="p.existing">该点位已收录</em><em v-else-if="p.approximate">道路参考位置 · 需地图确认</em></span><span aria-hidden="true">›</span></button></div>
   <p v-if="searchNotice" class="attribution">{{searchNotice}}</p>
   <LocationPicker :center="center" :selected="pendingPlace" @pick="pick" />
   <div v-if="pendingPlace" class="selection" aria-live="polite"><p v-if="reverseBusy" class="hint">正在识别地图地址…</p><p v-else-if="mapError" class="error">{{mapError}}</p><template v-else-if="pendingPlace.address"><span class="selection-label">{{locationConfirmed?'已确认地点':'确认地图位置'}}</span><strong>{{pendingPlace.name}}</strong><p>{{pendingPlace.address}}</p><p v-if="pendingPlace.approximate" class="hint">{{pendingPlace.precision==='附近地址'?'附近地址仅供参考':'道路参考位置'}}，请核对实际位置。</p><button v-if="!locationConfirmed" type="button" class="confirm-location" @click="confirmPlace">确认这个位置</button><span v-else class="confirmed">✓ 已选定</span></template></div>
   <p v-if="duplicate" class="error">该点位已收录：{{duplicate.name}}，请选择尚未收录的地点。</p>
   <template v-if="locationConfirmed"><label for="place-name">点位名称</label><input id="place-name" v-model="form.place.name" maxlength="100" placeholder="景点/建筑/店铺名称"/><label for="place-detail">具体位置</label><input id="place-detail" v-model="form.locationDetail" maxlength="300" placeholder="门牌号/入口/楼层/拍摄位置，选填"/></template>
   <template v-if="form.type==='ip'"><label for="place-alias">作品内地点名</label><input id="place-alias" v-model="form.alias" maxlength="100" placeholder="虚构名称/别称，选填" /></template>
  </div>
  <div v-if="step===2">
   <p class="label">景点照片 *</p><p class="hint">景点实拍 / 1–5 张 / JPG、PNG、WebP / 单张 ≤10 MB</p><p class="photo-rule">不接受自拍、人像或以人物为主体的照片；少量背景路人可接受。</p>
   <label class="upload" for="poi-photos">＋ 添加景点照片<input id="poi-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple @change="addPhotos" /></label><p v-if="processing" role="status">正在处理照片…</p><p v-if="photoError" class="error" role="alert">{{photoError}}</p>
   <div class="photos"><figure v-for="(photo,i) in photos" :key="photo.data"><img :src="photo.data" :alt="`景点照片 ${i+1}`"/><figcaption><button v-if="i" type="button" @click="photos.unshift(...photos.splice(i,1))">设为封面</button><span v-else>封面</span><button type="button" :aria-label="`删除照片${i+1}`" @click="photos.splice(i,1)">删除</button></figcaption></figure></div>
   <label for="poi-intro">点位介绍 *</label><textarea id="poi-intro" v-model="form.intro" rows="4" maxlength="300" placeholder="地点特色/现场体验/巡礼关联，20–300 字"/><p class="counter">{{form.intro.length}} / 300</p>
   <label for="poi-tips">实用补充</label><textarea id="poi-tips" v-model="form.tips" rows="2" maxlength="500" placeholder="开放情况/预约要求/拍摄位置，选填" />
   <label class="check"><input v-model="form.confirmed" type="checkbox"/>照片以景点为主体，我拥有使用权并同意用于路线展示。</label>
  </div>
  <div v-if="step===3 && form.type==='ip'">
   <p class="hint">补充地点与《{{ip.name}}》的关联，便于核实收录。</p>
   <label for="poi-relation">关联类型</label><select id="poi-relation" v-model="form.relation"><option>故事发生地</option><option>取景地</option><option>现实原型</option><option>其他关联</option></select>
   <label for="poi-edition">作品版本</label><select id="poi-edition" v-model="form.edition"><option>原著</option><option>影视改编</option><option>其他</option></select>
   <label for="poi-scene">对应情节 *</label><textarea id="poi-scene" v-model="form.scene" rows="4" maxlength="1500" placeholder="人物/事件/与地点的关联，至少 10 字" />
   <label for="poi-chapter">章节/集数</label><input id="poi-chapter" v-model="form.chapter" maxlength="100" placeholder="选填"/>
   <label for="poi-excerpt">台词/原文节选</label><textarea id="poi-excerpt" v-model="form.excerpt" rows="3" maxlength="2000" placeholder="选填；未填写时由团队查证补充"/>
   <label for="poi-source">参考来源</label><input id="poi-source" v-model="form.source" maxlength="500" placeholder="链接/版本/来源说明，选填" />
  </div>
  <p v-if="restored && !photos.length && step===2" class="hint">文字草稿已恢复，照片需重新选择。</p><p v-if="draftError" class="hint">{{draftError}}</p><p v-if="error" class="error" role="alert">{{error}}</p>
  <div class="buttons"><button v-if="step>1" class="btn-ghost" type="button" @click="step--;error=''">上一步</button><button class="btn" type="submit">{{busy?'提交中…':processing?'处理照片中…':step<steps.length?'下一步':'提交点位'}}</button></div><p class="hint footer-note">投稿审核后收录，提交内容不会立即公开。</p>
  </fieldset>
 </form>
</DialogSheet>
</template>
<style scoped>
.route-label{font-size:13px;color:var(--ink-2)}fieldset{border:0;min-width:0}.steps{display:flex;list-style:none;gap:18px;margin:18px 0 26px;font-size:12px;color:var(--ink-2)}.steps li{display:flex;gap:7px;align-items:center}.steps span{display:grid;place-items:center;border:1px solid var(--line);width:24px;height:24px;border-radius:50%}.steps .current{color:var(--brand)}.steps .current span,.steps .done span{background:var(--brand);border-color:var(--brand);color:white}label:not(.check),.label{display:block;margin:18px 0 8px;font-size:14px;font-weight:600}input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea,select{width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;background:var(--bg);color:var(--ink);font:inherit;font-size:14px}textarea{resize:vertical}.type-switch{display:flex;gap:28px}.type-switch label{margin:0;font-weight:400}.search-row{display:flex;gap:8px}.search-row input{min-width:0}.search-row button{white-space:nowrap;padding:8px 20px}.hint{font-size:12px;color:var(--ink-2);margin:8px 0;line-height:1.7}.results{display:grid;gap:0;margin:12px 0;border-radius:14px;overflow:hidden}.results button{display:flex;gap:12px;align-items:center;width:100%;padding:14px 10px;border-bottom:1px solid var(--line);text-align:left}.results button:last-child{border-bottom:0}.results button:hover,.results button.picked{background:var(--brand-light)}.result-pin{font-size:23px;color:var(--ink-2)}.result-copy{flex:1;min-width:0}.results strong{font-size:14px;font-weight:500}.results small{display:block;color:var(--ink-2);font-size:12px;margin-top:4px;line-height:1.6;overflow-wrap:anywhere}.results em{font-size:11px;color:var(--brand);font-style:normal}.selection{background:var(--bg);padding:16px;border:1px solid var(--line);border-radius:12px;display:grid;gap:7px}.selection-label{font-size:11px;color:var(--ink-2)}.selection>strong{font-size:15px;font-weight:600;overflow-wrap:anywhere}.selection>p{font-size:12px;color:var(--ink-2);overflow-wrap:anywhere}.confirm-location{background:white;border:1px solid var(--line);padding:9px 14px;border-radius:20px;margin-top:4px;font-size:13px;justify-self:start}.confirmed{color:var(--brand);font-size:12px}.search-error{font-size:12px;color:var(--brand);margin:10px 0}.search-error button{margin-left:10px;text-decoration:underline}.attribution{font-size:10px;color:var(--ink-2);margin:8px 0}.photo-rule{font-size:12px;color:var(--ink-2);line-height:1.7}.upload{border:1px dashed #c8bfb3;padding:20px;border-radius:12px;text-align:center;cursor:pointer;background:var(--bg)}.upload input{display:block;font-size:12px;max-width:100%;margin:12px auto 0;font-weight:400}.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0}.photos img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px}.photos figcaption{display:flex;justify-content:space-between;font-size:11px;color:var(--ink-2)}.counter{font-size:11px;color:var(--ink-2);text-align:right}.check{display:flex;gap:8px;align-items:flex-start;font-size:12px;margin:18px 0}.check input{margin-top:4px}.buttons{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}.error{font-size:13px;color:var(--brand);margin:12px 0}.footer-note{text-align:right;font-size:11px}.receipt{text-align:center;padding:20px 0 30px}.receipt>div:first-child{font-size:72px}.receipt h3{font-size:24px;margin:12px 0}.receipt>p{overflow-wrap:anywhere}.receipt .status{display:inline-block;margin:18px 0 8px;border:1px solid var(--line);padding:4px 12px;border-radius:16px;font-size:12px}.receipt .buttons{justify-content:center;flex-wrap:wrap}input:focus-visible,textarea:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}@media(max-width:500px){.steps{gap:10px;font-size:11px}.steps span{width:21px;height:21px}.photos{grid-template-columns:repeat(2,1fr)}}
</style>
