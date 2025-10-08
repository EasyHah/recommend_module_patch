import { ref } from 'vue'
// 运行时按需引入 Cesium (与 MapView 中一致)
// @ts-ignore
import * as Cesium from 'cesium'

interface HubPosition { centerId:string; code:string; lat:number; lon:number; height?:number }
interface PositionsData { schemaVersion:number; hubs:HubPosition[] }

const positions = ref<HubPosition[]>([])
let loaded = false

export function useLogisticsPositions(){
  async function load(force=false){
    if (loaded && !force) return
    const res = await fetch('/data/logistics-positions.json?_=' + Date.now())
    const json:PositionsData = await res.json()
    positions.value = json.hubs || []
    loaded = true
  }
  function get(centerId:string, code:string){
    return positions.value.find(p => p.centerId===centerId && p.code===code) || null
  }
  function toEntity(hub:any, centerId:string){
    const p = get(centerId, hub.code)
    if (!p) return null
    return {
      id: `${centerId}-${hub.code}`,
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height||0),
      point: { pixelSize: 10, color: Cesium.Color.ORANGE },
      label: { text: `${hub.code}号 ${hub.name}`, font: '14px sans-serif', fillColor: Cesium.Color.WHITE, outlineWidth:2, outlineColor:Cesium.Color.BLACK }
    }
  }
  return { positions, load, get, toEntity }
}
