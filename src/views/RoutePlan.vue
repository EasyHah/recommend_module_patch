<template>
  <div class="page">
    <div class="grid grid-cols-2 gap-12">
      <FluentCard title="路径规划">
        <div class="form-col">
          <div class="row">
            <label>起点</label>
            <input v-model="originInput" placeholder="地址 或 lat,lng（逗号分隔）" />
          </div>
          <div class="row">
            <label>终点</label>
            <input v-model="destinationInput" placeholder="地址 或 lat,lng（逗号分隔）" />
          </div>

          <div class="row">
            <label>时间窗开始</label>
            <input v-model="winStart" type="datetime-local" />
          </div>
          <div class="row">
            <label>时间窗结束</label>
            <input v-model="winEnd" type="datetime-local" />
          </div>

          <div class="btn-row">
            <button class="btn primary" @click="calcRoute">规划路线</button>
            <button class="btn" :disabled="!routeReady" @click="pushToRecommend">用此路线做推荐</button>
          </div>

          <p v-if="error" class="error">{{ error }}</p>
          <ul v-if="routeReady" class="metrics">
            <li>总距离：<b>{{ distanceKm.toFixed(2) }}</b> km</li>
            <li>预计时长：<b>{{ durationMin.toFixed(0) }}</b> 分钟</li>
            <li>来源：<b>{{ provider }}</b></li>
          </ul>
        </div>
      </FluentCard>

      <FluentCard title="地图">
        <div id="amap-container" class="map"></div>
      </FluentCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { publishBridge } from '@/bridge/routeBridge'
import type { LatLng } from '@/types/recommend'

type AMapLike = any // 避免引入类型依赖

const originInput = ref('上海市人民广场')
const destinationInput = ref('浦东国际机场')
const winStart = ref(new Date(Date.now()+10*60*1000).toISOString().slice(0,16)) // 默认10分钟后
const winEnd = ref(new Date(Date.now()+3*60*60*1000).toISOString().slice(0,16))  // 默认三小时内

const map = ref<AMapLike | null>(null)
const geocoder = ref<AMapLike | null>(null)
const driving = ref<AMapLike | null>(null)
const routeReady = ref(false)
const distanceKm = ref(0)
const durationMin = ref(0)
const provider = ref('amap')
const error = ref('')

function parseLatLng(s: string): LatLng | null {
  const m = s.split(',').map(t => t.trim())
  if (m.length === 2) {
    const lat = Number(m[0]), lng = Number(m[1])
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng }
  }
  return null
}

async function loadAmap(): Promise<any> {
  if ((window as any).AMap) return (window as any).AMap
  const key = import.meta.env.VITE_AMAP_KEY
  const sec = (import.meta as any).env.VITE_AMAP_SECURITY
  if (!key) {
    error.value = '请在 .env.local 设置 VITE_AMAP_KEY=你的高德Key'
    throw new Error(error.value)
  }
  if (sec) (window as any)._AMapSecurityConfig = { securityJsCode: sec }
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${key}`
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('AMap 加载失败'))
    document.head.appendChild(s)
  })
  return (window as any).AMap
}

async function ensureServices(AMap: any) {
  if (!geocoder.value || !driving.value) {
    await new Promise<void>(res => {
      AMap.plugin(['AMap.Geocoder','AMap.Driving'], () => res())
    })
    geocoder.value = new AMap.Geocoder()
    driving.value = new AMap.Driving({ map: map.value, policy: AMap.DrivingPolicy.LEAST_TIME })
  }
}

async function geocode(AMap: any, s: string): Promise<any> {
  const ll = parseLatLng(s)
  if (ll) return new AMap.LngLat(ll.lng, ll.lat)
  return new Promise((resolve, reject) => {
    geocoder.value.getLocation(s, (status: string, result: any) => {
      if (status === 'complete' && result.geocodes?.length) {
        resolve(result.geocodes[0].location)
      } else {
        reject(new Error('地理编码失败: ' + s))
      }
    })
  })
}

async function calcRoute() {
  try {
    error.value = ''
    const AMap = await loadAmap()
    if (!map.value) {
      map.value = new AMap.Map('amap-container', { zoom: 11, center: [121.47,31.23] })
    }
    await ensureServices(AMap)
    const o = await geocode(AMap, originInput.value)
    const d = await geocode(AMap, destinationInput.value)

    await new Promise<void>((resolve, reject) => {
      driving.value.search(o, d, (status: string, result: any) => {
        if (status === 'complete' && result?.routes?.length) {
          const r = result.routes[0]
          distanceKm.value = r.distance / 1000
          durationMin.value = r.time / 60
          routeReady.value = true
          resolve()
        } else {
          reject(new Error('路径规划失败'))
        }
      })
    })
  } catch (e: any) {
    error.value = e?.message || String(e)
    routeReady.value = false
  }
}

function pushToRecommend() {
  if (!routeReady.value) return
  // 简化：用 geocoder 再解一次，保证桥接有经纬度
  loadAmap().then(async (AMap: any) => {
    const o = await geocode(AMap, originInput.value)
    const d = await geocode(AMap, destinationInput.value)
    const origin = { lat: o.lat, lng: o.lng }
    const destination = { lat: d.lat, lng: d.lng }
    publishBridge({
      origin, destination,
      route: {
        distanceKm: distanceKm.value,
        durationMin: durationMin.value,
        waypoints: [], provider: provider.value,
        updatedAt: new Date().toISOString()
      },
      window: [new Date(winStart.value).toISOString(), new Date(winEnd.value).toISOString()]
    })
    alert('路线已推送到推荐页，打开“商家推荐”并点击“从路径读取”。')
  })
}

onMounted(async () => {
  try {
    const AMap = await loadAmap()
    map.value = new AMap.Map('amap-container', { zoom: 11, center: [121.47,31.23] })
  } catch(e) {
    // ignore; 等用户点击时再尝试
  }
})
</script>

<style scoped>
.page{ padding: 8px; display:flex; flex-direction:column; gap:12px; }
.form-col{ display:flex; flex-direction:column; gap:10px; }
.row{ display:grid; grid-template-columns: 100px 1fr; gap:10px; align-items:center; }
.btn-row{ display:flex; gap:8px; }
.btn{ padding:8px 12px; border-radius:8px; border:1px solid #ddd; background:#fff; cursor:pointer; }
.btn.primary{ background:#2f7cf6; color:#fff; border-color:#2f7cf6; }
.btn:disabled{ opacity:.5; cursor:not-allowed; }
.error{ color:#d33; margin-top:6px; }
.metrics{ margin-top:8px; opacity:.85; }
.map{ width: 100%; height: 560px; border-radius: 12px; border: 1px solid rgba(0,0,0,.08); overflow:hidden; }
</style>
