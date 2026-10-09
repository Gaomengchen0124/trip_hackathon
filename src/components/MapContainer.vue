<script setup>
// B：真实地理底图；保留原有 props / emits 契约。
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import 'leaflet/dist/leaflet.css'
import streets from '../data/shanghai-streets.json'
// leaflet 在模块加载期就会读 window，Node 侧渲染（SSR / scripts/e2e-ssr.mjs）会直接崩。
// 所以改成进页面后再动态 import：浏览器里行为不变，服务端根本不会加载它。
let L = null
async function loadLeaflet() {
  if (!L) {
    const mod = await import('leaflet')
    L = mod.default || mod
  }
  return L
}
const props = defineProps({
  pois: { type: Array, default: () => [] }, selectedIds: { type: Array, default: () => [] },
  plan: { type: Object, default: null }, interactive: { type: Boolean, default: true },
  activePoiId: { type: String, default: '' }, city: { type: String, default: '上海' },
  ipName: { type: String, default: '' },
})
const emit = defineEmits(['marker-click', 'marker-hover'])
const host = ref(null), state = ref('loading'), picked = ref('')
const valid = computed(() => props.pois.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 85 && Math.abs(p.lng) <= 180))
const labels = computed(() => {
  const result = {}
  props.plan?.days?.forEach(d => d.items?.forEach(it => { result[it.poiId] = `D${d.day}-${it.order}` }))
  return result
})
let map, pins, tiles, observer, timer
const markers = new Map()
const HANDLERS = ['dragging', 'touchZoom', 'doubleClickZoom', 'keyboard', 'boxZoom']
// interactive 是异步变的（S3 进页面时还在 loading），建图之后必须能补打开
function applyInteractive() {
  if (!map) return
  for (const name of HANDLERS) {
    const handler = map[name]
    if (!handler) continue
    if (props.interactive) handler.enable()
    else handler.disable()
  }
}
const token = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''
const provider = token.startsWith('pk.') ? 'Mapbox' : 'OpenStreetMap'
const status = computed(() => state.value === 'online' ? `${provider} · 在线地图` : state.value === 'loading' ? '正在连接在线地图…' : '本地道路 · 仅人民广场周边')
function fit() {
  if (!map) return
  if (valid.value.length) map.fitBounds(valid.value.map(p => [p.lat, p.lng]), { padding: [45, 55], maxZoom: 15, animate: false })
  else map.setView([31.227, 121.473], 13)
}
function zoomBy(delta) {
  if (!map || !props.interactive) return
  if (delta > 0) map.zoomIn(1)
  else map.zoomOut(1)
}
function focus(id, notify = false) {
  const marker = markers.get(id)
  if (!marker || !map) return
  picked.value = id
  map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), { animate: false })
  marker.openTooltip()
  if (notify) { emit('marker-click', id); emit('marker-hover', id) }
}
function render() {
  if (!map) return
  for (const marker of markers.values()) marker.closeTooltip(); pins.clearLayers(); markers.clear()
  for (const p of valid.value) {
    const selected = props.selectedIds.includes(p.poiId)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `travel-pin ${selected ? (p.type === 'ip' ? 'ip' : 'classic') : ''} ${p.poiId === props.activePoiId ? 'active' : ''}`
    button.textContent = labels.value[p.poiId] || '●'
    button.setAttribute('aria-label', `${p.name}${labels.value[p.poiId] ? ' '+labels.value[p.poiId] : ''}${selected ? '，已选' : '，未选'}`)
    button.disabled = !props.interactive
    const tooltip = document.createElement('span')
    tooltip.textContent = `${p.name} · ${p.type === 'ip' ? props.ipName || '圣地巡礼' : '其他知名景点'}`
    const marker = L.marker([p.lat, p.lng], { icon: L.divIcon({ html: button, className: 'travel-icon', iconSize: [40, 32], iconAnchor: [20, 16] }), keyboard: false, interactive: props.interactive, zIndexOffset: p.poiId === props.activePoiId ? 1000 : selected ? 100 : 0 }).addTo(pins)
    marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -14] })
    button.addEventListener('click', () => focus(p.poiId, true))
    button.addEventListener('focus', () => marker.openTooltip())
    button.addEventListener('mouseenter', () => emit('marker-hover', p.poiId))
    markers.set(p.poiId, marker)
  }
}
function connect() {
  if (!map) return
  clearTimeout(timer)
  if (tiles) { tiles.off(); tiles.getContainer()?.querySelectorAll('img').forEach(img => L.DomEvent.off(img)); map.removeLayer(tiles) }
  state.value = 'loading'
  const url = provider === 'Mapbox'
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}?access_token=${encodeURIComponent(token)}`
    : '/tiles/{z}/{x}/{y}.png' // 同源反代（生产经首尔服务器中转，国内直连稳定；本地 dev 由 vite 代理）
  const layer = L.tileLayer(url, { maxZoom: 19, ...(provider === 'Mapbox' ? { tileSize: 512, zoomOffset: -1, attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a>' } : {}) })
  tiles = layer
  const offline = () => { if (tiles !== layer) return; state.value = 'offline'; layer.off(); layer.setOpacity(0); clearTimeout(timer) }
  let loaded = 0
  layer.on('tileload', () => { loaded++; state.value = 'online'; clearTimeout(timer) })
  layer.on('load', () => { if (!loaded) offline() })
  timer = setTimeout(offline, 20000)
  layer.addTo(map)
}
onMounted(async () => {
  await loadLeaflet()
  map = L.map(host.value, { zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, zoomSnap: 0.25, scrollWheelZoom: false, zoomControl: false, dragging: true, touchZoom: true, doubleClickZoom: true, keyboard: true, boxZoom: true }).setView([31.227, 121.473], 13)
  map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>')
  map.createPane('localStreets').style.zIndex = 150
  L.geoJSON(streets, { pane: 'localStreets', style: f => ({ color: f.properties.waterway ? '#8cc4d3' : '#c7ac86', weight: f.properties.waterway ? 12 : 3, opacity: 0.85 }), onEachFeature: (f, layer) => { if (f.properties.name) { const el = document.createElement('span'); el.textContent = f.properties.name; layer.bindTooltip(el) } } }).addTo(map)
  pins = L.layerGroup().addTo(map)
  render(); fit(); connect()
  if (props.activePoiId) focus(props.activePoiId)
  observer = new ResizeObserver(() => map?.invalidateSize())
  observer.observe(host.value)
  applyInteractive()
})
watch(() => props.pois, () => { render(); fit() }, { deep: true })
watch([() => props.selectedIds, () => props.plan, () => props.activePoiId, () => props.interactive], render, { deep: true })
watch(() => props.activePoiId, id => { if (id) focus(id) })
watch(() => props.interactive, applyInteractive)
onBeforeUnmount(() => { clearTimeout(timer); observer?.disconnect(); tiles?.off(); tiles?.getContainer()?.querySelectorAll('img').forEach(img => L?.DomEvent.off(img)); map?.stop(); map?.remove(); map = null; markers.clear() })
</script>

<template>
  <section class="map-box" :aria-label="`${city}景点地图`">
    <div ref="host" class="map-canvas"></div>
    <div v-if="interactive" class="map-zoom" role="group" aria-label="地图缩放">
      <button type="button" title="放大" aria-label="放大地图" @click="zoomBy(1)">＋</button>
      <button type="button" title="缩小" aria-label="缩小地图" @click="zoomBy(-1)">－</button>
    </div>
    <div class="map-toolbar">
      <span class="map-status" role="status">{{ status }}</span>
      <button v-if="state === 'offline' && interactive" @click="connect">重试联网</button>
      <button v-if="interactive" @click="fit">查看全部</button>
    </div>
    <label v-if="interactive && valid.length" class="map-picker">
      定位景点
      <select v-model="picked" @change="focus(picked, true)">
        <option value="" disabled>选择景点（重叠点也可选）</option>
        <option v-for="p in valid" :key="p.poiId" :value="p.poiId">{{ labels[p.poiId] || '' }} {{ p.name }}</option>
      </select>
    </label>
    <div class="map-legend"><i class="gold"></i>圣地巡礼 <i class="red"></i>其他知名景点 <i></i>未选</div>
    <div v-if="!valid.length" class="map-empty">暂无有效坐标</div>
  </section>
</template>

<style>
.map-box { position: relative; width: 100%; height: 100%; isolation: isolate; overflow: hidden; border-radius: 14px; border: 1px solid #ded5c5; }
.map-canvas { width: 100%; height: 100%; background: #f4efe2; }
.map-toolbar { position: absolute; top: 10px; left: 52px; right: 10px; z-index: 800; display: flex; flex-wrap: wrap; gap: 5px; align-items: center; pointer-events: none; }
.map-toolbar > * { background: #fff; border-radius: 6px; padding: 5px 9px; font-size: 11px; box-shadow: 0 2px 8px #0002; pointer-events: auto; }
.map-toolbar button { color: #8d4036; cursor: pointer; }
.map-zoom { position: absolute; top: 10px; left: 10px; z-index: 810; display: flex; flex-direction: column; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px #0003; }
.map-zoom button { width: 36px; height: 36px; border: 0; border-bottom: 1px solid #e6e0d4; background: #fff; color: #8d4036; font-size: 17px; line-height: 1; cursor: pointer; }
.map-zoom button:last-child { border-bottom: 0; }
.map-zoom button:hover { background: #f7f2e9; }
.map-zoom button:focus-visible { outline: 2px solid var(--brand); outline-offset: -3px; }
.map-picker { position: absolute; left: 10px; bottom: 38px; z-index: 800; display: flex; align-items: center; gap: 6px; padding: 6px 9px; background: #fffffff2; border-radius: 6px; font-size: 11px; max-width: calc(100% - 20px); }
.map-picker select { min-width: 0; max-width: 230px; padding: 4px; border: 1px solid #ddd; border-radius: 4px; background: white; }
.map-legend { position: absolute; left: 10px; bottom: 12px; z-index: 800; background: #fffffff2; padding: 3px 6px; border-radius: 5px; font-size: 10px; display: flex; align-items: center; gap: 5px; }
.map-legend i { width: 8px; height: 8px; background: #89909a; border-radius: 50%; }.map-legend .gold { background: #af7a19; }.map-legend .red { background: #b54d40; }
.travel-pin { width: 40px; height: 32px; padding: 0; border: 2px solid white; border-radius: 16px; color: white; background: #89909a; font: bold 10px system-ui,sans-serif; box-shadow: 0 2px 7px #0005; cursor: pointer; }
.travel-pin.ip { background: #af7a19; }.travel-pin.classic { background: #b54d40; }.travel-pin.active,.travel-pin:focus-visible { outline: 3px solid #242e42; outline-offset: 2px; }
.map-empty { position: absolute; top: 45%; left: 35%; z-index: 700; background: white; padding: 10px; border-radius: 8px; }
.leaflet-container { font-family: inherit; }.leaflet-control-attribution { font-size: 9px !important; }
</style>
