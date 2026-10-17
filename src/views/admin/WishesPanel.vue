<script setup>
import {computed,ref,onMounted,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {manage} from '../../api/manage.js'
import {workKey} from '../../utils/wish-import.mjs'
import DialogSheet from '../../components/ui/DialogSheet.vue'
import WishForm from '../../components/WishForm.vue'
import WishImportDialog from '../../components/admin/WishImportDialog.vue'
import '../../components/admin/wish-workflow.css'
const route=useRoute(),router=useRouter()
const rows=ref([]),links=ref([]),pending=ref([]),busy=ref(false),error=ref(''),notice=ref(''),selected=ref([]),wishOpen=ref(false),importIds=ref(null)
const q=ref(''),status=ref(''),sort=ref('recent'),page=ref(1),detailId=ref(''),editStatus=ref(''),note=ref(''),saving=ref(false)
const STATUSES=['待整理','筹备中','已收录','已拒绝']
watch(()=>route.query,value=>{q.value=String(value.q??'');status.value=String(value.status??'');sort.value=String(value.sort??'recent');page.value=Math.max(1,Number(value.page)||1);detailId.value=String(value.wish??'')},{immediate:true})
const detail=computed(()=>rows.value.find(w=>w.id===detailId.value))
watch(detail,w=>{if(w){editStatus.value=w.status;note.value=w.reviewNote??''}})
function queryChange(extra={}){router.replace({query:{...route.query,q:q.value||undefined,status:status.value||undefined,sort:sort.value==='recent'?undefined:sort.value,page:page.value>1?String(page.value):undefined,...extra}})}
function filterChange(){page.value=1;queryChange()}
function openDetail(id){queryChange({wish:id})}
function closeDetail(){queryChange({wish:undefined})}
const counts=computed(()=>Object.fromEntries(STATUSES.map(s=>[s,rows.value.filter(w=>w.status===s).length])))
const filtered=computed(()=>rows.value.filter(w=>(!status.value||w.status===status.value)&&`${w.ip} ${w.city} ${w.points.join(' ')} ${w.scene} ${w.clues}`.toLowerCase().includes(q.value.trim().toLowerCase())))
const groups=computed(()=>{
 const map=new Map()
 for(const w of filtered.value){const key=`${workKey(w.ip)}|${w.city}`;const g=map.get(key)??{key,name:w.ip,city:w.city,rows:[],likes:0,lastAt:''};g.rows.push(w);g.likes+=w.likes||0;g.lastAt=g.lastAt>w.createdAt?g.lastAt:w.createdAt;map.set(key,g)}
 return [...map.values()].sort((a,b)=>sort.value==='likes'?b.likes-a.likes:sort.value==='count'?b.rows.length-a.rows.length:b.lastAt.localeCompare(a.lastAt))
})
const pages=computed(()=>Math.max(1,Math.ceil(groups.value.length/8)))
const visible=computed(()=>groups.value.slice((Math.min(page.value,pages.value)-1)*8,Math.min(page.value,pages.value)*8))
const related=id=>links.value.filter(l=>l.wishId===id)
const selectionWork=computed(()=>workKey(rows.value.find(w=>selected.value.includes(w.id))?.ip))
async function load(){busy.value=true;error.value='';try{const [w,l]=await Promise.all([manage('/api/wishes/export'),manage('/api/manage/content/wish-links')]);rows.value=w.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));links.value=l.links;pending.value=l.pending;selected.value=selected.value.filter(id=>w.some(r=>r.id===id))}catch(e){error.value=e.message}finally{busy.value=false}}
onMounted(load)
async function saveStatus(){const w=detail.value;if(!w)return;if(editStatus.value==='已拒绝'&&!note.value.trim()){error.value='请填写暂不采纳的原因';return}saving.value=true;error.value='';try{await manage(`/api/wishes/${w.id}/status`,{method:'PATCH',body:{status:editStatus.value,note:note.value,expectedStatus:w.status}});notice.value='状态与处理备注已保存';await load()}catch(e){error.value=e.message}finally{saving.value=false}}
function create(ids){router.push({path:'/manage/ips',query:{create:'1',wishes:ids.join(','),returnTo:route.fullPath}})}
function associate(ids){importIds.value=ids;closeDetail()}
function editLink(link){router.push({path:`/manage/ips/${link.ipId}/edit`,query:{returnTo:route.fullPath,city:link.cityKey,step:'1',sources:'1'}})}
function imported(result){importIds.value=null;router.push({path:`/manage/ips/${result.ip.ipId}/edit`,query:{returnTo:route.fullPath,sources:'1',step:'1'}})}
async function retry(id){saving.value=true;try{const r=await manage(`/api/manage/content/wish-imports/${id}/retry`,{method:'POST',body:{}});notice.value=r.syncPending?'仍有状态待同步，请核对心愿最新状态或稍后重试':'状态同步完成';await load()}catch(e){error.value=e.message}finally{saving.value=false}}
async function copyEmail(email){try{await navigator.clipboard.writeText(email);notice.value='邮箱已复制'}catch{error.value='复制失败，请手动选择邮箱'}}
function csvCell(value){let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s=`'${s}`;return `"${s.replace(/"/g,'""')}"`}
function exportCsv(){const head=['心愿编号','作品','目的地','点位','场景','巡礼方式','补充线索','通知邮箱','状态','处理备注','赞数'];const lines=[head,...filtered.value.map(w=>[w.id,w.ip,w.city,w.points.join(' / '),w.scene,w.styles.join(' / '),w.clues,w.notify?w.email:'',w.status,w.reviewNote,w.likes])];const url=URL.createObjectURL(new Blob(['\ufeff'+lines.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='心愿单.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function adjacent(delta){const index=filtered.value.findIndex(w=>w.id===detailId.value);if(filtered.value[index+delta])openDetail(filtered.value[index+delta].id)}
</script>
<template>
 <div class="wish-workflow">
  <div class="heading"><div><h2>心愿单</h2><p class="muted">把期待整理成下一条巡礼路线 · 共 {{ rows.length }} 条心愿</p></div><div class="actions"><button class="btn-ghost" @click="exportCsv">导出当前筛选</button><button class="btn" @click="wishOpen=true">＋ 录入心愿</button></div></div>
  <p v-if="error" class="error" role="alert">{{ error }} <button class="link-button" @click="load">重新加载</button></p><p v-if="notice" class="notice" role="status">{{ notice }}</p>
  <div v-for="op in pending" :key="op.id" class="notice">草稿 {{ op.ipId }} 有 {{ op.count }} 条心愿状态待同步。<button class="link-button" :disabled="saving" @click="retry(op.id)">重试同步</button></div>
  <div class="stat-tabs"><button :class="{on:!status}" @click="status='';filterChange()">全部 {{ rows.length }}</button><button v-for="s in STATUSES" :key="s" :class="{on:status===s}" @click="status=s;filterChange()">{{ s }} {{ counts[s] }}</button></div>
  <div class="toolbar"><input v-model="q" aria-label="搜索心愿" placeholder="搜索作品、目的地、点位或线索" @input="filterChange" /><select v-model="sort" aria-label="心愿排序" @change="filterChange"><option value="recent">最近提交</option><option value="count">许愿最多</option><option value="likes">点赞最多</option></select><button class="btn-ghost" :disabled="busy" @click="load">刷新</button></div>
  <div v-if="selected.length" class="notice">已选 {{ selected.length }} 条同作品心愿 <div class="actions"><button class="btn" @click="create(selected)">创建 IP 草稿</button><button class="btn-ghost" @click="associate([...selected])">关联已有 IP</button><button class="link-button" @click="selected=[]">清空选择</button></div></div>
  <p v-if="busy" class="empty" role="status">正在加载…</p>
  <div v-else-if="visible.length" class="list-grid"><section v-for="g in visible" :key="g.key" class="source-card"><div class="group-header"><h3>《{{ g.name }}》 <span class="badge">{{ g.city||'目的地待定' }}</span></h3><span class="muted">{{ g.rows.length }} 条 · {{ g.likes }} 赞</span></div>
   <div v-for="w in g.rows" :key="w.id" class="wish-row"><input v-model="selected" :aria-label="`选择心愿 ${w.id}`" type="checkbox" :value="w.id" :disabled="w.status==='已拒绝'||(!!selectionWork&&selectionWork!==workKey(w.ip))" /><div class="grow"><span class="badge">{{ w.status }}</span><span class="muted">{{ new Date(w.createdAt).toLocaleDateString('zh-CN') }}</span><p class="excerpt">{{ w.points.join('、')||'尚未提供点位' }}<template v-if="w.scene"> · {{ w.scene }}</template></p><small>{{ related(w.id).length?`已关联 ${related(w.id).length} 条城市线 · ${related(w.id).filter(l=>l.completedAt).length} 条已满足`:'尚未关联 IP' }}</small></div><button class="btn-ghost" @click="openDetail(w.id)">查看详情</button></div>
  </section></div><p v-else class="empty">没有匹配的心愿，试试清除搜索或切换状态。</p>
  <div v-if="pages>1" class="pagination"><button :disabled="page<=1" @click="page--;queryChange()">上一页</button><span>{{ Math.min(page,pages) }} / {{ pages }}</span><button :disabled="page>=pages" @click="page++;queryChange()">下一页</button></div>
  <DialogSheet v-if="detail" title="心愿详情" side :busy="saving" @close="closeDetail"><div class="wish-workflow">
   <h3>《{{ detail.ip }}》</h3><p class="muted">{{ detail.id }} · {{ new Date(detail.createdAt).toLocaleString('zh-CN') }}</p><p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="notice" class="notice" role="status">{{ notice }}</p>
   <dl class="detail-grid"><div><dt>期待的目的地</dt><dd>{{ detail.city||'暂未确定' }}</dd></div><div><dt>想去的点位</dt><dd>{{ detail.points.join('、')||'未提供' }}</dd></div><div><dt>想重温的一幕</dt><dd>{{ detail.scene||'未提供' }}</dd></div><div><dt>巡礼方式</dt><dd>{{ detail.styles.join('、')||'未提供' }}</dd></div><div><dt>补充线索</dt><dd>{{ detail.clues||'未提供' }}</dd></div></dl>
   <details v-if="detail.notify&&detail.email"><summary>收录通知：用户希望收到通知</summary><p>{{ detail.email }} <button class="link-button" @click="copyEmail(detail.email)">复制邮箱</button></p><p class="muted">尚未自动发送通知，修改状态不会发送邮件。</p></details>
   <article v-for="l in related(detail.id)" :key="`${l.ipId}|${l.cityKey}`" class="source-card"><strong>{{ l.ipName }} · {{ l.cityKey }}</strong><small>{{ l.completedAt?(l.online?'已确认满足':'历史已确认满足 · 关联线已下架'):l.online?'线路已上线，待核对收录':'草稿筹备中' }}</small><button class="link-button" @click="editLink(l)">继续整理 / 查看来源进度</button></article>
   <label class="field">处理状态<select v-model="editStatus"><option v-for="s in STATUSES" :key="s">{{ s }}</option></select></label><label class="field">处理备注<textarea v-model="note" maxlength="1000" placeholder="记录待核实信息、部分完成情况或暂不采纳的原因" /></label><button class="btn-ghost" :disabled="saving" @click="saveStatus">保存状态与备注</button>
   <details v-if="detail.history?.length"><summary>处理记录（{{ detail.history.length }}）</summary><ul class="history"><li v-for="(h,i) in [...detail.history].reverse()" :key="i">{{ new Date(h.at).toLocaleString('zh-CN') }} · {{ h.from }} → {{ h.to }}<br />{{ h.note }}</li></ul></details>
   <div class="actions sticky-actions"><button class="btn" :disabled="detail.status==='已拒绝'" @click="create([detail.id])">创建 IP 草稿</button><button class="btn-ghost" :disabled="detail.status==='已拒绝'" @click="associate([detail.id])">关联已有 IP</button><button class="link-button" @click="adjacent(-1)">上一条</button><button class="link-button" @click="adjacent(1)">下一条</button></div>
  </div></DialogSheet>
  <WishForm v-if="wishOpen" @close="wishOpen=false;load()" />
  <WishImportDialog v-if="importIds" mode="existing" :initial-ids="importIds" @close="importIds=null" @imported="imported" />
 </div>
</template>
