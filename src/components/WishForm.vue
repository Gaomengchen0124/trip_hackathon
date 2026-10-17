<script setup>
import { ref, watch } from 'vue'
import DialogSheet from './ui/DialogSheet.vue'
const props = defineProps({ initialIp: { type: String, default: '' } })
const emit = defineEmits(['close'])
const key = 'pilgrimage-wish-draft-v1'
const fresh = () => ({ requestId: crypto.randomUUID(), ip: '', city: '', uncertain: false, points: [], scene: '', styles: [], clues: '', notify: false, email: '' })
let saved
try { saved = JSON.parse(localStorage.getItem(key)) } catch {}
const form = ref({ ...fresh(), ...(saved && typeof saved === 'object' ? saved : {}), ...(props.initialIp ? { ip: props.initialIp } : {}) })
if (!Array.isArray(form.value.points)) form.value.points = []
if (!Array.isArray(form.value.styles)) form.value.styles = []
const point = ref(''), busy = ref(false), error = ref(''), receipt = ref(null), draftError = ref('')
const styles = ['经典打卡', '深度探索', '同款美食', '轻松散步', '拍照出片']
watch(form, value => { try { localStorage.setItem(key, JSON.stringify(value)); draftError.value = '' } catch { draftError.value = '草稿暂无法保存，请保持页面开启。' } }, { deep: true })
function addPoint() {
  const value = point.value.trim()
  if (value && !form.value.points.includes(value) && form.value.points.length < 20) form.value.points.push(value)
  point.value = ''
}
async function submit() {
  if (busy.value) return
  addPoint()
  if (!form.value.ip.trim()) { error.value = '请填写许愿的作品/IP'; return }
  error.value = ''; busy.value = true
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const res = await fetch('/api/wishes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form.value), signal: controller.signal })
    if (!res.ok) throw new Error()
    const result = await res.json()
    if (!result.id) throw new Error()
    receipt.value = { ...result, ip: form.value.ip, city: form.value.uncertain ? '城市待定' : form.value.city }
    try { localStorage.removeItem(key) } catch {}
  } catch { error.value = '提交暂未完成，内容已保留，请重试。' }
  finally { clearTimeout(timer); busy.value = false }
}
function again() { form.value = fresh(); receipt.value = null; error.value = '' }
</script>
<template>
  <DialogSheet title="巡礼许愿" :busy="busy" @close="emit('close')">
    <div v-if="receipt" class="success" role="status">
      <div class="mail" aria-hidden="true">💌</div>
      <h3>许愿成功 ✨</h3>
      <p class="destination">《{{ receipt.ip }}》<template v-if="receipt.city"> · {{ receipt.city }}</template></p>
      <p class="hint">愿望编号：{{ receipt.id }}</p>
      <div class="actions"><router-link class="btn" to="/wishes" @click="emit('close')">去看看许愿墙</router-link><button class="btn-ghost" @click="again">再许一个愿</button></div>
    </div>
    <form v-else @submit.prevent="submit">
      <p class="intro">留下你期待的下一站</p>
      <fieldset :disabled="busy">
        <label for="wish-ip">许愿的作品/IP <span class="required">*</span></label>
        <input id="wish-ip" v-model="form.ip" required maxlength="100" placeholder="小说/动漫/影视/游戏" />
        <label for="wish-city">巡礼城市</label>
        <input id="wish-city" v-model="form.city" :disabled="form.uncertain" maxlength="150" placeholder="支持多个城市，用 / 分隔" />
        <label class="check"><input v-model="form.uncertain" type="checkbox" />暂不确定</label>
        <label for="wish-point">最想去的打卡点</label>
        <div class="point-row"><input id="wish-point" v-model="point" maxlength="100" placeholder="现实地点/虚构地点/场景名称" @keydown.enter.prevent="addPoint" /><button type="button" class="add" :disabled="form.points.length >= 20" @click="addPoint">添加</button></div>
        <p class="hint">支持添加多个，最多 20 个</p>
        <div class="chips"><button v-for="(p, i) in form.points" :key="i" type="button" :aria-label="`移除${p}`" @click="form.points.splice(i, 1)">{{ p }} ×</button></div>
        <label for="wish-scene">想重温的一幕</label><textarea id="wish-scene" v-model="form.scene" maxlength="1000" rows="3" placeholder="情节/台词/章节/集数" />
        <p class="label">巡礼方式</p><div class="chips"><label v-for="s in styles" :key="s" class="choice" :class="{ selected: form.styles.includes(s) }"><input v-model="form.styles" type="checkbox" :value="s" />{{ s }}</label></div>
        <label for="wish-clues">补充线索</label><textarea id="wish-clues" v-model="form.clues" maxlength="2000" rows="2" placeholder="备注/参考链接" />
        <label class="check notification"><input v-model="form.notify" type="checkbox" />收录通知</label>
        <label v-if="form.notify" for="wish-email">通知邮箱<input id="wish-email" v-model="form.email" type="email" required maxlength="254" placeholder="邮箱地址" /></label>
        <p class="hint privacy">内容用于路线整理；邮箱仅用于该路线收录通知，不公开。</p>
        <p v-if="draftError" class="hint" role="status">{{ draftError }}</p><p v-if="error" class="error" role="alert">{{ error }}</p>
        <button class="btn submit" type="submit">{{ busy ? '提交中…' : '提交许愿' }}</button>
      </fieldset>
    </form>
  </DialogSheet>
</template>
<style scoped>
.intro{color:var(--ink-2);margin-bottom:20px}fieldset{border:0;min-width:0}label:not(.check):not(.choice),.label{display:block;margin:18px 0 7px;font-weight:600}fieldset>label:first-child{margin-top:0}input:not([type=checkbox]),textarea{width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:var(--bg);font:inherit;color:var(--ink)}textarea{resize:vertical}input:focus-visible,textarea:focus-visible,button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}input:disabled{opacity:.5}.required,.error{color:var(--brand)}.check{display:flex;align-items:center;gap:8px;margin-top:9px;font-size:14px}.point-row{display:flex;gap:8px}.point-row input{min-width:0}.add{flex-shrink:0;background:var(--brand-light);border-radius:10px;padding:0 16px;color:var(--brand)}.hint{font-size:12px;color:var(--ink-2);margin-top:6px}.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.chips button,.choice{padding:6px 11px;border:1px solid var(--line);border-radius:20px;font-size:13px;overflow-wrap:anywhere}.choice{display:flex;gap:5px;align-items:center;cursor:pointer}.selected{background:var(--brand-light);color:var(--brand);border-color:var(--brand)}.notification{margin-top:20px}.privacy{margin:16px 0}.submit{width:100%;margin-top:12px}.error{font-size:14px}.success{text-align:center;padding:18px 0 26px}.success h3{font-size:24px;margin:8px 0}.destination{overflow-wrap:anywhere;margin:12px 0}.actions{display:flex;justify-content:center;gap:10px;margin-top:28px;flex-wrap:wrap}.mail{display:grid;place-items:center;height:130px;width:180px;margin:auto;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;font-size:88px;line-height:1;animation:letter-arrive .55s cubic-bezier(.2,.8,.2,1) both}@keyframes letter-arrive{from{opacity:0;transform:translateY(12px) scale(.85)}to{opacity:1;transform:translateY(0) scale(1)}}@media(prefers-reduced-motion:reduce){.mail{animation:none}}
</style>
