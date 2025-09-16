<template>
  <!-- 给 FluentCard 加上 blue-card 类，整体底色变蓝 -->
  <FluentCard title="运输需求（地址输入）" class="mb-4 blue-card">
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
          <div class="row">
            <label>开始</label>
            <input v-model="winStart" type="datetime-local" required />
          </div>
          <div class="row">
            <label>结束</label>
            <input v-model="winEnd" type="datetime-local" required />
          </div>
        </div>
        <div class="section">
          <h4 class="sec-title">需求</h4>
          <div class="row">
            <label>类型</label>
            <select v-model="local.demand.type" required>
              <option value="" disabled>请选择</option>
              <option value="normal">普通</option>
              <option value="cold">冷链</option>
              <option value="hazmat">危化</option>
              <option value="fragile">易碎</option>
            </select>
          </div>
          <div class="row">
            <label>载重(kg)</label>
            <input v-model.number="local.demand.weightKg" type="number" min="1" required />
          </div>
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
import FluentCard from '@/components/FluentCard.vue'
import type { Query } from '@/types/recommend'

// props & emits（这里把 submit 的载荷类型设为 [Query]）
const props = defineProps<{ modelValue: Query }>()
const emit = defineEmits<{ 'update:modelValue':[Query], submit:[Query] }>()

// 本地表单状态
const local = reactive<Query>({
  origin: { lat: 0, lng: 0 },
  destination: { lat: 0, lng: 0 },
  window: ['', ''],
  demand: { type: 'normal', weightKg: 0, temperature: null }
})

// 父 -> 子 同步
watch(() => props.modelValue, (v) => {
  if (v) Object.assign(local, v)
}, { immediate: true, deep: true })

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

// --- 行政区（/public/data/locations.json） ---
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
    root.value = obj
    provinces.value = Object.keys(obj)
  } catch (e) {
    console.error('加载 locations.json 失败', e)
    root.value = {}; provinces.value = []
  }
}

function onProvinceChange(which:'from'|'to') {
  const prov = which==='from' ? from.province : to.province
  const obj = root.value[prov] || {}
  cities[which] = Object.keys(obj)
  districts[which] = []
  if (which==='from') {
    from.city=''; from.district=''
  } else {
    to.city=''; to.district=''
  }
}

function onCityChange(which:'from'|'to') {
  const prov = which==='from' ? from.province : to.province
  const city = which==='from' ? from.city     : to.city
  const arr  = (root.value[prov] || {})[city] || []
  districts[which] = arr
  if (which==='from') {
    from.district=''
  } else {
    to.district=''
  }
}

function fullAddress(o:{province:string;city:string;district:string;detail:string}) {
  return [o.province, o.city, o.district, o.detail].filter(Boolean).join('')
}

// --- 时间窗 ---
const winStart = ref('')
const winEnd   = ref('')
function initWindow() {
  const now = new Date()
  const s = new Date(now); s.setMinutes(0,0,0); s.setHours(s.getHours()+1)
  const e = new Date(s);   e.setHours(e.getHours()+4)
  winStart.value = s.toISOString().slice(0,16)
  winEnd.value   = e.toISOString().slice(0,16)
}

// 冷链温区
const tempMin = ref<number|null>(null)
const tempMax = ref<number|null>(null)
watch([tempMin, tempMax], ([a,b])=>{
  local.demand.temperature = (local.demand.type==='cold' && a!=null && b!=null) ? [a,b] : null
})

// --- 高德加载 & 地理编码 ---
// 动态加载 JSAPI 主脚本
async function loadAmap(): Promise<any> {
  if ((window as any).AMap) return (window as any).AMap;

  const key = (import.meta as any).env.VITE_AMAP_KEY;
  const sec = (import.meta as any).env.VITE_AMAP_SECURITY; // ← 你环境变量里用这个名字
  if (!key) throw new Error('请在 .env.local 设置 VITE_AMAP_KEY=你的高德Key');
  if (sec) (window as any)._AMapSecurityConfig = { securityJsCode: sec };

  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${key}`;
    s.async = true;
    s.onload = () => { console.log('[AMap] JSAPI loaded'); resolve(); };
    s.onerror = () => reject(new Error('AMap JSAPI 脚本加载失败'));
    document.head.appendChild(s);
  });
  return (window as any).AMap;
}

// 确保插件已加载
async function ensurePlugin(AMap: any, ...plugins: string[]) {
  return new Promise<void>((resolve) => {
    AMap.plugin(plugins, () => {
      console.log('[AMap] plugins ready:', plugins);
      resolve();
    });
  });
}

// 单次地理编码
async function geocodeOnce(AMap: any, address: string): Promise<[number, number]> {
  await ensurePlugin(AMap, 'AMap.Geocoder');
  return new Promise((resolve, reject) => {
    const geocoder = new AMap.Geocoder({ city: '全国' });
    geocoder.getLocation(address, (status: string, result: any) => {
      console.log('[AMap] geocode status=', status, result);
      if (status === 'complete' && result?.geocodes?.length) {
        const { lng, lat } = result.geocodes[0].location;
        resolve([lng, lat]);
      } else {
        reject(new Error('地址解析失败: ' + address));
      }
    });
  });
}

// --- 提交 / 重置 ---
async function onSubmit() {
  const originAddr = fullAddress(from);
  const destAddr   = fullAddress(to);
  if (!originAddr || !destAddr) { alert('请完善出发地与目的地'); return; }

  console.log('[Form] submit clicked', { originAddr, destAddr });

  try {
    const AMap = await loadAmap();
    const [oLng, oLat] = await geocodeOnce(AMap, originAddr);
    const [dLng, dLat] = await geocodeOnce(AMap, destAddr);

    local.origin      = { lat:oLat, lng:oLng };
    local.destination = { lat:dLat, lng:dLng };
    local.window      = [new Date(winStart.value).toISOString(), new Date(winEnd.value).toISOString()];

    const payload = JSON.parse(JSON.stringify(local)) as Query; // 深拷贝，拿到纯数据
    emit('update:modelValue', payload);                         // 先同步 v-model
    console.log('[Form] emit submit with query:', payload);
    emit('submit', payload);                                    // 再带参提交（父层用这个最稳）
  } catch (e: any) {
    console.error('[Form] submit error', e);
    alert(e?.message || '地理编码失败，请检查浏览器扩展/网络后重试');
  }
}

function onReset() {
  from.province = from.city = from.district = from.detail = ''
  to.province   = to.city   = to.district   = to.detail   = ''
  initWindow()

  const cleared = clone({
    ...local,
    origin: { lat: 0, lng: 0 },
    destination: { lat: 0, lng: 0 },
    window: ['', ''],
    demand: { type: '', weightKg: 0, temperature: null }
  })
  emit('update:modelValue', cleared as Query)
}

onMounted(()=>{ loadLocations(); initWindow() })
</script>

<style scoped>
/* ===== 主题色（蓝色） ===== */
:host, .blue-card {
  --blue-surface: rgba(54, 98, 219, 0.88);
  --blue-field:   rgba(54, 86, 153, 0.95);
  --blue-hover:   #1e40af;
  --blue-border:  rgba(255,255,255,0.28);
  --blue-focus:   rgba(255,255,255,0.22);
  --text-on-blue: #fff;
  --text-subtle:  rgba(255,255,255,0.85);
}

.blue-card {
  background: var(--blue-surface) !important;
  border: 1px solid var(--blue-border);
  color: var(--text-on-blue);
  backdrop-filter: blur(2px);
  border-radius: 12px;
}

.sec-title { margin:4px 0 6px; color: var(--text-on-blue); font-weight:600; }
.row label { width:84px; color: var(--text-on-blue); }

input, select, textarea {
  flex: 1;
  padding: 8px 10px;
  background: var(--blue-field);
  color: var(--text-on-blue);
  border: 1px solid var(--blue-border);
  border-radius: 8px;
  outline: none;
}
input::placeholder, textarea::placeholder { color: var(--text-subtle); }

input:focus, select:focus, textarea:focus {
  border-color: #fff;
  box-shadow: 0 0 0 3px var(--blue-focus);
}

input:disabled, select:disabled, textarea:disabled {
  opacity: .9;
  background: rgba(37,99,235,0.6);
  cursor: not-allowed;
}

select { color: var(--text-on-blue); }
option { color: #111; }

.actions { display:flex; gap:8px; justify-content:flex-end; margin-top:8px; }
.btn {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid var(--blue-border);
  background: var(--blue-field);
  color: var(--text-on-blue);
  cursor: pointer;
  transition: filter .15s ease, transform .02s ease;
}
.btn.primary { background: var(--blue-field); }
.btn:hover { filter: brightness(1.05); }
.btn:active { transform: translateY(1px); }

.grid{display:grid}.grid-cols-2{grid-template-columns:1fr 1fr}.gap-12{gap:12px}
.gap-3{gap:12px}.mb-4{margin-bottom:16px}
.section{display:flex;flex-direction:column;gap:8px}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.row{display:flex;align-items:center;gap:8px;margin:6px 0}
</style>
