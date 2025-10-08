<template>
  <teleport to="body">
    <div class="rec-overlay" v-show="isOpen" @click.self="closeRecommend"></div>

    <aside
      ref="asideRef"
      class="rec-sidebar"
      :class="{ open: isOpen }"
      role="complementary"
      aria-label="商家推荐侧栏"
    >
      <header class="rec-header">
        <div class="left">
          <h3>商家推荐</h3>
          <span class="count" v-if="matches.length">候选 {{ matches.length }} 家</span>
          <label class="weather-toggle">
            <input type="checkbox" v-model="useEnhancedRecommend" @change="runQuery">
            <span>智能天气分析</span>
          </label>
        </div>
        <div class="actions">
          <button class="btn small" @click="pullFromRoute">从路径读取</button>
          <button class="btn small weather" @click="goToWeatherAnalysis">🌤️ 天气分析</button>
          <button class="btn small ghost" @click="closeRecommend">关闭</button>
        </div>
      </header>

      <section class="rec-body">
  <RecQueryForm ref="recFormRef" v-model="query" @submit="handleSubmit" />
        
        <!-- 天气建议面板 -->
        <div v-if="useEnhancedRecommend && weatherRecommendations.summary" class="weather-panel">
          <div class="weather-summary">
            <h4>🌤️ 天气分析</h4>
            <p>{{ weatherRecommendations.summary }}</p>
          </div>
          
          <div v-if="weatherRecommendations.riskAlerts.length" class="risk-alerts">
            <h5>⚠️ 风险提醒</h5>
            <ul>
              <li v-for="alert in weatherRecommendations.riskAlerts" :key="alert" class="alert-item">
                {{ alert }}
              </li>
            </ul>
          </div>
          
          <div v-if="weatherRecommendations.recommendations.length" class="weather-recommendations">
            <h5>💡 建议措施</h5>
            <ul>
              <li v-for="rec in weatherRecommendations.recommendations" :key="rec">
                {{ rec }}
              </li>
            </ul>
          </div>
        </div>
        
  <RecResultTable :items="matches" @add-compare="addCompare" @focus-vendor="focusVendor" />
      </section>

      <footer class="rec-footer">
        <div class="compare" v-if="compareList.length">
          <div class="label">对比区（{{ compareList.length }}）</div>
          <div class="chips">
            <div class="chip" v-for="v in compareList" :key="v.id">
              <span>{{ v.name }}</span>
              <button class="x" @click="removeCompare(v.id)">×</button>
            </div>
          </div>
        </div>
        <div v-else class="placeholder">从上方列表点击“加入对比”</div>
      </footer>

      <div class="resize-handle" @mousedown="startResize" title="拖拽调整宽度"></div>
    </aside>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import RecQueryForm from '@/components/recommend/RecQueryForm.vue'
import RecResultTable from '@/components/recommend/RecResultTable.vue'
import type { Query, Vendor, MatchItem } from '@/types/recommend'
import type { EnhancedQuery, EnhancedMatchItem } from '@/types/weather'
import { matchVendors } from '@/utils/recommendScore'
import { selectVendorForMap } from '@/bridge/recommendMapBus'
import { enhancedMatchVendors, getWeatherRecommendations } from '@/utils/enhancedRecommendScore'
import { recommendSidebarOpen, closeRecommend, openRecommend } from '@/bridge/recommendUI'
import { getBridge, subscribeBridge, publishBridge } from '@/bridge/routeBridge'
import { onVoiceCommand } from '@/bridge/voiceBus'
import { parseCommand, ParsedCommand } from '@/utils/voiceCommands'

const router = useRouter()

// 路由器调试
console.log('RecommendSidebar 初始化 - 路由器:', router)

const isOpen = computed(() => recommendSidebarOpen.value)

const vendors = ref<Vendor[]>([])
const matches = ref<EnhancedMatchItem[]>([])
const compareList = ref<Vendor[]>([])
const weatherRecommendations = ref<{ summary: string; recommendations: string[]; riskAlerts: string[] }>({ 
  summary: '', 
  recommendations: [], 
  riskAlerts: [] 
})
const useEnhancedRecommend = ref(true) // 默认启用天气增强推荐

const query = ref<EnhancedQuery>({
  origin: { lat: 31.2304, lng: 121.4737 },
  destination: { lat: 31.1443, lng: 121.8091 },
  window: [new Date().toISOString(), new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()],
  demand: { type: 'normal', weightKg: 500, temperature: null },
  weatherConsideration: {
    enabled: true,
    priority: 'medium',
    avoidSevereWeather: true,
    temperatureRange: [-10, 40]
  }
})

async function loadVendors() {
  const sources = ['/data/vendors-with-warehouse.json','/data/vendors.json']
  for(const url of sources){
    try {
      // 尝试使用本地缓存（一天过期）
      const cacheKey = 'vendorsCache:'+url
      const cacheMetaKey = cacheKey+':meta'
      const metaRaw = localStorage.getItem(cacheMetaKey)
      let meta: any = null
      if(metaRaw){
        try { meta = JSON.parse(metaRaw) } catch {}
      }
      const now = Date.now()
      const cacheValid = meta && meta.expire > now
      if(cacheValid){
        const cached = localStorage.getItem(cacheKey)
        if(cached){
          try {
            vendors.value = JSON.parse(cached)
            console.info('[RecommendSidebar] 使用本地缓存 vendors, 数量=', vendors.value.length)
            // 异步后台刷新
            refreshVendorsInBackground(url, cacheKey, cacheMetaKey)
            attachTestHelper()
            return
          } catch {}
        }
      }
      const res = await fetch(url, { cache:'no-store' })
      if(!res.ok) throw new Error(res.status+'')
      vendors.value = await res.json()
      console.info('[RecommendSidebar] 使用数据源:', url, '共', vendors.value.length, '条')
      try {
        localStorage.setItem(cacheKey, JSON.stringify(vendors.value))
        localStorage.setItem(cacheMetaKey, JSON.stringify({ expire: now + 24*60*60*1000, ver: vendors.value.length }))
      } catch {}
      attachTestHelper()
      // 挂载调试函数：window.testFlyVendor('vl0007')
      return
    } catch(e) { /* try next */ }
  }
  vendors.value = []
  console.warn('[RecommendSidebar] 未能加载 vendors 数据')
}

async function refreshVendorsInBackground(url:string, cacheKey:string, cacheMetaKey:string){
  try {
    const r = await fetch(url, { cache:'no-store' })
    if(!r.ok) return
    const fresh = await r.json()
    const oldLen = vendors.value.length
    if(fresh.length !== oldLen){
      console.info('[RecommendSidebar] 后台刷新 vendors，新长度=', fresh.length)
      vendors.value = fresh
      localStorage.setItem(cacheKey, JSON.stringify(fresh))
      localStorage.setItem(cacheMetaKey, JSON.stringify({ expire: Date.now()+24*60*60*1000, ver:fresh.length }))
    }
  } catch {}
}

function attachTestHelper(){
  try {
    ;(window as any).testFlyVendor = (id:string)=>{
      const v = vendors.value.find(x=> x.id === id)
      if(!v){ console.warn('[testFlyVendor] 未找到 id', id); return }
      focusVendor(v)
      console.info('[testFlyVendor] 已选择并飞行到仓库:', id)
    }
  } catch {}
}

async function runQuery() {
  if (!vendors.value.length) { console.warn('[RecommendSidebar] 无 vendors 数据，跳过匹配'); return }
  console.debug('[RecommendSidebar] 开始匹配 vendors, 数量=', vendors.value.length)
  
  try {
    if (useEnhancedRecommend.value && query.value.weatherConsideration?.enabled) {
      // 使用增强推荐算法
      matches.value = await enhancedMatchVendors(query.value, vendors.value)
      console.debug('[RecommendSidebar] 增强算法返回', matches.value.length, '条')
      
      // 获取天气建议
      weatherRecommendations.value = getWeatherRecommendations(query.value, matches.value)
    } else {
      // 使用基础推荐算法
      const basicMatches = matchVendors(query.value as Query, vendors.value)
  matches.value = basicMatches.map(m => ({ ...m, weatherScore: undefined, weatherFactors: [], weatherRisk: 'low' as const }))
  console.debug('[RecommendSidebar] 基础算法返回', matches.value.length, '条')
      weatherRecommendations.value = { summary: '未启用天气分析', recommendations: [], riskAlerts: [] }
    }
  } catch (error) {
    console.error('推荐算法执行失败:', error)
    // 降级到基础算法
    const basicMatches = matchVendors(query.value as Query, vendors.value)
    matches.value = basicMatches.map(m => ({ ...m, weatherScore: undefined, weatherFactors: [], weatherRisk: 'low' as const }))
    weatherRecommendations.value = { summary: '天气服务异常，使用基础推荐', recommendations: [], riskAlerts: [] }
  }
}

function handleSubmit(q: EnhancedQuery) {
  if (q) query.value = { ...query.value, ...q }
  runQuery()
  publishBridge({
    origin: q.origin,
    destination: q.destination,
    route: (q as any).route || null,
    window: q.window
  })
}
function addCompare(v: Vendor) {
  if (!compareList.value.find(x => x.id === v.id)) compareList.value.push(v)
}
function focusVendor(v: Vendor){
  // 通知地图高亮并关闭侧栏
  selectVendorForMap(v)
  closeRecommend()
}
function removeCompare(id: string) {
  compareList.value = compareList.value.filter(v => v.id !== id)
}
function pullFromRoute() {
  const data = getBridge?.()
  if (!data) return
  query.value.origin = data.origin
  query.value.destination = data.destination
  ;(query.value as any).route = data.route
  if (data.window) query.value.window = data.window
  runQuery()
}

function goToWeatherAnalysis() {
  console.log('=== 开始天气分析导航 ===')
  
  try {
    console.log('当前查询数据:', query.value)

    // 构建URL参数
    const urlParams = new URLSearchParams()
    urlParams.set('showRoute', 'true')
    
    if (query.value?.origin?.lat && query.value?.origin?.lng) {
      urlParams.set('origin', `${query.value.origin.lat},${query.value.origin.lng}`)
    }
    
    if (query.value?.destination?.lat && query.value?.destination?.lng) {
      urlParams.set('destination', `${query.value.destination.lat},${query.value.destination.lng}`)
    }

    const url = `/weather?${urlParams.toString()}`
    console.log('导航URL:', url)

    // 使用window.location进行导航，这样更可靠
    window.location.href = url
    
  } catch (error) {
    console.error('天气分析导航异常:', error)
    // 后备方案：直接导航到天气页面
    window.location.href = '/weather'
  }
}

onMounted(async () => {
  console.log('RecommendSidebar onMounted - 路由器状态:', router)
  console.log('RecommendSidebar onMounted - 路由器push:', typeof router?.push)
  
  const el = asideRef.value
  const saved = Number(localStorage.getItem('rec-width') || '')
  if (el && saved && !Number.isNaN(saved)) {
    el.style.setProperty('--rec-width', saved + 'px')
  }

  await loadVendors()
  runQuery()

  try {
    subscribeBridge?.((data) => {
      query.value.origin = data.origin
      query.value.destination = data.destination
      ;(query.value as any).route = data.route
      if (data.window) query.value.window = data.window
      runQuery()
    })
  } catch {}

  // 订阅全局语音事件
  onVoiceCommand((e) => handleVoiceCommand(e))
})

const asideRef = ref<HTMLElement | null>(null)
const recFormRef = ref<any>(null)
function startResize(e: MouseEvent) {
  e.preventDefault()
  const el = asideRef.value
  if (!el) return

  const startX = e.clientX
  const startW = el.offsetWidth
  const maxW = Math.min(window.innerWidth * 0.9, 1440)
  const minW = 360

  const onMove = (ev: MouseEvent) => {
    const dx = startX - ev.clientX
    let w = startW + dx
    w = Math.max(minW, Math.min(maxW, w))
    el.style.setProperty('--rec-width', w + 'px')
    localStorage.setItem('rec-width', String(w))
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// === 撤销栈（保存最近一次变更前的 query 快照，用于单步回退） ===
const undoStack: EnhancedQuery[] = []

function pushUndoSnapshot() {
  // 最多保留 10 份快照
  if (undoStack.length > 9) undoStack.shift()
  undoStack.push(JSON.parse(JSON.stringify(query.value)))
}

// 更新字段高亮映射（临时 CSS 动态添加类）
const recentlyChanged = new Set<string>()
function markChanged(fields: string[]) {
  fields.forEach(f => recentlyChanged.add(f))
  // 3 秒后移除
  setTimeout(() => { fields.forEach(f => recentlyChanged.delete(f)) }, 3000)
}

function applyParsedCommand(pc: ParsedCommand, isFinal: boolean) {
  if (pc.isClose) { closeRecommend(); return }
  if (pc.isWeather) { goToWeatherAnalysis(); return }
  if (pc.isUndo && undoStack.length) {
    const prev = undoStack.pop()!
    query.value = JSON.parse(JSON.stringify(prev))
    console.log('[Voice] 撤销 -> 恢复上一快照')
    runQuery()
    return
  }

  let updated = false
  const changedFields: string[] = []

  // 如果此次解析包含业务字段，先入栈
  if (pc.changed.length) pushUndoSnapshot()

  // 将结构化字段委托给表单，保持 UI 与数据一致
  const voicePayload: any = {}
  if (typeof pc.weightKg === 'number') { voicePayload.weightKg = pc.weightKg; updated = true; changedFields.push('weight') }
  if (pc.demandType) { voicePayload.demandType = pc.demandType; updated = true; changedFields.push('demandType') }
  if (pc.temperatureRange) { voicePayload.temperatureRange = pc.temperatureRange; updated = true; changedFields.push('temperatureRange') }
  if (pc.timeWindow) { voicePayload.timeWindow = pc.timeWindow; updated = true; changedFields.push('timeWindow') }
  if (pc.cities) { voicePayload.fromCityName = pc.cities.from; voicePayload.toCityName = pc.cities.to; updated = true; changedFields.push('cities') }
  if (pc.location) { voicePayload.fromDetail = pc.location.from; voicePayload.toDetail = pc.location.to; updated = true; changedFields.push('locationDetail') }
  if (Object.keys(voicePayload).length) {
    try { recFormRef.value?.applyVoiceCommand?.(voicePayload) } catch {}
  }
  // 同步坐标：城市级时直接地理编码
  if (pc.cities) {
    voiceGeocodeCities(pc.cities.from, pc.cities.to)
  }

  // 有任何更新或直接查询时，自动打开侧栏
  if (updated || pc.isQuery) openRecommend()

  if (pc.isQuery) { runQuery(); return }

  if (updated) {
    markChanged(changedFields)
    if (isFinal) runQuery()
  }
}

// === 语音命令处理（统一解析） ===
function handleVoiceCommand(e: { transcript: string; isFinal: boolean }) {
  const text = (e.transcript || '').trim()
  if (!text) return
  const parsed = parseCommand(text)
  applyParsedCommand(parsed, e.isFinal)
}

// === 语音地理编码（城市级） ===
let geocodeLock = false
async function voiceGeocodeCities(fromCity: string, toCity: string) {
  if (geocodeLock) return
  geocodeLock = true
  try {
    const AMap = await loadAmapLite()
    const [oLng, oLat] = await geocodeCity(AMap, fromCity)
    const [dLng, dLat] = await geocodeCity(AMap, toCity)
    query.value.origin = { lat: oLat, lng: oLng }
    query.value.destination = { lat: dLat, lng: dLng }
    console.log('[Voice] 城市坐标设定 ->', query.value.origin, query.value.destination)
  } catch (err) {
    console.warn('[Voice] 城市地理编码失败', err)
  } finally {
    geocodeLock = false
  }
}

async function loadAmapLite(): Promise<any> {
  if ((window as any).AMap) return (window as any).AMap
  const key = (import.meta as any).env.VITE_AMAP_KEY
  const sec = (import.meta as any).env.VITE_AMAP_SECURITY
  if (!key) throw new Error('缺少 VITE_AMAP_KEY 用于语音地理编码')
  if (sec) (window as any)._AMapSecurityConfig = { securityJsCode: sec }
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${key}`
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('AMap 脚本加载失败'))
    document.head.appendChild(s)
  })
  return (window as any).AMap
}

async function geocodeCity(AMap: any, city: string): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    AMap.plugin('AMap.Geocoder', () => {
      const geocoder = new AMap.Geocoder({ city: '全国' })
      geocoder.getLocation(city, (status: string, result: any) => {
        if (status === 'complete' && result?.geocodes?.length) {
          const { lng, lat } = result.geocodes[0].location
          resolve([lng, lat])
        } else {
          reject(new Error('城市解析失败: ' + city))
        }
      })
    })
  })
}
</script>

<style scoped>
.rec-overlay{ position: fixed; inset: 0; background: rgba(0,0,0,.25); backdrop-filter: blur(2px); z-index: 90; }
.rec-sidebar{ position: fixed; top: 0; width: var(--rec-width, clamp(420px, 50vw, 960px)); right: calc(-1 * var(--rec-width, clamp(420px, 50vw, 960px))); height: 100dvh; background: var(--panel-bg, #4468e0); border-left: 1px solid rgba(0,0,0,.08); box-shadow: -16px 0 40px rgba(0,0,0,.14); z-index: 95; display: grid; grid-template-rows: auto 1fr auto; transition: right .28s ease; }
.rec-sidebar.open{ right: 0; }
.rec-header{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding: 10px 12px; border-bottom:1px solid rgba(0,0,0,.08); }
.rec-header h3{ margin:0; font-size:16px; }
.rec-header .count{ font-size:12px; opacity:.65; margin-left:8px; }
.rec-header .actions{ display:flex; gap:8px; }

/* 天气开关样式 */
.weather-toggle { 
  display: flex; 
  align-items: center; 
  gap: 4px; 
  font-size: 12px; 
  margin-left: 12px; 
  opacity: 0.8; 
}
.weather-toggle input[type="checkbox"] { 
  transform: scale(0.9); 
}
.rec-body{ padding: 10px 12px; overflow:auto; }
.rec-footer{ padding: 8px 12px; border-top:1px solid rgba(0,0,0,.08); }
.compare{ display:flex; flex-direction:column; gap:6px; }
.chips{ display:flex; flex-wrap:wrap; gap:6px; }
.chip{ display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:16px; border:1px solid #e3e3e3; background:#fafafa; }
.chip .x{ border:none; background:transparent; cursor:pointer; font-size:14px; }
.placeholder{ font-size:12px; opacity:.6; }
.btn.small{ padding:6px 10px; font-size:12px; border:1px solid #ddd; background:#fff; border-radius:8px; cursor:pointer; }
.btn.small.ghost{ background:transparent; }
.btn.small.weather{ background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: 1px solid #1d4ed8; }
.btn.small.weather:hover{ background: linear-gradient(135deg, #1d4ed8, #1e40af); }
.btn.small:hover{ background:#f5f5f5; }
.resize-handle{ position: absolute; left: -6px; top: 0; width: 6px; height: 100%; cursor: ew-resize; background: transparent; }
.resize-handle:hover{ background: rgba(0,0,0,.06); }

/* 天气面板样式 */
.weather-panel {
  background: linear-gradient(135deg, rgba(68, 104, 224, 0.1), rgba(68, 104, 224, 0.05));
  border: 1px solid rgba(68, 104, 224, 0.2);
  border-radius: 12px;
  padding: 12px;
  margin: 12px 0;
}

.weather-summary h4 {
  margin: 0 0 6px 0;
  font-size: 14px;
  font-weight: 600;
  color: #2563eb;
}

.weather-summary p {
  margin: 0;
  font-size: 13px;
  color: #374151;
  line-height: 1.4;
}

.risk-alerts {
  margin-top: 12px;
}

.risk-alerts h5 {
  margin: 0 0 6px 0;
  font-size: 12px;
  font-weight: 600;
  color: #dc2626;
}

.risk-alerts ul {
  margin: 0;
  padding: 0 0 0 16px;
  list-style: none;
}

.alert-item {
  font-size: 12px;
  color: #dc2626;
  margin-bottom: 4px;
  position: relative;
}

.alert-item::before {
  content: "⚠️";
  position: absolute;
  left: -16px;
  font-size: 10px;
}

.weather-recommendations h5 {
  margin: 12px 0 6px 0;
  font-size: 12px;
  font-weight: 600;
  color: #059669;
}

.weather-recommendations ul {
  margin: 0;
  padding: 0 0 0 16px;
  list-style: none;
}

.weather-recommendations li {
  font-size: 12px;
  color: #374151;
  margin-bottom: 4px;
  position: relative;
}

.weather-recommendations li::before {
  content: "💡";
  position: absolute;
  left: -16px;
  font-size: 10px;
}

/* 字段变更高亮（通过动态 class 绑定到对应输入组件外层，当前示例中可用于后续扩展） */
.field-changed {
  animation: flash-bg 1.2s ease-in-out 0s 2;
}
@keyframes flash-bg {
  0% { background: rgba(255, 235, 59, 0.2); }
  50% { background: rgba(255, 235, 59, 0.55); }
  100% { background: rgba(255, 235, 59, 0); }
}
</style>
