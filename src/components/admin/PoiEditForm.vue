<script setup>
// 单个 POI 编辑表单：按《填写模板.md》点位卡组织，字段带字数/格式提示
// IP 点：地名/书里叫法/片区/重要度/地图选点/两档时长/≤50字介绍/打卡贴士/放弃理由/引文/照片授权
// 城市景点：地名/片区/知名度/时长/地图选点/门票/开放时间/介绍/照片授权
import { ref, computed } from 'vue'
import LocationPicker from '../LocationPicker.vue'
import QuotesEdit from './QuotesEdit.vue'
import { uploadImage, ManageError } from '../../api/manage.js'
import { assetUrl } from '../../utils/travel-ui.js'
import { poiMissingFields } from './poi-check.mjs'

const props = defineProps({
  poi: { type: Object, required: true },
  clusters: { type: Array, default: () => [] },
  lineId: { type: String, required: true },
  city: { type: String, default: '' },
  maxTierS: { type: Number, default: 3 },
  fetching: { type: Boolean, default: false },
  locating: { type: Boolean, default: false },
})
const emit = defineEmits(['remove', 'locate'])

const unlocated = computed(() => props.poi.lng == null || props.poi.lat == null)
const img = (url) => assetUrl(url)

const uploadError = ref('')
const uploading = ref(false)
const mapOpen = ref(false)

const isIp = computed(() => props.poi.type === 'ip')
const missing = computed(() => poiMissingFields(props.poi))

async function onPick({ lat, lng }) {
  props.poi.lat = Math.round(lat * 1e6) / 1e6
  props.poi.lng = Math.round(lng * 1e6) / 1e6
}

async function addPhoto(file) {
  uploadError.value = ''
  uploading.value = true
  try {
    const url = await uploadImage(file)
    props.poi.photos = [...(props.poi.photos ?? []), url]
    if (!props.poi.realPhoto) props.poi.realPhoto = url
  } catch (e) { uploadError.value = e.message } finally { uploading.value = false }
}
function removePhoto(url) {
  props.poi.photos = (props.poi.photos ?? []).filter((u) => u !== url)
  if (props.poi.realPhoto === url) props.poi.realPhoto = props.poi.photos[0] ?? ''
}
function setCover(url) { props.poi.realPhoto = url }
</script>

<template>
  <form class="poi-form" @submit.prevent>
    <p class="badge" :class="{ ok: !missing.length }">{{ missing.length ? `缺 ${missing.length} 项必填：${missing.join('、')}` : '✓ 本卡已填齐' }}</p>

    <div class="row two">
      <label>地名（现用正式名，≤12 字） *<input v-model="poi.name" required maxlength="60" /></label>
      <label v-if="isIp">书里/剧里的叫法（没有填「无」）<input v-model="poi.alias" maxlength="100" /></label>
      <label v-else>门票<input v-model="poi.ticket" maxlength="100" /></label>
    </div>

    <div class="coords">
      <label>经度 *<input v-model.number="poi.lng" type="number" step="any" /></label>
      <label>纬度 *<input v-model.number="poi.lat" type="number" step="any" /></label>
      <button type="button" class="btn-ghost" @click="mapOpen = !mapOpen">{{ mapOpen ? '收起地图' : '🗺 地图选点' }}</button>
    </div>
    <div v-if="unlocated" class="locate-box">
      <p class="label">📍 待定位：{{ city ? `联网查到取景地/现实地名后填入（城市：${city}）` : '先填写城市' }}</p>
      <div class="locate-row">
        <input v-model="poi.filmingLocation" placeholder="取景地 / 现实地名（AI 已猜测的可直接改）" maxlength="100" />
        <button type="button" class="btn" :disabled="locating || !city" @click="emit('locate')">{{ locating ? '定位中…' : '定位' }}</button>
      </div>
      <p class="hint-inline">定位成功自动填入经纬度；搜不到的点用「地图选点」手动放置。</p>
    </div>
    <LocationPicker v-if="mapOpen" :selected="{ lat: poi.lat || 31.23, lng: poi.lng || 121.47 }" @pick="onPick" />

    <div class="row two">
      <label>片区 *（决定行程分组）
        <select v-model="poi.cluster">
          <option value="" disabled>选择片区</option>
          <option v-for="c in clusters" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label v-if="isIp">重要度 *（S 全线 ≤{{ maxTierS }} 个）
        <select v-model="poi.tier"><option value="" disabled>S/A/B</option><option>S</option><option>A</option><option>B</option></select>
      </label>
      <label v-else>知名度（1-5）*
        <input v-model.number="poi.popularity" type="number" min="1" max="5" />
      </label>
    </div>

    <div class="row two">
      <label>正常游玩（分钟，IP 30-180 / 景点 30-480）*<input v-model.number="poi.durationNormal" type="number" min="5" max="720" /></label>
      <label>快速打卡（分钟，约为正常的一半）*<input v-model.number="poi.durationRush" type="number" min="5" max="360" /></label>
    </div>

    <label>一句话介绍（≤50 字，详情页显示，说清"这儿是什么、跟作品什么关系"）*<textarea v-model="poi.intro" rows="3" maxlength="300" /></label>

    <div class="photos">
      <p class="label">照片（首图 = 封面；一张图只用于一个点位）*</p>
      <div class="thumbs">
        <figure v-for="url in poi.photos ?? []" :key="url" :class="{ cover: url === poi.realPhoto }">
          <img :src="img(url)" alt="点位照片" />
          <figcaption>
            <button type="button" class="mini" @click="setCover(url)">设封面</button>
            <button type="button" class="mini danger" @click="removePhoto(url)">移除</button>
          </figcaption>
        </figure>
        <label class="add" :class="{ busy: uploading }">
          {{ uploading ? '上传中…' : '＋ 上传照片' }}
          <input type="file" accept="image/jpeg" hidden @change="addPhoto($event.target.files[0]); $event.target.value = ''" />
        </label>
      </div>
      <p v-if="uploadError" class="error">{{ uploadError }}</p>
      <div class="row two">
        <label>图片来源 + 授权 *<input v-model="poi.photoCredit" placeholder="如：项目组实拍 / 授权图库，逐图核实" /></label>
        <label v-if="isIp">打卡贴士（几点来/机位/光线）<input v-model="poi.tips" maxlength="100" /></label>
        <label v-else>开放时间<input v-model="poi.openHours" maxlength="100" /></label>
      </div>
    </div>

    <template v-if="isIp">
      <p class="label">原著 / 影视引文 *（逐字来自原著/剧集，出处到章/集；写不出来就留空，绝不编造）</p>
      <QuotesEdit v-model="poi.quotes" />
      <label>被建议放弃时给用户看的理由（≤30 字）<input v-model="poi.skipNote" maxlength="200" /></label>
    </template>
  </form>
</template>

<style scoped>
.poi-form { display: grid; gap: 12px; }
.badge { margin: 0; font-size: 12px; padding: 6px 10px; border-radius: 8px; background: #fff8e1; color: #8a6d1a; }
.badge.ok { background: #e8f5e9; color: #2e7d32; }
.row.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.coords { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end; }
label { display: grid; gap: 4px; font-size: 13px; color: var(--ink-2); }
input, textarea, select { padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; font: inherit; font-size: 14px; background: #fff; }
textarea { resize: vertical; }
.label { font-size: 13px; color: var(--ink-2); margin: 0; }
.photos { display: grid; gap: 8px; }
.locate-box { background: #fff8e1; border: 1px solid #f0d68a; border-radius: 10px; padding: 10px 12px; display: grid; gap: 8px; }
.locate-row { display: flex; gap: 8px; }
.locate-row input { flex: 1; }
.fetch-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hint-inline { font-size: 12px; color: var(--ink-2); }
.thumbs { display: flex; gap: 10px; flex-wrap: wrap; }
.thumbs figure { margin: 0; width: 120px; display: grid; gap: 4px; }
.thumbs img { width: 120px; height: 90px; object-fit: cover; border-radius: 8px; border: 2px solid var(--line); }
.thumbs figure.cover img { border-color: var(--brand); }
.thumbs figcaption { display: flex; gap: 6px; }
.add { display: grid; place-items: center; width: 120px; height: 90px; border: 1px dashed var(--line); border-radius: 8px; font-size: 13px; color: var(--ink-2); cursor: pointer; }
.add.busy { opacity: .5; }
.mini { font-size: 12px; color: var(--brand); text-decoration: underline; }
.mini.danger { color: #c0392b; }
.error { color: var(--brand); font-size: 13px; }
@media (max-width: 700px) { .row.two, .coords { grid-template-columns: 1fr; } }
</style>
