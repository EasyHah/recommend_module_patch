<template>
  <div ref="mapEl" class="amap-container"></div>
</template>
<script setup lang="ts">
import { ref, onMounted, watch, defineExpose } from 'vue'
import AMapLoader from '@amap/amap-jsapi-loader'
type LngLat = { lng:number; lat:number }
type Mode = 'driving' | 'walking' | 'riding' | 'transit' | 'truck'
const props = defineProps<{ origin?: LngLat; destination?: LngLat; mode?: Mode }>()
const mapEl = ref<HTMLDivElement|null>(null)
let AMap:any, map:any, routeService:any, routeOverlays:any[]=[]
async function initMap(){
  AMap = await AMapLoader.load({ key: import.meta.env.VITE_AMAP_KEY, version:'2.0', plugins:['AMap.Driving','AMap.Walking','AMap.Riding','AMap.Transfer','AMap.TruckDriving']})
  map = new AMap.Map(mapEl.value!,{ viewMode:'2D', zoom:11, resizeEnable:true, jogEnable:true, defaultCursor:'pointer' })
  await prepareService(props.mode ?? 'driving')
}
async function prepareService(mode:Mode){
  try{ routeService?.clear?.() }catch{} routeService=null
  if(mode==='driving'){ routeService = new AMap.Driving({ map, showTraffic:false, policy: AMap.DrivingPolicy.LEAST_TIME })}
  else if(mode==='walking'){ routeService = new AMap.Walking({ map })}
  else if(mode==='riding'){ routeService = new AMap.Riding({ map })}
  else if(mode==='transit'){ routeService = new AMap.Transfer({ map, city:'全国' })}
  else if(mode==='truck'){ routeService = new AMap.TruckDriving({ map, size:4 })}
}
function clearRoute(){ routeOverlays.forEach(o=>map.remove(o)); routeOverlays=[]; try{ routeService?.clear?.() }catch{} }
function drawPolyline(path:any[]){ const polyline = new AMap.Polyline({ path, strokeOpacity:0.9, strokeWeight:6 }); map.add(polyline); routeOverlays.push(polyline); map.setFitView(routeOverlays,false,[80,80,80,380]); }
async function route(origin:LngLat, destination:LngLat, mode:Mode=props.mode??'driving'){ if(!AMap||!map) return; await prepareService(mode); clearRoute(); const o=new AMap.LngLat(origin.lng,origin.lat), d=new AMap.LngLat(destination.lng,destination.lat); if(mode==='transit'){ routeService.search(o,d,(s:string,r:any)=>{ if(s!=='complete'||!r) return; const path=r.plans?.[0]?.segments?.flatMap((x:any)=>x.transit?.path||[])||[]; if(path.length) drawPolyline(path) }) } else { routeService.search(o,d,(s:string,r:any)=>{ if(s!=='complete'||!r) return; const path=r.routes?.[0]?.polyline || r.paths?.[0]?.steps?.flatMap((x:any)=>x.polyline)||[]; if(path.length) drawPolyline(path) }) } }
onMounted(initMap)
watch(()=>[props.origin,props.destination,props.mode],v=>{ const [o,d,m]=v; if(o&&d) route(o as LngLat,d as LngLat,(m as Mode)||'driving') })
defineExpose({ route, clearRoute })
</script>
<style scoped>.amap-container{ width:100%; height:68vh; border-radius:10px; }</style>