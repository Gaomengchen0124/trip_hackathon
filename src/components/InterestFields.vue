<script setup>
import { computed,ref } from 'vue'
import { dictionaries } from '../recommendation/options.mjs'
const model=defineModel({required:true})
const props=defineProps({works:{type:Array,default:()=>[]},showWorks:{type:Boolean,default:true},groups:{type:Array,default:()=>['kinds','themes','moods']}})
const search=ref('')
const groups=computed(()=>[['kinds','内容类型'],['themes','故事题材'],['moods','故事氛围']].filter(([key])=>props.groups.includes(key)))
const works=computed(()=>props.works.filter(w=>[w.name,...(w.aliases||[])].some(x=>x.toLowerCase().includes(search.value.trim().toLowerCase()))))
function toggle(key,id){const selected=model.value[key] || [];model.value={...model.value,[key]:selected.includes(id)?selected.filter(x=>x!==id):[...selected,id].slice(0,20)}}
</script>
<template>
  <div class="interest-fields">
    <fieldset v-for="[key,title] in groups" :key="key">
      <legend>{{ title }} <small>可多选</small></legend>
      <div class="chips"><button v-for="tag in dictionaries[key]" :key="tag.id" type="button" :aria-pressed="model[key].includes(tag.id)" @click="toggle(key,tag.id)">{{ tag.label }}</button></div>
    </fieldset>
    <fieldset v-if="showWorks">
      <legend>喜欢的作品 <small>可多选</small></legend>
      <input v-model="search" aria-label="搜索喜欢的作品" placeholder="搜索作品或人物" type="search" maxlength="100">
      <div class="chips work-chips"><button v-for="work in works" :key="work.ipId" type="button" :aria-pressed="model.ipIds.includes(work.ipId)" @click="toggle('ipIds',work.ipId)">{{ work.name }}</button></div>
      <p v-if="!works.length" class="muted">暂未收录，可以先选择题材。</p>
    </fieldset>
  </div>
</template>
<style scoped>
fieldset{border:0;margin:0 0 22px;padding:0}legend{font-weight:600;margin-bottom:10px;font-size:14px}small{font-weight:400;color:var(--ink-2);margin-left:6px}.chips{display:flex;flex-wrap:wrap;gap:8px}.chips button{padding:7px 14px;border:1px solid var(--line);border-radius:999px;background:#fff;font-size:13px;transition:background .15s}.chips button[aria-pressed=true]{background:#eee5d4;border-color:#9c7b42;color:#59421e}.chips button:focus-visible,input:focus-visible{outline:2px solid #806333;outline-offset:3px}input{padding:10px 12px;border:1px solid var(--line);border-radius:10px;width:100%;margin-bottom:12px;background:#fff}.work-chips{max-height:150px;overflow:auto;padding:3px}.muted{color:var(--ink-2);font-size:13px}
</style>
