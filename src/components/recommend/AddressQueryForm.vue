<template>
  <FluentCard title="运输需求（地址输入）" class="mb-4">
    <form @submit.prevent="onSubmit" class="grid gap-3">
      <!-- 出发地 -->
      <div class="section">
        <h4 class="sec-title">出发地</h4>
        <div class="grid-3">
          <select v-model="from.province" @change="onProvinceChange('from')" required>
            <option value="" disabled>请选择省</option>
            <option v-for="p in provinces" :key="'p-'+p" :value="p">{{ p }}</option>
          </select>
          <select v-model="from.city" :disabled="!cities.from.length" @change="onCityChange('from')" required>
            <option value="" disabled>请选择市</option>
            <option v-for="c in cities.from" :key="'c-'+c" :value="c">{{ c }}</option>
          </select>
          <select v-model="from.district" :disabled="!districts.from.length">
            <option value="" disabled>请选择区</option>
            <option v-for="d in districts.from" :key="'d-'+d" :value="d">{{ d }}</option>
          </select>
        </div>
        <input v-model="from.detail" placeholder="输入街道、门牌号等详细信息" />
      </div>

      <!-- 目的地 -->
      <div class="section">
        <h4 class="sec-title">目的地</h4>
        <div class="grid-3">
          <select v-model="to.province" @change="onProvinceChange('to')" required>
            <option value="" disabled>请选择省</option>
            <option v-for="p in provinces" :key="'pp-'+p" :value="p">{{ p }}</option>
          </select>
          <select v-model="to.city" :disabled="!cities.to.length" @change="onCityChange('to')" required>
            <option value="" disabled>请选择市</option>
            <option v-for="c in cities.to" :key="'cc-'+c" :value="c">{{ c }}</option>
          </select>
          <select v-model="to.district" :disabled="!districts.to.length">
            <option value="" disabled>请选择区</option>
            <option v-for="d in districts.to" :key="'dd-'+d" :value="d">{{ d }}</option>
          </select>
        </div>
        <input v-model="to.detail" placeholder="输入街道、门牌号等详细信息" />
      </div>

      <div class="grid grid-cols-2 gap-12">
        <div class="section">
          <h4 class="sec-title">时间窗</h4>
          <div class="row"><label>开始</label><input v-model="winStart" type="datetime-local" required /></div>
          <div class="row"><label>结束</label><input v-model="winEnd" type="datetime-local" required /></div>
        </div>
        <div class="section">
          <h4 class="sec-title">需求</h4>
          <div class="row"><label>类型</label>
            <select v-model="local.demand.type" required>
              <option value="" disabled>请选择</option>
              <option value="normal">普通</option>
              <option value="cold">冷链</option>
              <option value="hazmat">危化</option>
              <option value="fragile">易碎</option>
            </select>
          </div>
          <div class="row"><label>载重(kg)</label><input v-model.number="local.demand.weightKg" type="number" min="1" required /></div>
          <div class="row" v-if="local.demand.type==='cold'">
            <label>温区(℃)</label>
            <div class="inline">
              <input v-model.number="tempMin" type="number" step="0.1" placeholder="min" />
              <span class="sep">~</span>
              <input v-model.number="tempMax" type="number" step="0.1" placeholder="max" />
            </div>
          </div>
        </div>
      </div>

      <div class="actions">
        <button type="submit" class="btn primary">规划 / 查询</button>
        <button type="button" class="btn" @click="onReset">清除</button>
      </div>
    </form>
  </FluentCard>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue'
import type { Query } from '@/types/recommend'

const props = defineProps<{ modelValue: Query }>()
const emit = defineEmits<{ 'update:modelValue':[Query], submit:[] }>()

const local = reactive<Query>(structuredClone(props.modelValue))
watch(() => props.modelValue, (v)=>Object.assign(local, structuredClone(v)), { deep:true })
watch(local, (v)=>emit('update:modelValue', structuredClone(v)), { deep:true })

// locations.json 结构： [ { 省: { 市: [区...] }, ... } ]
type Root = Record<string, Record<string, string[]>>
const root = ref<Root>({})
const provinces = ref<string[]>([])
const cities = reactive({ from: [] as string[], to: [] as string[] })
const districts = reactive({ from: [] as string[], to: [] as string[] })

const from = reactive({ province:'', city:'', district:'', detail:'' })
const to   = reactive({ province:'', city:'', district:'', detail:'' })

async function loadLocations() {
  try {
    const res = await fetch('/data/locations.json', { cache:'force-cache' })
    const data = await res.json()
    const obj: Root = Array.isArray(data) ? (data[0] || {}) : data
    root.value = obj; provinces.value = Object.keys(obj)
  } catch (e) { root.value = {}; provinces.value = [] }
}
function onProvinceChange(which:'from'|'to') {
  const prov = which==='from' ? from.province : to.province
  const obj = root.value[prov] || {}
  const list = Object.keys(obj)
  cities[which] = list; districts[which] = []
  if (which==='from') { from.city=''; from.district='' } else { to.city=''; to.district='' }
}
function onCityChange(which:'from'|'to') {
  const prov = which==='from' ? from.province : to.province
  const city = which==='from' ? from.city     : to.city
  const arr  = (root.value[prov] || {})[city] || []
  districts[which] = arr
  if (which === 'from') {
    from.district = ''
  } else {
    to.district = ''
  }
}

function fullAddress(o:{province:string;city:string;district:string;detail:string}) {
  return [o.province, o.city, o.district, o.detail].filter(Boolean).join('')
}

const winStart = ref('')
const winEnd   = ref('')
function initWindow() {
  const now = new Date(); const s = new Date(now); s.setMinutes(0,0,0); s.setHours(s.getHours()+1)
  const e = new Date(s);   e.setHours(s.getHours()+4)
  winStart.value = s.toISOString().slice(0,16)
  winEnd.value   = e.toISOString().slice(0,16)
}

const tempMin = ref<number|null>(null)
const tempMax = ref<number|null>(null)
watch([tempMin, tempMax], ([a,b])=>{
  local.demand.temperature = (local.demand.type==='cold' && a!=null && b!=null) ? [a,b] : null
})

async function loadAmap(): Promise<any> {
  if ((window as any).AMap) return (window as any).AMap
  const key = (import.meta as any).env.VITE_AMAP_KEY
  const sec = (import.meta as any).env.VITE_AMAP_SECURITY
  if (!key) throw new Error('请在 .env.local 设置 VITE_AMAP_KEY=你的高德Key')
  if (sec) (window as any)._AMapSecurityConfig = { securityJsCode: sec }
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${key}`
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('AMap script load failed'))
    document.head.appendChild(s)
  })
  return (window as any).AMap
}
function geocodeOnce(AMap:any, address:string): Promise<[number,number]> {
  return new Promise((resolve, reject) => {
    const geocoder = new AMap.Geocoder()
    geocoder.getLocation(address, (status:string, result:any) => {
      if (status === 'complete' && result?.geocodes?.length) {
        const {lng, lat} = result.geocodes[0].location
        resolve([lng, lat])
      } else reject(new Error('地址解析失败: '+address))
    })
  })
}

async function onSubmit() {
  const originAddr = fullAddress(from)
  const destAddr   = fullAddress(to)
  if (!originAddr || !destAddr) { alert('请完善出发地与目的地'); return }
  try {
    const AMap = await loadAmap()
    const [oLng, oLat] = await geocodeOnce(AMap, originAddr)
    const [dLng, dLat] = await geocodeOnce(AMap, destAddr)
    local.origin = { lat:oLat, lng:oLng }
    local.destination = { lat:dLat, lng:dLng }
    local.window = [new Date(winStart.value).toISOString(), new Date(winEnd.value).toISOString()]
    emit('submit')
  } catch (e:any) { alert(e?.message || '地理编码失败，请稍后重试') }
}
function onReset() {
  from.province = from.city = from.district = from.detail = ''
  to.province   = to.city   = to.district   = to.detail   = ''
  initWindow()
}
onMounted(()=>{ loadLocations(); initWindow() })
</script>

<style scoped>
.grid{display:grid}.grid-cols-2{grid-template-columns:1fr 1fr}.gap-12{gap:12px}
.gap-3{gap:12px}.mb-4{margin-bottom:16px}
.section{display:flex;flex-direction:column;gap:8px}
.sec-title{margin:4px 0 6px;color:#333;font-weight:600}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.row{display:flex;align-items:center;gap:8px;margin:6px 0}
.row label{width:84px;color:#555}
.row input,.row select, input, select{flex:1;padding:8px 10px;border:1px solid #ddd;border-radius:8px;background:#fff}
.inline{display:flex;align-items:center;gap:6px}.sep{color:#999}
.actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}
.btn{padding:8px 14px;border-radius:10px;border:1px solid #ddd;background:#fff}
.btn.primary{background:#2962ff;color:#fff;border-color:#2962ff}
</style>