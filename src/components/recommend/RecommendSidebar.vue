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
        <RecQueryForm v-model="query" @submit="handleSubmit" />
        
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
        
        <RecResultTable :items="matches" @add-compare="addCompare" />
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
import { enhancedMatchVendors, getWeatherRecommendations } from '@/utils/enhancedRecommendScore'
import { recommendSidebarOpen, closeRecommend } from '@/bridge/recommendUI'
import { getBridge, subscribeBridge, publishBridge } from '@/bridge/routeBridge'
import { onVoiceCommand } from '@/bridge/voiceBus'

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
  try {
    const res = await fetch('/data/vendors.json')
    vendors.value = await res.json()
  } catch { vendors.value = [] }
}

async function runQuery() {
  if (!vendors.value.length) return
  
  try {
    if (useEnhancedRecommend.value && query.value.weatherConsideration?.enabled) {
      // 使用增强推荐算法
      matches.value = await enhancedMatchVendors(query.value, vendors.value)
      
      // 获取天气建议
      weatherRecommendations.value = getWeatherRecommendations(query.value, matches.value)
    } else {
      // 使用基础推荐算法
      const basicMatches = matchVendors(query.value as Query, vendors.value)
      matches.value = basicMatches.map(m => ({ ...m, weatherScore: undefined, weatherFactors: [], weatherRisk: 'low' as const }))
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

// === 语音命令处理 ===
function handleVoiceCommand(e: { transcript: string; isFinal: boolean }) {
  const text = (e.transcript || '').trim()
  if (!text) return
  const t = text.replace(/，/g, ',').toLowerCase()
  // 基础指令
  if (/关闭|收起|隐藏/.test(t)) { closeRecommend(); return }
  if (/打开|展开|显示/.test(t)) { /* 侧栏由外部控制，这里无显式打开 */ }
  if (/天气|分析|天气分析/.test(t)) { goToWeatherAnalysis(); return }
  if (/查询|搜索|开始|执行/.test(t)) { runQuery(); return }
  // 解析起终点（示例：“起点 北京，终点 上海”）
  const m = t.match(/起点\s*([\u4e00-\u9fa5a-z]+)[,，]\s*终点\s*([\u4e00-\u9fa5a-z]+)/)
  if (m) {
    ;(query.value as any).originName = m[1]
    ;(query.value as any).destinationName = m[2]
    runQuery()
    return
  }
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
</style>
