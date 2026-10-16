<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'
const props=defineProps({center:{type:Array,default:()=>[31.23,121.47]},selected:Object})
const emit=defineEmits(['pick'])
const host=ref(null),failed=ref(false)
let map,observer,alive=true,movedByUser=false
function render(){
 if(!map||!props.selected)return
 const {lat,lng}=props.selected,current=map.getCenter()
 if(Math.abs(current.lat-lat)<.000001&&Math.abs(current.lng-lng)<.000001)return
 map.setView([lat,lng],Math.max(map.getZoom(),16),{animate:false})
}
onMounted(async()=>{
 try{
 const L=(await import('leaflet')).default;if(!alive)return
 map=L.map(host.value,{scrollWheelZoom:false}).setView(props.center,14)
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19}).on('tileerror',()=>failed.value=true).addTo(map)
 map.on('dragstart',()=>movedByUser=true)
 map.on('moveend',()=>{if(!movedByUser)return;movedByUser=false;const p=map.getCenter();if(props.selected&&Math.abs(p.lat-props.selected.lat)<.000001&&Math.abs(p.lng-props.selected.lng)<.000001)return;emit('pick',{lat:p.lat,lng:p.lng})})
 map.on('click',e=>{movedByUser=true;map.panTo(e.latlng,{animate:false})})
 observer=new ResizeObserver(()=>map.invalidateSize({pan:false}));observer.observe(host.value);render()
 }catch{failed.value=true}
})
watch(()=>props.selected,render)
watch(()=>props.center,value=>{if(map&&!props.selected)map.setView(value,13,{animate:false})})
onBeforeUnmount(()=>{alive=false;observer?.disconnect();map?.remove()})
</script>
<template><div class="picker-wrap"><div class="map-frame"><div ref="host" class="picker-map" aria-label="拖动地图选择地点"/><span class="center-pin" aria-hidden="true">📍</span></div><p v-if="failed" class="map-warning">地图暂无法加载，请从上方地址列表选择地点。</p><p v-else class="map-caption">拖动地图，将目标位置移到标记下方</p></div></template>
<style scoped>.map-frame{position:relative}.picker-map{height:250px;border-radius:12px;z-index:0;background:#eeece7}.center-pin{position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);font-size:36px;line-height:1;pointer-events:none;filter:drop-shadow(0 3px 3px #0002)}.map-caption,.map-warning{font-size:11px;color:var(--ink-2);padding:8px 0}.map-warning{color:var(--brand)}</style>
