# 项目主要代码索引（按页面分类）

## 页面级代码说明

### 路线规划

```html
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

```



### 商家推荐

```html
<template>
  <div class="page">
    <RecQueryForm v-model="query" @submit="handleSubmit" />
    <AmapRoute
      ref="amapRef"
      :origin="query.origin"
      :destination="query.destination"
      :mode="routeMode"
    />
    <RecResultTable
      :items="matches"
      @add-compare="addCompare"
      @open-compare="drawerOpen=true"
    />
    <CompareDrawer
      :open="drawerOpen"
      :items="compareList"
      @close="drawerOpen=false"
      @remove="removeCompare"
    />
    <button
      class="compare-fab"
      @click="drawerOpen=!drawerOpen"
      :title="compareList.length ? `已选 ${compareList.length} 家` : `暂无候选，先从表格中加入对比`"
    >
      对比({{ compareList.length }})
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import RecQueryForm from '@/components/recommend/RecQueryForm.vue'
import RecResultTable from '@/components/recommend/RecResultTable.vue'
import CompareDrawer from '@/components/recommend/CompareDrawer.vue'
import AmapRoute from '@/components/map/AmapRoute.vue'
import type { Query } from '@/types/recommend'
import { matchVendors } from '@/utils/recommendScore'

const amapRef = ref<InstanceType<typeof AmapRoute>|null>(null)
const routeMode = ref<'driving'|'walking'|'transit'|'riding'|'truck'>('driving')

const vendors = ref<any[]>([])
const matches = ref<any[]>([])
const drawerOpen = ref(false)
const compareList = ref<any[]>([])

const query = ref<Query>({
  origin:{lat:31.2304,lng:121.4737},
  destination:{lat:31.299,lng:121.3846},
  window:[ new Date().toISOString(), new Date(Date.now()+4*3600e3).toISOString() ],
  demand:{type:'normal',weightKg:500,temperature:null}
})

// ✅ 接收子组件带参的 submit，直接用载荷绘制路线（不依赖 v-model 回写时序）
function handleSubmit(q: Query) {
  if (!q?.origin || !q?.destination) return
  amapRef.value?.route(q.origin, q.destination, routeMode.value)
  // 如需刷新推荐表：
  // matches.value = matchVendors(q, vendors.value)
}

function runQuery(){
  if(!vendors.value.length) return
  matches.value = matchVendors(query.value as any, vendors.value as any)
}

function addCompare(v:any){
  if(!compareList.value.find((x:any)=>x.id===v.id)) compareList.value.push(v)
  drawerOpen.value = true
}

function removeCompare(id:string){
  compareList.value = compareList.value.filter((v:any)=>v.id!==id)
}
</script>

<style scoped>
.page{ padding:8px; display:flex; flex-direction:column; gap:12px; }
.compare-fab{ position:fixed; right:14px; bottom:16px; border:none; padding:10px 14px; border-radius:999px; z-index:2000; }
</style>

```



### 天气分析

```html
<template>
  <div class="weather-page">
    <header class="page-header">
      <button class="back-btn" type="button" @click="goBack" title="返回上一页">
        ← 返回
      </button>
      <div class="title-group">
        <h2>🌤️ 天气分析</h2>
        <p class="subtitle">实时天气监控与物流影响分析</p>
      </div>
    </header>

    <div class="weather-grid">
      <!-- 全国天气概览 -->
      <FluentCard title="全国天气概览" class="overview-card">
        <div v-if="provinceWeather && Object.keys(provinceWeather).length > 0" class="province-grid">
          <div 
            v-for="(data, province) in provinceWeather" 
            :key="province"
            class="province-item"
            :style="{ borderLeftColor: data.color }"
          >
            <div class="province-name">{{ province }}</div>
            <div class="province-temp">{{ data.temperature }}°C</div>
            <div class="province-weather">{{ data.weather }}</div>
          </div>
        </div>
        <div v-else-if="loading.province" class="loading">正在加载全国天气数据...</div>
        <div v-else class="no-data">暂无天气数据</div>
      </FluentCard>

      <!-- 路线天气分析 -->
      <FluentCard title="路线天气分析" class="route-card">
        <!-- 当前路线信息 -->
        <div v-if="startCity && endCity" class="current-route-info">
          <div class="route-point">
            <span class="point-label">起点：</span>
            <span class="point-name">{{ startCity.name }}</span>
          </div>
          <div class="route-point">
            <span class="point-label">终点：</span>
            <span class="point-name">{{ endCity.name }}</span>
          </div>
        </div>

        <!-- 地图图层控制 -->
        <div class="layer-controls">
          <label class="layer-toggle">
            <input 
              type="checkbox" 
              v-model="showWeatherLayer" 
              @change="toggleWeatherLayer"
            >
            <span>天气图层</span>
          </label>
          
          <label class="layer-toggle">
            <input 
              type="checkbox" 
              v-model="showProvinceColors" 
              @change="toggleProvinceColors"
            >
            <span>省份风险色彩</span>
          </label>

          <label class="layer-toggle">
            <input
              type="checkbox"
              v-model="showPublicCameras"
              @change="togglePublicCameras"
            >
            <span>公开监控</span>
          </label>
        </div>

        <!-- 地图容器 -->
        <div v-if="!mapFullscreen" class="map-container">
          <div id="routeMap" class="route-map"></div>
          <div class="map-controls-overlay">
            <button 
              @click="toggleFullscreen" 
              class="fullscreen-btn"
              title="全屏显示"
            >
              🔍
            </button>
          </div>
        </div>

        <!-- 全屏模式地图 - 使用Teleport传送到body -->
        <Teleport to="body" v-if="mapFullscreen">
          <div class="map-fullscreen-overlay">
            <div class="map-fullscreen-container">
              <div id="routeMapFullscreen" class="route-map-fullscreen"></div>
              <div class="map-controls-overlay">
                <button 
                  @click="toggleFullscreen" 
                  class="fullscreen-btn fullscreen-close-btn"
                  title="退出全屏"
                >
                  ✕
                </button>
              </div>
              <!-- 完整功能的悬浮信息面板 -->
              <FloatingPanel
                v-if="showFloatingInfo"
                title="🌤️ 路线天气分析"
                :initial-x="16"
                :initial-y="16"
                :initial-width="380"
                :initial-height="450"
                :min-width="320"
                :min-height="200"
                :max-width="600"
                :max-height="700"
                @close="hideFloatingInfo"
              >
                <div class="weather-analysis-content">
                  <!-- 路线基础信息 -->
                  <div v-if="startCity && endCity" class="route-basic-info">
                    <div class="route-endpoints">
                      <div class="endpoint">
                        <span class="label">起点:</span>
                        <span class="value">{{ startCity.name }}</span>
                      </div>
                      <div class="endpoint">
                        <span class="label">终点:</span>
                        <span class="value">{{ endCity.name }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- 风险评估 -->
                  <div v-if="routeAnalysis" class="risk-assessment">
                    <div class="risk-header">
                      <h4>🚨 风险评估</h4>
                    </div>
                    <div class="risk-summary" :class="`risk-${routeAnalysis.overallRisk}`">
                      <div class="risk-level">
                        <span class="label">整体风险:</span>
                        <span class="value">{{ getRiskText(routeAnalysis.overallRisk) }}</span>
                      </div>
                      <div class="risk-score">
                        <span class="label">风险评分:</span>
                        <span class="value">{{ (routeAnalysis.riskScore * 100).toFixed(0) }}%</span>
                      </div>
                    </div>

                    <!-- 关键风险路段 -->
                    <div v-if="routeAnalysis.criticalSections?.length" class="critical-sections">
                      <h5>⚠️ 关键风险路段</h5>
                      <div class="section-list">
                        <div 
                          v-for="(section, index) in routeAnalysis.criticalSections" 
                          :key="index"
                          class="section-item"
                        >
                          <div class="section-header">
                            <span class="section-risk">{{ section.riskType }}</span>
                            <span class="severity-badge" :class="`severity-${Math.floor(section.severity / 3)}`">
                              {{ section.severity }}/10
                            </span>
                          </div>
                          <div class="section-recommendation">{{ section.recommendation }}</div>
                        </div>
                      </div>
                    </div>

                    <!-- 建议路线 -->
                    <div v-if="routeAnalysis.alternativeRoutes?.length" class="alternatives">
                      <h5>🛣️ 建议路线</h5>
                      <div class="alternative-list">
                        <div 
                          v-for="(alt, index) in routeAnalysis.alternativeRoutes" 
                          :key="index"
                          class="alternative-item"
                        >
                          <div class="alt-description">{{ alt.description }}</div>
                          <div class="alt-metrics">
                            <span class="metric">+{{ alt.additionalDistance }}km</span>
                            <span class="metric risk-reduced">-{{ (alt.reducedRisk * 100).toFixed(0) }}% 风险</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 最佳时机建议 -->
                    <div v-if="routeAnalysis.timing" class="timing-recommendations">
                      <h5>⏰ 出行时机建议</h5>
                      <div class="timing-list">
                        <div v-if="routeAnalysis.timing.bestDepartureTime" class="timing-item good">
                          <span class="icon">✅</span>
                          <span class="text">推荐出发: {{ routeAnalysis.timing.bestDepartureTime }}</span>
                        </div>
                        <div v-if="routeAnalysis.timing.worstConditions" class="timing-item bad">
                          <span class="icon">❌</span>
                          <span class="text">避免时段: {{ routeAnalysis.timing.worstConditions }}</span>
                        </div>
                        <div v-if="routeAnalysis.timing.optimalWindow" class="timing-item optimal">
                          <span class="icon">🎯</span>
                          <span class="text">最佳窗口: {{ routeAnalysis.timing.optimalWindow.join(' - ') }}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 实时天气预警 -->
                  <div v-if="warnings.length" class="weather-warnings">
                    <h4>📢 实时预警</h4>
                    <div class="warning-list">
                      <div 
                        v-for="warning in warnings.slice(0, 3)" 
                        :key="warning.id"
                        class="warning-item"
                        :class="`level-${warning.level}`"
                      >
                        <div class="warning-header">
                          <span class="warning-type">{{ warning.type }}</span>
                          <span class="warning-level">{{ warning.level }}级</span>
                        </div>
                        <div class="warning-title">{{ warning.title }}</div>
                        <div class="warning-impact">
                          影响: {{ warning.logisticsImpact?.roadClosure ? '道路封闭' : '通行正常' }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </FloatingPanel>

              
            </div>
          </div>
        </Teleport>

        <div v-if="routeAnalysis" class="route-analysis">
          <div class="risk-summary" :class="`risk-${routeAnalysis.overallRisk}`">
            <h4>整体风险：{{ getRiskText(routeAnalysis.overallRisk) }}</h4>
            <div class="risk-score">风险评分：{{ (routeAnalysis.riskScore * 100).toFixed(0) }}%</div>
          </div>

          <div v-if="routeAnalysis.criticalSections.length > 0" class="critical-sections">
            <h5>关键风险路段</h5>
            <div 
              v-for="(section, index) in routeAnalysis.criticalSections" 
              :key="index"
              class="section-item"
            >
              <div class="section-risk">{{ section.riskType }}</div>
              <div class="section-severity">严重程度: {{ section.severity }}/10</div>
              <div class="section-recommendation">{{ section.recommendation }}</div>
            </div>
          </div>

          <div v-if="routeAnalysis.alternativeRoutes?.length" class="alternatives">
            <h5>建议路线</h5>
            <div 
              v-for="(alt, index) in routeAnalysis.alternativeRoutes" 
              :key="index"
              class="alternative-item"
            >
              <div class="alt-description">{{ alt.description }}</div>
              <div class="alt-distance">额外距离: +{{ alt.additionalDistance }}km</div>
              <div class="alt-risk">风险降低: {{ (alt.reducedRisk * 100).toFixed(0) }}%</div>
            </div>
          </div>

          <div v-if="routeAnalysis.timing" class="timing-info">
            <h5>最佳时机</h5>
            <div v-if="routeAnalysis.timing.bestDepartureTime" class="timing-item">
              推荐出发时间: {{ routeAnalysis.timing.bestDepartureTime }}
            </div>
            <div v-if="routeAnalysis.timing.worstConditions" class="timing-item">
              避免时间段: {{ routeAnalysis.timing.worstConditions }}
            </div>
            <div v-if="routeAnalysis.timing.optimalWindow" class="timing-item">
              最佳窗口期: {{ routeAnalysis.timing.optimalWindow.join(' - ') }}
            </div>
          </div>
        </div>
      </FluentCard>

      <!-- 实时预警 -->
      <FluentCard title="实时预警" class="warnings-card">
        <!-- 天气云图（雷达叠加） -->
        <div class="warnings-cloud">
          <div class="cloud-title">☁️ 天气云图 / 雷达</div>
          <div id="warningCloudMap" class="cloud-map"></div>
          <div class="cloud-source">数据来源：RainViewer Radar（示例）</div>
        </div>

        <div v-if="warnings.length > 0" class="warnings-list">
          <div 
            v-for="warning in warnings" 
            :key="warning.id"
            class="warning-item"
            :class="`level-${warning.level}`"
          >
            <div class="warning-header">
              <span class="warning-type">{{ warning.type }}</span>
              <span class="warning-level">{{ warning.level }}级</span>
            </div>
            <div class="warning-title">{{ warning.title }}</div>
            <div class="warning-areas">影响区域: {{ warning.areas && warning.areas.length > 0 ? warning.areas.join('、') : '未指定' }}</div>
            <div class="warning-logistics">
              物流影响: 
              {{ warning.logisticsImpact?.roadClosure ? '道路封闭' : '道路通行' }}
              {{ warning.logisticsImpact?.speedReduction > 0 ? `限速${warning.logisticsImpact.speedReduction}km/h` : '' }}
            </div>
          </div>
        </div>
        <div v-else-if="loading.warnings" class="loading">正在获取预警信息...</div>
        <div v-else class="no-warnings">暂无气象预警</div>
      </FluentCard>

      <!-- 物流建议 -->
      <FluentCard title="物流建议" class="recommendations-card">
        <div class="recommendation-categories">
          <div class="category">
            <h4>🚛 车辆准备</h4>
            <ul>
              <li>检查防雨防晒设备</li>
              <li>确保轮胎状况良好</li>
              <li>准备应急工具包</li>
              <li>检查冷链设备运行状态</li>
            </ul>
          </div>
          
          <div class="category">
            <h4>📦 货物保护</h4>
            <ul>
              <li>使用防潮包装材料</li>
              <li>加固易碎物品包装</li>
              <li>温敏货物使用保温措施</li>
              <li>确保包装密封性良好</li>
            </ul>
          </div>
          
          <div class="category">
            <h4>🛣️ 路线规划</h4>
            <ul>
              <li>避开恶劣天气区域</li>
              <li>选择主干道优先</li>
              <li>预设备用路线方案</li>
              <li>关注实时路况信息</li>
            </ul>
          </div>
          
          <div class="category">
            <h4>⏰ 时间安排</h4>
            <ul>
              <li>避开恶劣天气时段</li>
              <li>预留额外缓冲时间</li>
              <li>考虑休息站点天气</li>
              <li>灵活调整配送计划</li>
            </ul>
          </div>
        </div>
      </FluentCard>
    </div>



    <!-- 天气悬浮窗 -->
    <WeatherTooltip 
      :visible="tooltipVisible"
      :data="tooltipData"
      :x="tooltipPosition.x"
      :y="tooltipPosition.y"
      @close="hideTooltip"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FluentCard from '@/components/FluentCard.vue'
import WeatherTooltip from '@/components/WeatherTooltip.vue'
import { onVoiceCommand } from '@/bridge/voiceBus'
import FloatingPanel from '@/components/FloatingPanel.vue'
import { weatherService } from '@/services/weather'
import { disasterService } from '@/services/disaster'
import type { ProvinceWeatherData, RouteWeatherAnalysis, WeatherAlert } from '@/types/weather'
import { ensureAMapLoaded } from '@/utils/amapLoader'
import { getRandomCameras, type PublicCamera } from '@/services/publicCameras'
import Hls from 'hls.js'

// 全局AMap类型声明
declare global {
  interface Window {
    AMap: any
  }
}

const route = useRoute()
const router = useRouter()

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

// 数据状态
const provinceWeather = ref<ProvinceWeatherData>({})
const routeAnalysis = ref<RouteWeatherAnalysis | null>(null)
const warnings = ref<WeatherAlert[]>([])

// 加载状态
const loading = ref({
  province: false,
  route: false,
  warnings: false
})

// 路径输入
const routeOrigin = ref('北京市')
const routeDestination = ref('上海市')

// 路线规划状态
const startCity = ref<any>(null)
const endCity = ref<any>(null)
const currentRoute = ref<any>(null)
const routeSearching = ref(false)
const silentMode = ref(false) // 静默模式，不显示提示

// 地图相关状态
const showWeatherLayer = ref(true)
const showProvinceColors = ref(true)
const showPublicCameras = ref(true)
const mapFullscreen = ref(false)
let routeMap: any = null
let routePath: any = null
let weatherMarkers: any[] = []
let cameraMarkers: any[] = []
// 实时预警云图小地图实例
let warningCloudMap: any = null
let warningCloudLayer: any = null
let warningCloudTimer: any = null

// 悬浮窗状态
const tooltipVisible = ref(false)
const tooltipData = ref({})
const tooltipPosition = ref({ x: 0, y: 0 })
const showFloatingInfo = ref(true)

// 路线分析状态扩展
const routeAnalyzing = ref(false)

// 主要城市列表
const majorCities = ref([
  { name: '北京', lng: 116.397428, lat: 39.90923 },
  { name: '上海', lng: 121.473701, lat: 31.230416 },
  { name: '广州', lng: 113.280637, lat: 23.125178 },
  { name: '深圳', lng: 114.085947, lat: 22.547 },
  { name: '杭州', lng: 120.153576, lat: 30.287459 },
  { name: '南京', lng: 118.767413, lat: 32.041544 },
  { name: '武汉', lng: 114.298572, lat: 30.584355 },
  { name: '成都', lng: 104.065735, lat: 30.659462 },
  { name: '重庆', lng: 106.504962, lat: 29.533155 },
  { name: '西安', lng: 108.948024, lat: 34.263161 },
  { name: '天津', lng: 117.190182, lat: 39.125596 },
  { name: '苏州', lng: 120.619585, lat: 31.299379 },
  { name: '青岛', lng: 120.355173, lat: 36.082982 },
  { name: '郑州', lng: 113.625368, lat: 34.746599 },
  { name: '长沙', lng: 112.982279, lat: 28.19409 }
])

// 获取全国省份天气
async function loadProvinceWeather() {
  loading.value.province = true
  try {
    const rawProvinceWeather = await weatherService.getProvinceWeather()
    
    // 转换数据格式以匹配类型定义
    const processedData: ProvinceWeatherData = {}
    Object.entries(rawProvinceWeather).forEach(([province, data]) => {
      // 根据温度和天气条件计算风险等级
      const calculateRiskLevel = (temp: number, weather: string): 'low' | 'medium' | 'high' | 'extreme' => {
        if (weather.includes('暴雨') || weather.includes('雷暴') || weather.includes('冰雹')) {
          return 'extreme'
        }
        if (weather.includes('雨') || weather.includes('雪') || weather.includes('雾') || temp > 35 || temp < -10) {
          return 'high'
        }
        if (weather.includes('阴') || weather.includes('云') || temp > 30 || temp < 0) {
          return 'medium'
        }
        return 'low'
      }
      
      processedData[province] = {
        temperature: data.temp,
        weather: data.weather,
        color: data.color,
        riskLevel: calculateRiskLevel(data.temp, data.weather)
      }
    })
    
    provinceWeather.value = processedData
  } catch (error) {
    console.error('加载省份天气失败:', error)
  } finally {
    loading.value.province = false
  }
}

// 分析路径天气
async function analyzeRouteWeather() {
  if (!routeOrigin.value || !routeDestination.value) return
  
  loading.value.route = true
  try {
    // 绘制路径地图
    await nextTick()
    if (routeMap) {
      drawRoute(routeOrigin.value, routeDestination.value)
    }
    
    // 这里应该调用实际的路径分析服务
    // 目前提供示例数据
    const mockAnalysis: RouteWeatherAnalysis = {
      overallRisk: 'medium',
      riskScore: 0.75,
      criticalSections: [
        {
          startPoint: { lat: 39.9042, lng: 116.4074 },
          endPoint: { lat: 31.2304, lng: 121.4737 },
          riskType: '途经强降雨区域',
          severity: 6,
          recommendation: '建议绕行或延后2-3小时出发'
        }
      ],
      alternativeRoutes: [
        {
          description: '经京沪高速绕行',
          additionalDistance: 45,
          reducedRisk: 0.3
        }
      ],
      timing: {
        bestDepartureTime: '明日6:00-8:00',
        worstConditions: '今日14:00-18:00（强降雨时段）',
        optimalWindow: ['06:00', '08:00']
      }
    }
    
    routeAnalysis.value = mockAnalysis
  } catch (error) {
    console.error('路径天气分析失败:', error)
  } finally {
    loading.value.route = false
  }
}

function hideFloatingInfo() { showFloatingInfo.value = false }


function onVoiceCommandInFullscreen(e: { transcript: string; isFinal: boolean; parsed?: any }) {
  if (!e.isFinal || !e.parsed) return
  
  const { parsed } = e
  
  // 基础控制命令
  if (parsed.isClose || /退出|关闭/.test(parsed.text)) {
    if (/全屏/.test(parsed.text)) {
      toggleFullscreen()
      return
    }
    if (/面板|信息/.test(parsed.text)) {
      hideFloatingInfo()
      return
    }
  }
  
  // 图层控制
  if (parsed.isLayer) {
    if (/天气图层|天气/.test(parsed.text)) {
      showWeatherLayer.value = !showWeatherLayer.value
      toggleWeatherLayer()
      return
    }
    if (/省份|风险色彩/.test(parsed.text)) {
      showProvinceColors.value = !showProvinceColors.value
      toggleProvinceColors()
      return
    }
  }
  
  // 时间相关命令
  if (parsed.time) {
    const timeMatch = parsed.time.pattern.exec(parsed.text)
    if (timeMatch) {
      // 这里可以设置出发时间相关逻辑
      console.log('设置出发时间:', timeMatch)
    }
  }
  
  // 车辆类型设置
  if (parsed.vehicle) {
    console.log('设置车辆类型:', parsed.vehicle.type)
    // 这里可以调用设置车辆类型的逻辑
  }
  
  // 路线设置
  if (parsed.location) {
    const origin = parsed.location.from
    const destination = parsed.location.to
    if (origin && destination) {
      routeOrigin.value = String(origin).trim()
      routeDestination.value = String(destination).trim()
      console.log('设置路线:', routeOrigin.value, '→', routeDestination.value)
      // 触发路线分析
      analyzeRouteWeather()
    }
  }
  
  // 查询命令
  if (parsed.isQuery) {
    routeAnalyzing.value = true
    analyzeRouteWeather().finally(() => {
      routeAnalyzing.value = false
    })
  }
}

// 获取预警信息
async function loadWarnings() {
  loading.value.warnings = true
  try {
    const majorCities = [
      { lat: 39.9042, lng: 116.4074 }, // 北京
      { lat: 31.2304, lng: 121.4737 }, // 上海
      { lat: 23.1291, lng: 113.2644 }  // 广州
    ]
    
    const allWarnings = []
    for (const city of majorCities) {
      const cityWarnings = await weatherService.getDisasterWarning(city)
      
      const processedWarnings: WeatherAlert[] = cityWarnings.map(w => ({
        id: w.id || Math.random().toString(36).substr(2, 9),
        type: w.type || '未知类型',
        level: w.level?.includes('红') ? 'red' : 
               w.level?.includes('橙') ? 'orange' :
               w.level?.includes('黄') ? 'yellow' : 'blue',
        title: w.title || '预警信息',
        description: w.text || '',
        startTime: w.startTime || new Date().toISOString(),
        endTime: w.endTime,
        areas: w.areas && Array.isArray(w.areas) ? w.areas : ['未指定区域'],
        logisticsImpact: {
          roadClosure: w.level?.includes('红') || w.level?.includes('橙') || false,
          speedReduction: w.level?.includes('红') ? 40 : w.level?.includes('橙') ? 20 : 0,
          vehicleRestrictions: w.type?.includes('大风') ? ['高栏车', '空载货车'] : []
        }
      }))
      
      allWarnings.push(...processedWarnings)
    }
    
    warnings.value = allWarnings
  } catch (error) {
    console.error('加载预警信息失败:', error)
    warnings.value = []
  } finally {
    loading.value.warnings = false
  }
}

// 获取风险等级文本
function getRiskText(risk: string): string {
  switch (risk) {
    case 'low': return '低风险'
    case 'medium': return '中等风险'
    case 'high': return '高风险'
    case 'extreme': return '极高风险'
    default: return '未知'
  }
}

// 地图控制函数
function toggleWeatherLayer() {
  showWeatherLayer.value = !showWeatherLayer.value
  updateMapLayers()
}

function toggleProvinceColors() {
  showProvinceColors.value = !showProvinceColors.value
  updateMapLayers()
}

function togglePublicCameras() {
  // 仅控制摄像头覆盖层的显示/隐藏
  if (!showPublicCameras.value) {
    clearPublicCameraMarkers()
  } else if (currentRoute.value) {
    // 重新挂载
    addRoutePublicCameras(currentRoute.value)
  }
}

function toggleFullscreen() {
  mapFullscreen.value = !mapFullscreen.value
  
  // 控制body滚动
  if (mapFullscreen.value) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
  
  // 延迟重新初始化地图以确保容器已创建
  setTimeout(async () => {
    silentMode.value = true // 启用静默模式
    
    if (mapFullscreen.value) {
      // 进入全屏模式 - 重新初始化地图到全屏容器
      await initFullscreenMap()
    } else {
      // 退出全屏模式 - 重新初始化地图到原容器
      await initRouteMap()
    }
    
    silentMode.value = false // 恢复正常模式
  }, 100)
}

// ESC键退出全屏
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && mapFullscreen.value) {
    toggleFullscreen()
  }
}

// 初始化路线地图
async function initRouteMap() {
  const AMap = await ensureAMapLoaded()
  
  if (!AMap) {
    console.error('高德地图API未加载')
    return
  }

  // 销毁原地图实例
  if (routeMap) {
    routeMap.destroy()
  }

  routeMap = new AMap.Map('routeMap', {
    zoom: 6,
    center: [116.397428, 39.90923],
    mapStyle: 'amap://styles/macaron'
  })

  // 重新添加所有图层和标记
  if (showProvinceColors.value) {
    addProvinceColors()
  }
  
  // 仅在静默模式下恢复路线，避免重复弹窗
  if (startCity.value && endCity.value && silentMode.value) {
    setTimeout(async () => {
      await searchRoute()
    }, 500)
  }
}

// 初始化全屏地图
async function initFullscreenMap() {
  const AMap = await ensureAMapLoaded()
  
  if (!AMap) {
    console.error('高德地图API未加载')
    return
  }

  // 销毁原地图实例
  if (routeMap) {
    routeMap.destroy()
  }

  // 创建全屏地图实例
  routeMap = new AMap.Map('routeMapFullscreen', {
    zoom: 6,
    center: [116.397428, 39.90923],
    mapStyle: 'amap://styles/macaron'
  })

  // 重新添加所有图层和标记
  if (showProvinceColors.value) {
    addProvinceColors()
  }
  
  // 仅在静默模式下恢复路线，避免重复弹窗
  if (startCity.value && endCity.value && silentMode.value) {
    setTimeout(async () => {
      await searchRoute()
    }, 500)
  }
}

// 添加省区颜色显示
function addProvinceColors() {
  if (!routeMap || !Object.keys(provinceWeather.value).length) return

  // 省份中心点坐标数据
  const provinceCoords: Record<string, [number, number]> = {
    '北京市': [116.407, 39.904],
    '天津市': [117.323, 39.114],
    '河北省': [114.469, 38.037],
    '山西省': [112.550, 37.870],
    '内蒙古自治区': [111.750, 40.841],
    '辽宁省': [123.431, 41.836],
    '吉林省': [125.325, 43.897],
    '黑龙江省': [126.662, 45.742],
    '上海市': [121.473, 31.230],
    '江苏省': [118.763, 32.061],
    '浙江省': [120.154, 30.265],
    '安徽省': [117.284, 31.861],
    '福建省': [119.296, 26.099],
    '江西省': [115.909, 28.675],
    '山东省': [117.121, 36.651],
    '河南省': [113.753, 34.766],
    '湖北省': [114.342, 30.546],
    '湖南省': [112.983, 28.113],
    '广东省': [113.266, 23.132],
    '广西壮族自治区': [108.327, 22.816],
    '海南省': [110.349, 20.017],
    '重庆市': [106.551, 29.563],
    '四川省': [104.075, 30.651],
    '贵州省': [106.633, 26.647],
    '云南省': [102.710, 25.046],
    '西藏自治区': [91.117, 29.647],
    '陕西省': [108.954, 34.265],
    '甘肃省': [103.826, 36.058],
    '青海省': [101.780, 36.621],
    '宁夏回族自治区': [106.259, 38.472],
    '新疆维吾尔自治区': [87.628, 43.793],
    '台湾省': [121.565, 25.033],
    '香港特别行政区': [114.165, 22.275],
    '澳门特别行政区': [113.549, 22.199]
  }

  // 根据风险等级获取颜色
  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return '#10b981'      // 绿色
      case 'medium': return '#f59e0b'   // 橙色
      case 'high': return '#ef4444'     // 红色
      case 'extreme': return '#dc2626'  // 深红色
      default: return '#6b7280'         // 灰色
    }
  }

  // 为每个省份添加风险标注
  Object.entries(provinceWeather.value).forEach(([province, data]) => {
    const coords = provinceCoords[province]
    if (!coords) return

    const color = getRiskColor(data.riskLevel)
    const riskText = getRiskText(data.riskLevel)
    
    // 创建更大的圆形标记
    const circle = new window.AMap.Circle({
      center: coords,
      radius: 80000, // 增大到80km半径，更明显
      fillColor: color,
      fillOpacity: 0.3,
      strokeColor: color,
      strokeWeight: 3,
      strokeOpacity: 1
    })

    circle.setMap(routeMap)
    
    // 创建省份标记点，带风险等级
    const provinceMarker = new window.AMap.Marker({
      position: coords,
      content: `
        <div class="province-risk-marker" style="background-color: ${color}">
          <div class="province-name">${province.replace('省', '').replace('市', '').replace('自治区', '').replace('特别行政区', '')}</div>
          <div class="risk-level">${riskText}</div>
          <div class="temperature">${data.temperature}°C</div>
          <div class="risk-indicator">
            ${data.riskLevel === 'extreme' ? '🔴' : data.riskLevel === 'high' ? '🟡' : data.riskLevel === 'medium' ? '🟠' : '🟢'}
          </div>
        </div>
      `,
      offset: new window.AMap.Pixel(-40, -50)
    })

    provinceMarker.setMap(routeMap)
    weatherMarkers.push(circle, provinceMarker)

    // 添加省份标签
    const marker = new window.AMap.Marker({
      position: coords,
      content: `
        <div class="province-marker" style="background-color: ${color}">
          <div class="province-name">${province.replace('省', '').replace('市', '').replace('自治区', '').replace('特别行政区', '')}</div>
          <div class="province-temp">${data.temperature}°C</div>
        </div>
      `,
      offset: new window.AMap.Pixel(-25, -25)
    })

    marker.setMap(routeMap)
    weatherMarkers.push(marker)

    // 添加点击事件
    marker.on('click', (e: any) => {
      showWeatherTooltip(
        { name: province },
        {
          current: {
            temp: data.temperature,
            feelsLike: data.temperature,
            humidity: 60,
            windSpeed: 15,
            visibility: 20,
            weather: data.weather,
            icon: '100'
          }
        },
        e.originEvent
      )
    })
  })
}

// 更新地图图层
function updateMapLayers() {
  if (!routeMap) return

  // 清除所有标记
  weatherMarkers.forEach(marker => marker.setMap(null))
  weatherMarkers = []

  // 重新添加所需的图层
  if (showWeatherLayer.value) {
    addWeatherMarkers()
  }

  if (showProvinceColors.value) {
    addProvinceColors()
  }
  
  console.log('图层已更新 - 天气图层:', showWeatherLayer.value, '省份色彩:', showProvinceColors.value)
}

// 添加天气标记
function addWeatherMarkers() {
  if (!routeMap) return

  // 添加主要城市天气标记
  const majorCities = [
    { name: '北京', lat: 39.9042, lng: 116.4074 },
    { name: '上海', lat: 31.2304, lng: 121.4737 },
    { name: '广州', lat: 23.1291, lng: 113.2644 },
    { name: '深圳', lat: 22.5431, lng: 114.0579 },
    { name: '成都', lat: 30.5728, lng: 104.0668 },
    { name: '杭州', lat: 30.2741, lng: 120.1551 }
  ]

  majorCities.forEach(async city => {
    try {
      const weather = await weatherService.getWeather({ lat: city.lat, lng: city.lng })
      
      const marker = new window.AMap.Marker({
        position: [city.lng, city.lat],
        content: `
          <div class="weather-marker" data-city="${city.name}">
            <div class="weather-temp">${weather.current.temp}°</div>
            <div class="weather-desc">${weather.current.weather}</div>
          </div>
        `,
        offset: new window.AMap.Pixel(-20, -30)
      })

      marker.setMap(routeMap)
      weatherMarkers.push(marker)

      // 添加点击事件显示详细信息
      marker.on('click', () => {
        showWeatherTooltip(city, weather)
      })
    } catch (error) {
      console.error(`获取${city.name}天气失败:`, error)
    }
  })
}

// 显示天气悬浮窗
function showWeatherTooltip(city: any, weather: any, event?: MouseEvent) {
  tooltipData.value = {
    location: city.name,
    temperature: weather.current.temp,
    feelsLike: weather.current.feelsLike,
    humidity: weather.current.humidity,
    windSpeed: weather.current.windSpeed,
    visibility: weather.current.visibility,
    weather: weather.current.weather,
    icon: weather.current.icon,
    riskLevel: 'low' as const, // 可以根据天气条件计算
    riskFactors: []
  }
  
  if (event) {
    tooltipPosition.value = {
      x: event.clientX,
      y: event.clientY
    }
  } else {
    // 默认位置
    tooltipPosition.value = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    }
  }
  
  tooltipVisible.value = true
}

// 隐藏天气悬浮窗
function hideTooltip() {
  tooltipVisible.value = false
}

// 搜索路线
async function searchRoute() {
  if (!startCity.value || !endCity.value) {
    console.warn('请选择起点和终点')
    alert('请选择起点和终点')
    return
  }

  if (!routeMap) {
    console.error('地图未初始化，尝试重新初始化...')
    await initRouteMap()
    if (!routeMap) {
      alert('地图初始化失败，请刷新页面重试')
      return
    }
  }

  // 确保AMap API可用
  if (typeof window.AMap === 'undefined') {
    console.error('高德地图API不可用')
    alert('地图服务不可用，请刷新页面重试')
    return
  }

  routeSearching.value = true

  try {
    // 清除之前的路线
    clearRoute()

    // 创建起点和终点标记
    const startMarker = new window.AMap.Marker({
      position: [startCity.value.lng, startCity.value.lat],
      content: `
        <div class="route-point-marker start-marker">
          <div class="marker-icon">📍</div>
          <div class="marker-label">起点</div>
        </div>
      `,
      offset: new window.AMap.Pixel(-15, -40)
    })

    const endMarker = new window.AMap.Marker({
      position: [endCity.value.lng, endCity.value.lat],
      content: `
        <div class="route-point-marker end-marker">
          <div class="marker-icon">🎯</div>
          <div class="marker-label">终点</div>
        </div>
      `,
      offset: new window.AMap.Pixel(-15, -40)
    })

    startMarker.setMap(routeMap)
    endMarker.setMap(routeMap)
    weatherMarkers.push(startMarker, endMarker)

    // 创建路径规划服务
    const driving = new window.AMap.Driving({
      map: routeMap,
      showTraffic: true,
      hideMarkers: true, // 隐藏默认标记，使用自定义标记
      autoFitView: true,
      policy: window.AMap.DrivingPolicy.LEAST_TIME // 最短时间策略
    })

    // 搜索路径
    const result = await new Promise((resolve, reject) => {
      driving.search(
        new window.AMap.LngLat(startCity.value.lng, startCity.value.lat),
        new window.AMap.LngLat(endCity.value.lng, endCity.value.lat),
        (status: string, result: any) => {
          if (status === 'complete') {
            resolve(result)
          } else {
            reject(new Error('路线搜索失败'))
          }
        }
      )
    })

    if ((result as any).routes && (result as any).routes.length > 0) {
      currentRoute.value = (result as any).routes[0]
      
      // 延迟添加沿途天气信息，确保路线渲染完成
      setTimeout(() => {
        addRouteWeatherInfo(currentRoute.value)
        // 根据用户设置，附加公开监控标签
        if (showPublicCameras.value) {
          addRoutePublicCameras(currentRoute.value)
        }
      }, 1000)
      
      // 显示路线信息
      const distance = (currentRoute.value.distance / 1000).toFixed(1)
      const duration = Math.round(currentRoute.value.time / 60)
      
      console.log(`路线规划成功！距离: ${distance}km，预计时间: ${duration}分钟`)
      if (!silentMode.value) {
        alert(`路线规划成功！距离: ${distance}km，预计时间: ${duration}分钟`)
      }

      // 获取起点和终点的天气信息
      await Promise.all([
        getLocationWeather(startCity.value, '起点'),
        getLocationWeather(endCity.value, '终点')
      ])
    } else {
      throw new Error('未找到合适的路线')
    }
  } catch (error) {
    console.error('路线搜索失败:', error)
    console.error('路线搜索失败，请重试')
    alert('路线搜索失败，请重试')
  } finally {
    routeSearching.value = false
  }
}

// 获取地点天气信息
async function getLocationWeather(location: any, label: string) {
  try {
    const weather = await weatherService.getWeather(location)
    console.log(`${label} (${location.name}) 天气:`, weather)
  } catch (error) {
    console.error(`获取${label}天气失败:`, error)
  }
}

// 清除路线
function clearRoute() {
  // 清除所有天气标记
  weatherMarkers.forEach(marker => {
    marker.setMap(null)
  })
  weatherMarkers.length = 0
  // 清除摄像头标记
  clearPublicCameraMarkers()
  
  // 清除当前路线
  currentRoute.value = null
  
  if (routeMap) {
    routeMap.clearMap()
    // 重新添加省区颜色图层
    if (showProvinceColors.value) {
      setTimeout(() => {
        addProvinceColors()
      }, 100)
    }
  }
}

// 绘制路径
function drawRoute(origin: string, destination: string) {
  if (!routeMap) return

  // 清除之前的路径
  if (routePath) {
    routePath.setMap(null)
  }

  const driving = new window.AMap.Driving({
    map: routeMap,
    showTraffic: false,
    hideMarkers: false
  })

  driving.search(origin, destination, (status: string, result: any) => {
    if (status === 'complete' && result.routes && result.routes.length) {
      routePath = result.routes[0]
      
      // 添加沿途天气信息
      addRouteWeatherInfo(result.routes[0])
    } else {
      console.error('路径规划失败:', status, result)
    }
  })
}

// 添加沿途天气信息
function addRouteWeatherInfo(route: any) {
  if (!route.steps) return

  // 每隔一定距离添加天气点
  const steps = route.steps
  const weatherPoints = []

  for (let i = 0; i < steps.length; i += Math.max(1, Math.floor(steps.length / 8))) { // 沿路径均匀取8个点
    const step = steps[i]
    if (step.start_location) {
      weatherPoints.push({
        lat: step.start_location.lat,
        lng: step.start_location.lng,
        instruction: step.instruction || '',
        stepIndex: i
      })
    }
  }

  // 为每个点获取天气信息并添加标记
  weatherPoints.forEach(async (point, index) => {
    try {
      const weather = await weatherService.getWeather(point)
      
      // 计算风险等级
      const riskLevel = calculateWeatherRisk(weather)
      const riskColor = getRiskColor(riskLevel)
      
      const marker = new window.AMap.Marker({
        position: [point.lng, point.lat],
        content: `
          <div class="route-weather-marker" style="background-color: ${riskColor}">
            <div class="temp">${weather.current.temp}°</div>
            <div class="weather-icon">🌤️</div>
          </div>
        `,
        offset: new window.AMap.Pixel(-12, -12)
      })

      marker.setMap(routeMap)
      weatherMarkers.push(marker)

      // 添加点击事件显示详细信息
      marker.on('click', (e: any) => {
        showWeatherTooltip(
          { name: `路径点 ${index + 1}` },
          weather,
          e.originEvent
        )
      })

      // 如果风险等级高，添加警告信息窗
      if (riskLevel === 'high' || riskLevel === 'extreme') {
        const infoWindow = new window.AMap.InfoWindow({
          content: `
            <div class="risk-warning">
              <strong>⚠️ ${riskLevel === 'extreme' ? '极高风险' : '高风险'}区域</strong>
              <br>建议谨慎通过或绕行
            </div>
          `,
          offset: new window.AMap.Pixel(0, -30)
        })

        setTimeout(() => {
          infoWindow.open(routeMap, marker.getPosition())
          setTimeout(() => infoWindow.close(), 3000) // 3秒后自动关闭
        }, index * 500) // 延迟显示，避免同时弹出太多
      }
    } catch (error) {
      console.error(`获取路径点${index}天气失败:`, error)
    }
  })
}

// 初始化“实时预警”卡片中的云图小地图
async function initWarningCloudMap() {
  const AMap = await ensureAMapLoaded(false)
  const container = document.getElementById('warningCloudMap')
  if (!AMap || !container) return

  // 如已有实例，先销毁
  if (warningCloudMap) {
    try { warningCloudMap.destroy() } catch {}
    warningCloudMap = null
  }

  warningCloudMap = new window.AMap.Map('warningCloudMap', {
    zoom: 5,
    center: [105.0, 35.0],
    mapStyle: 'amap://styles/whitesmoke',
    dragEnable: false,
    zoomEnable: false,
    doubleClickZoom: false,
    keyboardEnable: false
  })

  // Radar/Cloud 瓦片：优先使用和风QWeather雷达瓦片（需配置 VITE_QWEATHER_RADAR_TILE 与 VITE_QWEATHER_KEY），否则回退示例 RainViewer
  const qTile: string | undefined = (import.meta as any).env?.VITE_QWEATHER_RADAR_TILE
  const qKey: string | undefined = (import.meta as any).env?.VITE_QWEATHER_KEY
  let tileTemplate = ''
  if (qTile && qKey) {
    // 瓦片模板应包含 {z}/{x}/{y}，例如：
    // https://mapapi.qweather.com/map/v2/radar/{z}/{x}/{y}.png
    // 若模板未带 key 参数，这里自动追加
    tileTemplate = qTile.includes('key=') ? qTile : `${qTile}${qTile.includes('?') ? '&' : '?'}key=${encodeURIComponent(qKey)}`
  } else {
    console.warn('[CloudMap] 未检测到 VITE_QWEATHER_RADAR_TILE 或 VITE_QWEATHER_KEY，将使用 RainViewer 示例瓦片')
    tileTemplate = 'https://tilecache.rainviewer.com/v2/radar/nowcast/0/256/{z}/{x}/{y}/2/1_1.png'
  }

  const tileUrl = `${tileTemplate}${tileTemplate.includes('?') ? '&' : '?'}_=${Date.now()}`
  warningCloudLayer = new window.AMap.TileLayer({
    tileUrl,
    zIndex: 110,
    zooms: [3, 12]
  })
  warningCloudLayer.setMap(warningCloudMap)

  // 定时轻量刷新（避免缓存）
  warningCloudTimer && clearInterval(warningCloudTimer)
  warningCloudTimer = setInterval(() => {
    try {
      if (warningCloudLayer) warningCloudLayer.setMap(null)
      const url = `${tileTemplate}${tileTemplate.includes('?') ? '&' : '?'}_=${Date.now()}`
      warningCloudLayer = new window.AMap.TileLayer({ tileUrl: url, zIndex: 110, zooms: [3, 12] })
      warningCloudLayer.setMap(warningCloudMap)
    } catch (e) {
      console.warn('刷新云图失败', e)
    }
  }, 5 * 60 * 1000)
}

// 清理摄像头标记
function clearPublicCameraMarkers() {
  cameraMarkers.forEach(m => {
    try { m.setMap && m.setMap(null) } catch {}
  })
  cameraMarkers = []
}

// 在路线节点处附加公开监控标签（随机来源，与路径几何无关）
async function addRoutePublicCameras(route: any) {
  if (!routeMap || !route?.steps || !Array.isArray(route.steps)) return
  // 先清除旧的
  clearPublicCameraMarkers()

  const steps = route.steps
  // 选择若干节点（均匀抽取），3~6 个之间
  const targetCount = Math.min(6, Math.max(3, Math.floor(steps.length / 5) || 3))
  const gap = Math.max(1, Math.floor(steps.length / targetCount))
  const nodes: { lng: number; lat: number; label: string }[] = []
  for (let i = 0; i < steps.length && nodes.length < targetCount; i += gap) {
    const st = steps[i]
    if (st?.start_location) {
      nodes.push({
        lng: st.start_location.lng,
        lat: st.start_location.lat,
        label: st.instruction || `路径节点 ${i + 1}`
      })
    }
  }

  if (!nodes.length) return
  const cameras: PublicCamera[] = await getRandomCameras(nodes.length)
  if (!cameras.length) return

  nodes.forEach((node, idx) => {
    const cam = cameras[idx % cameras.length]
    const content = `
      <div class="public-camera-label" title="公开监控">
        <span class="icon">📷</span>
        <span class="text">公开监控</span>
      </div>
    `
    const marker = new window.AMap.Marker({
      position: [node.lng, node.lat],
      content,
      offset: new window.AMap.Pixel(-18, -22),
      extData: { cam, node }
    })
    marker.setMap(routeMap)
    cameraMarkers.push(marker)

    // 点击弹出信息窗（内嵌播放器）
    marker.on('click', () => {
      const vidId = `cam-video-${(cam.id || 'x').replace(/[^a-zA-Z0-9_-]/g,'')}`
      const isHls = !!cam.streamUrl && /\.m3u8(\?|$)/i.test(cam.streamUrl)
      const isMp4 = !!cam.streamUrl && /\.mp4(\?|$)/i.test(cam.streamUrl)
      const html = `
        <div class="camera-infowin">
          <div class="title">${cam.name || '公开监控'}</div>
          ${cam.city ? `<div class="meta">城市：${cam.city}</div>` : ''}
          ${(isHls || isMp4) ? `<video id="${vidId}" class="player" controls playsinline style="width:100%;border-radius:6px;max-height:200px;background:#000"></video>` : ''}
          ${cam.snapshotUrl ? `<img class="snapshot" src="${cam.snapshotUrl}" alt="snapshot" />` : ''}
          <div class="links">
            ${cam.streamUrl ? `<a href="${cam.streamUrl}" target="_blank" rel="noopener">在新窗口打开</a>` : ''}
            ${cam.infoUrl ? `<a href="${cam.infoUrl}" target="_blank" rel="noopener">详情</a>` : ''}
          </div>
          <div class="tip">提示：点击视频控件播放；部分流可能受跨域或浏览器策略限制。</div>
        </div>
      `
      const info = new window.AMap.InfoWindow({
        content: html,
        offset: new window.AMap.Pixel(0, -28)
      })
      info.open(routeMap, marker.getPosition())

      // 初始化视频（HLS 或 MP4）
      setTimeout(() => {
        try {
          if (!cam.streamUrl) return
          const videoEl = document.getElementById(vidId)
          if (!videoEl) return
          const v = videoEl as HTMLVideoElement
          if (/\.m3u8(\?|$)/i.test(cam.streamUrl)) {
            if (Hls.isSupported()) {
              const hls = new Hls({ maxBufferLength: 10 })
              hls.loadSource(cam.streamUrl)
              hls.attachMedia(v)
            } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
              v.src = cam.streamUrl
            }
          } else if (/\.mp4(\?|$)/i.test(cam.streamUrl)) {
            v.src = cam.streamUrl
          }
        } catch (err) {
          console.warn('初始化视频失败', err)
        }
      }, 50)
    })
  })
}

// 计算天气风险等级
function calculateWeatherRisk(weather: any): 'low' | 'medium' | 'high' | 'extreme' {
  const temp = weather.current.temp
  const windSpeed = weather.current.windSpeed
  const visibility = weather.current.visibility
  const weatherText = weather.current.weather

  let riskScore = 0

  // 温度风险
  if (temp < -10 || temp > 40) riskScore += 3
  else if (temp < 0 || temp > 35) riskScore += 2
  else if (temp < 5 || temp > 30) riskScore += 1

  // 风速风险
  if (windSpeed > 20) riskScore += 3
  else if (windSpeed > 15) riskScore += 2
  else if (windSpeed > 10) riskScore += 1

  // 能见度风险
  if (visibility < 5) riskScore += 3
  else if (visibility < 10) riskScore += 2
  else if (visibility < 20) riskScore += 1

  // 天气现象风险
  if (weatherText.includes('暴雨') || weatherText.includes('暴雪') || weatherText.includes('大雾')) {
    riskScore += 3
  } else if (weatherText.includes('雨') || weatherText.includes('雪') || weatherText.includes('雾')) {
    riskScore += 2
  } else if (weatherText.includes('阴') || weatherText.includes('多云')) {
    riskScore += 1
  }

  // 根据总分确定风险等级
  if (riskScore >= 8) return 'extreme'
  else if (riskScore >= 6) return 'high'
  else if (riskScore >= 3) return 'medium'
  else return 'low'
}

// 根据风险等级获取颜色
function getRiskColor(riskLevel: string): string {
  switch (riskLevel) {
    case 'low': return '#10b981'      // 绿色
    case 'medium': return '#f59e0b'   // 橙色  
    case 'high': return '#ef4444'     // 红色
    case 'extreme': return '#dc2626'  // 深红色
    default: return '#6b7280'         // 灰色
  }
}

// 组件挂载时加载数据
onMounted(async () => {
  console.log('WeatherAnalysis 页面加载，路由参数:', route.query)
  
  // 处理路由参数
  if (route.query.origin && route.query.destination) {
    const [originLat, originLng] = (route.query.origin as string).split(',').map(Number)
    const [destLat, destLng] = (route.query.destination as string).split(',').map(Number)
    
    console.log('解析的坐标 - 起点:', originLat, originLng, '终点:', destLat, destLng)
    
    // 设置传统的路径参数
    routeOrigin.value = `${originLat},${originLng}`
    routeDestination.value = `${destLat},${destLng}`
    
    // 直接使用坐标创建起点和终点
    startCity.value = {
      name: `起点(${originLat.toFixed(4)}, ${originLng.toFixed(4)})`,
      lat: originLat,
      lng: originLng,
      adcode: '',
      level: ''
    }
    
    endCity.value = {
      name: `终点(${destLat.toFixed(4)}, ${destLng.toFixed(4)})`,
      lat: destLat,
      lng: destLng,
      adcode: '',
      level: ''
    }
    
    console.log('设置起点:', startCity.value.name)
    console.log('设置终点:', endCity.value.name)
    
    // 尝试匹配到最近的城市名称（仅用于显示）
    const originCity = majorCities.value.find(city => 
      Math.abs(city.lat - originLat) < 0.5 && Math.abs(city.lng - originLng) < 0.5
    )
    const destCity = majorCities.value.find(city => 
      Math.abs(city.lat - destLat) < 0.5 && Math.abs(city.lng - destLng) < 0.5
    )
    
    if (originCity) {
      startCity.value.name = originCity.name
      console.log('匹配到起点城市:', originCity.name)
    }
    if (destCity) {
      endCity.value.name = destCity.name
      console.log('匹配到终点城市:', destCity.name)
    }
  }

  await Promise.all([
    loadProvinceWeather(),
    loadWarnings()
  ])

  // 等待DOM更新后初始化地图
  await nextTick()
  await initRouteMap()

  // 如果有起点和终点，自动规划路线
  if (startCity.value && endCity.value) {
    console.log('自动规划路线 - 起点:', startCity.value.name, '终点:', endCity.value.name)
    setTimeout(async () => {
      await searchRoute()
    }, 1000) // 延迟1秒确保地图完全初始化
  }
  
  // 如果有路径参数或默认路径，进行分析
  if (routeOrigin.value && routeDestination.value) {
    if (route.query.showRoute === 'true') {
      await analyzeRouteWeather()
    }
  }

  // 添加键盘事件监听
  document.addEventListener('keydown', handleKeydown)
  // 初始化预警云图小地图
  await nextTick()
  initWarningCloudMap().catch(err => console.warn('初始化云图失败', err))
})

// 组件卸载时清理事件监听
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  // 恢复body样式
  document.body.style.overflow = ''
  // 销毁预警云图地图
  try { warningCloudTimer && clearInterval(warningCloudTimer) } catch {}
  try { warningCloudMap && warningCloudMap.destroy && warningCloudMap.destroy() } catch {}
})
// 订阅全局语音命令
onMounted(() => {
  onVoiceCommand((e) => {
    onVoiceCommandInFullscreen(e)
  })
})

</script>

<style scoped>
.weather-page {
  padding: clamp(12px, 2.2vw, 20px);
  max-width: 1400px;
  margin: 0 auto;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.5;
}

.page-header {
  margin-bottom: 24px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.title-group {
  min-width: 0;
}

.back-btn {
  flex: 0 0 auto;
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(2, 132, 199, 0.25);
  background: rgba(14, 165, 233, 0.08);
  color: #0284c7;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
}
.back-btn:hover {
  background: rgba(14, 165, 233, 0.14);
  border-color: rgba(2, 132, 199, 0.35);
}
.back-btn:active {
  transform: translateY(1px);
}

.page-header h2 {
  margin: 0 0 8px 0;
  /* 明亮主题：标题使用更亮的蓝色 */
  color: #0ea5e9; /* sky-500 */
  font-size: clamp(20px, 2.4vw, 30px);
  font-weight: 600;
}

.subtitle {
  margin: 0;
  /* 明亮主题：副标题使用浅蓝色 */
  color: #38bdf8; /* sky-400 */
  font-size: clamp(14px, 1.4vw, 16px);
}

.weather-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

/* 省份天气概览 */
.overview-card {
  height: 500px;
  display: flex;
  flex-direction: column;
}

.route-card {
  height: 500px;
  display: flex;
  flex-direction: column;
}

.overview-card > .fluent-card-content,
.route-card > .fluent-card-content {
  flex: 1;
  overflow: auto;
}

.province-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.province-item {
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
  border-left: 4px solid #e5e7eb;
  transition: transform 0.2s;
}

.province-item:hover {
  transform: translateY(-2px);
}

.province-name {
  font-weight: 600;
  /* 明亮主题：省份名称高亮 */
  color: #0ea5e9; /* sky-500 */
  margin-bottom: 4px;
}

.province-temp {
  font-size: 18px;
  font-weight: 700;
  /* 明亮主题：温度采用更醒目的深蓝 */
  color: #0284c7; /* sky-600 */
}

.province-weather {
  font-size: 13px;
  /* 明亮主题：天气描述采用浅蓝 */
  color: #38bdf8; /* sky-400 */
}

/* 路径分析 */
.location-inputs {
  display: flex;
  gap: 12px;
  align-items: end;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.input-group {
  flex: 1;
  min-width: 150px;
}

.input-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  /* 明亮主题：表单标签 */
  color: #0ea5e9; /* sky-500 */
}

.input-group input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}

.analyze-btn {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.analyze-btn:hover:not(:disabled) {
  background: #2563eb;
}

.analyze-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

/* 地图样式 */
.route-map-container {
  position: relative;
  margin: 16px 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.route-map {
  width: 100%;
  height: 600px;
  background: #f5f5f5;
}

.map-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 8px;
  z-index: 10;
}

.control-btn {
  padding: 6px 12px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.control-btn:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

.control-btn.active {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.route-analysis h4, .route-analysis h5 {
  margin: 16px 0 8px 0;
  /* 明亮主题：分析标题 */
  color: #0ea5e9; /* sky-500 */
}

.risk-summary {
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.risk-summary h4 {
  margin: 0 0 8px 0;
}

.risk-low { background: #dcfce7; border-left: 4px solid #22c55e; }
.risk-medium { background: #fef3c7; border-left: 4px solid #f59e0b; }
.risk-high { background: #fee2e2; border-left: 4px solid #ef4444; }
.risk-extreme { background: #fecaca; border-left: 4px solid #dc2626; }

.section-item, .alternative-item {
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
  margin-bottom: 8px;
}

.section-risk, .alt-description {
  font-weight: 600;
  /* 明亮主题：小节标题 */
  color: #0ea5e9; /* sky-500 */
}

.section-severity, .section-recommendation, .alt-distance, .alt-risk {
  font-size: 14px;
  /* 明亮主题：说明文本 */
  color: #38bdf8; /* sky-400 */
  margin-top: 4px;
}

.timing-info {
  background: #f0f9ff;
  padding: 12px;
  border-radius: 6px;
  margin-top: 16px;
}

.timing-item {
  margin: 4px 0;
  /* 明亮主题：时间建议颜色 */
  color: #0284c7; /* sky-600 */
}

/* 预警信息 */
.warnings-list {
  max-height: 400px;
  overflow-y: auto;
}

/* 云图区域 */
.warnings-cloud { margin-bottom: 12px; }
.warnings-cloud .cloud-title { font-weight: 600; color: #0ea5e9; margin-bottom: 6px; }
.warnings-cloud .cloud-source { color: #6b7280; font-size: 13px; margin-top: 6px; }
.cloud-map { width: 100%; height: 220px; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); border: 1px solid #e5e7eb; }

.warning-item {
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 12px;
  border-left: 4px solid #6b7280;
}

.level-blue { background: #dbeafe; border-left-color: #3b82f6; }
.level-yellow { background: #fef3c7; border-left-color: #f59e0b; }
.level-orange { background: #fed7aa; border-left-color: #ea580c; }
.level-red { background: #fee2e2; border-left-color: #dc2626; }

.warning-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.warning-type {
  font-weight: 600;
  /* 明亮主题：预警类型 */
  color: #0ea5e9; /* sky-500 */
}

.warning-level {
  font-size: 13px;
  padding: 2px 8px;
  background: rgba(0,0,0,0.1);
  border-radius: 12px;
}

.warning-title {
  font-weight: 500;
  margin-bottom: 4px;
  /* 明亮主题：预警标题 */
  color: #0ea5e9; /* sky-500 */
}

.warning-areas, .warning-logistics {
  font-size: 13px;
  /* 明亮主题：预警细节 */
  color: #38bdf8; /* sky-400 */
  margin: 2px 0;
}

/* 物流建议 */
.recommendation-categories {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.category h4 {
  margin: 0 0 12px 0;
  /* 明亮主题：分类标题 */
  color: #0ea5e9; /* sky-500 */
  font-size: 16px;
}

.category ul {
  margin: 0;
  padding: 0 0 0 16px;
  list-style: none;
}

.category li {
  margin: 6px 0;
  /* 明亮主题：列表项 */
  color: #0284c7; /* sky-600 */
  position: relative;
  font-size: 14px;
}

.category li::before {
  content: "✓";
  position: absolute;
  left: -16px;
  color: #10b981;
  font-weight: bold;
}

.loading, .no-data, .no-warnings {
  text-align: center;
  /* 明亮主题：空状态与加载 */
  color: #38bdf8; /* sky-400 */
  padding: 40px 20px;
  font-style: italic;
}

@media (max-width: 768px) {
  .weather-grid {
    grid-template-columns: 1fr;
  }
  
  .overview-card {
    grid-column: span 1;
  }
  
  .province-grid {
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  }
  
  .location-inputs {
    flex-direction: column;
  }
  
  .recommendation-categories {
    grid-template-columns: 1fr;
  }
}

/* 天气标记样式 */
:global(.weather-marker) {
  background: white;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  padding: 4px 8px;
  min-width: 60px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  font-size: 12px;
  cursor: pointer;
  transition: transform 0.2s;
}

:global(.weather-marker:hover) {
  transform: scale(1.05);
}

:global(.weather-marker .weather-temp) {
  font-weight: bold;
  font-size: 13px;
  /* 明亮主题：地图天气温度文字 */
  color: #0284c7; /* sky-600 */
  line-height: 1;
}

:global(.weather-marker .weather-desc) {
  font-size: 11px;
  /* 明亮主题：地图天气描述文字 */
  color: #38bdf8; /* sky-400 */
  margin-top: 2px;
}

:global(.route-weather-marker) {
  background: rgba(59, 130, 246, 0.9);
  color: white;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

:global(.route-weather-marker .temp) {
  line-height: 1;
}

/* 省份标记样式 */
:global(.province-marker) {
  border-radius: 8px;
  padding: 6px 10px;
  color: white;
  font-weight: bold;
  text-align: center;
  min-width: 50px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: transform 0.2s;
}

:global(.province-marker:hover) {
  transform: scale(1.1);
}

:global(.province-marker .province-name) {
  font-size: 12px;
  line-height: 1;
  margin-bottom: 2px;
}

:global(.province-marker .province-temp) {
  font-size: 13px;
  font-weight: bold;
  line-height: 1;
}

/* 路线天气标记样式 */
:global(.route-weather-marker) {
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: all 0.3s ease;
  background: linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1));
}

:global(.route-weather-marker:hover) {
  transform: scale(1.2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

:global(.route-weather-marker .temp) {
  font-size: 11px;
  font-weight: bold;
  color: white;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
  line-height: 1;
  margin-bottom: 1px;
}

:global(.route-weather-marker .weather-icon) {
  font-size: 11px;
  line-height: 1;
}

/* 风险警告信息窗样式 */
:global(.risk-warning) {
  padding: 8px 12px;
  border-radius: 6px;
  background: linear-gradient(135deg, #fee2e2, #fecaca);
  border: 1px solid #f87171;
  color: #dc2626;
  font-size: 13px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* 高德地图信息窗口样式重写 */
:global(.amap-info-window) {
  border-radius: 8px !important;
}

:global(.amap-info-window .amap-info-content) {
  border-radius: 6px !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

/* 起点终点标记样式 */
:global(.route-point-marker) {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

:global(.route-point-marker.start-marker) {
  color: #10b981;
}

:global(.route-point-marker.end-marker) {
  color: #ef4444;
}

:global(.route-point-marker .marker-icon) {
  font-size: 20px;
  line-height: 1;
  margin-bottom: 2px;
}

:global(.route-point-marker .marker-label) {
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 2px 6px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: bold;
  white-space: nowrap;
}

:global(.route-point-marker.start-marker .marker-label) {
  background: #10b981;
}

:global(.route-point-marker.end-marker .marker-label) {
  background: #ef4444;
}

/* 公开监控标记样式 */
:global(.public-camera-label) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #111827;
  color: #fff;
  border-radius: 14px;
  padding: 4px 8px;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 4px 10px rgba(0,0,0,0.25);
}
:global(.public-camera-label .icon){ font-size: 14px; }
:global(.public-camera-label .text){ line-height: 1; }

:global(.camera-infowin) { max-width: 260px; }
:global(.camera-infowin .title){ font-weight:700; margin-bottom:6px; color:#111; }
:global(.camera-infowin .meta){ font-size:13px; color:#555; margin-bottom:8px; }
:global(.camera-infowin .snapshot){ width:100%; max-height:160px; object-fit:cover; border-radius:6px; margin:6px 0; }
:global(.camera-infowin .links){ display:flex; gap:10px; margin-top:6px; }
:global(.camera-infowin .links a){ color:#2563eb; text-decoration:none; font-weight:600; }
:global(.camera-infowin .links a:hover){ text-decoration:underline; }
:global(.camera-infowin .tip){ margin-top:6px; color:#6b7280; font-size:12px; }

/* 路线规划地图样式 */
.route-map-section {
  margin-top: 24px;
}

.route-map-card {
  min-height: 600px;
}

.map-controls {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-group label {
  font-weight: 500;
  /* 明亮主题：控件标签 */
  color: #0ea5e9; /* sky-500 */
  min-width: 40px;
}

.city-select {
  padding: 8px 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  font-size: 14px;
  min-width: 120px;
  transition: border-color 0.2s;
}

.city-select:focus {
  outline: none;
  border-color: #3b82f6;
}

.search-btn, .clear-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.search-btn {
  background: #3b82f6;
  color: white;
  border: 2px solid #3b82f6;
}

.search-btn:hover:not(:disabled) {
  background: #2563eb;
  border-color: #2563eb;
}

.search-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.clear-btn {
  background: #f3f4f6;
  /* 明亮主题：清除按钮文字 */
  color: #0284c7; /* sky-600 */
  border: 2px solid #e5e7eb;
}

.clear-btn:hover {
  background: #e5e7eb;
}

.layer-controls {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.layer-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  /* 明亮主题：图层开关标签 */
  color: #0ea5e9; /* sky-500 */
}

.layer-toggle input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

.route-map {
  width: 100%;
  height: 400px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.route-info {
  margin-top: 16px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;
  border: 2px solid #e2e8f0;
}

.route-info h4 {
  margin: 0 0 12px 0;
  /* 明亮主题：路线信息标题 */
  color: #0ea5e9; /* sky-500 */
  font-size: 16px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: white;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.info-item .label {
  font-weight: 500;
  /* 明亮主题：信息项标签 */
  color: #7dd3fc; /* sky-300 */
}

.info-item .value {
  font-weight: 600;
  /* 明亮主题：信息项值 */
  color: #0ea5e9; /* sky-500 */
}

.province-risk-marker {
  background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.9));
  border: 2px solid #1890ff;
  border-radius: 8px;
  padding: 8px 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  font-size: 13px;
  font-weight: bold;
  text-align: center;
  min-width: 100px;
  backdrop-filter: blur(5px);
  transform: translate(-50%, -100%);
  margin-top: -10px;
}

.province-risk-marker .risk-level {
  font-size: 14px;
  margin-bottom: 4px;
}

.province-risk-marker .temperature {
  color: #666;
  font-size: 12px;
  margin-top: 2px;
}

/* 当前路线信息样式 */
.current-route-info {
  background: linear-gradient(135deg, #e8f5e8, #f0f8f0);
  border: 1px solid #52c41a;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  display: flex;
  gap: 20px;
  align-items: center;
}

.route-point {
  display: flex;
  align-items: center;
  gap: 8px;
}

.point-label {
  font-weight: 500;
  color: #52c41a;
}

.point-name {
  font-weight: 600;
  color: #2f54eb;
  background: rgba(255, 255, 255, 0.8);
  padding: 4px 8px;
  border-radius: 4px;
}

/* 地图容器样式 */
.map-container {
  position: relative;
  transition: all 0.3s ease;
}

/* 全屏模式遮罩层 */
.map-fullscreen-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 999999;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  box-sizing: border-box;
}

/* 全屏模式地图容器 */
.map-fullscreen-container {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

/* 全屏模式地图 */
.route-map-fullscreen {
  width: 100%;
  height: 100%;
  background: #f5f5f5;
}

.map-controls-overlay {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
}

.fullscreen-btn {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.fullscreen-btn:hover {
  background: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.map-container.fullscreen .fullscreen-btn {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
}

/* 悬浮信息面板样式 */
.floating-info { position: absolute; left: 16px; top: 16px; width: min(360px, 80vw); background: rgba(255,255,255,.92); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.25); overflow: hidden; backdrop-filter: blur(6px); }
.floating-header { display:flex; align-items:center; justify-content:space-between; padding: 10px 12px; background: rgba(0,0,0,.65); color: #fff; font-size:  14px; }
.floating-header .close{ border:none; background:transparent; color:#fff; font-size:18px; cursor:pointer; }
.floating-body{ padding: 10px 12px; color: #111; }
.risk-line{ display:flex; align-items:center; gap:8px; font-size: 13px; }
.risk-line .score{ margin-left:auto; font-weight:600; color:#2563eb; }
.sections{ margin-top: 8px; display:flex; flex-direction:column; gap:8px; }
.section{ background: rgba(0,0,0,.03); border: 1px solid rgba(0,0,0,.06); border-radius: 8px; padding:8px 10px; }
.section .t{ font-weight: 600; margin-bottom: 4px; }
.section .d{ font-size: 13px; color: #333; }
</style>

```

### 视频识别

```html
<template>
  <div class='screen'>
    <TopBar />
    <div class='body' :class='{ full: ui.fullscreen }' :style="{'--left-w': ui.drawer.leftWidth + 'px', '--right-w': ui.drawer.rightWidth + 'px'}">
      <!-- 视频播放区域 -->
      <div class='video-container'>
  <div class='video-wrapper' ref="videoWrapperRef">
          <video ref="videoRef" class='video-player' controls autoplay muted crossorigin="anonymous" playsinline>
            <source src="" type="video/mp4">
            您的浏览器不支持视频播放。
          </video>
          <!-- 识别框叠加层 -->
          <div class='recognition-overlay'>
            <div 
              v-for="detection in detections" 
              :key="detection.id"
              class='detection-box'
              :style="getBoxStyle(detection)"
            >
              <div class='detection-label'>
                {{ detection.label }} ({{ detection.confidence }}%)
              </div>
            </div>
          </div>
        </div>
        
        <!-- 视频控制面板 -->
        <div class='video-controls'>
          <select @change="loadTestVideo" v-model="selectedVideoId" class='video-selector'>
            <option value="">🎬 选择测试视频...</option>
            <option v-for="video in testVideos" :key="video.id" :value="video.id">
              {{ video.name }} - {{ video.description }}
            </option>
          </select>
          <button @click="selectVideoFile" class='control-btn'>
            <span>📁</span> 选择本地视频
          </button>
          <button 
            @click="toggleRecognition" 
            class='control-btn' 
            :class="{ 
              active: isRecognizing,
              loading: recognitionState === 'initializing' || recognitionState === 'warming_up'
            }"
            :disabled="recognitionState === 'initializing' || recognitionState === 'warming_up'"
          >
            <span v-if="recognitionState === 'initializing'">⏳</span>
            <span v-else-if="recognitionState === 'warming_up'">🔥</span>
            <span v-else>{{ isRecognizing ? '⏸️' : '▶️' }}</span>
            {{ getRecognitionButtonText() }}
          </button>
          <button @click="captureFrame" class='control-btn' :disabled="!videoRef">
            <span>📷</span> 截取帧
          </button>
          
          <!-- 状态指示器 -->
          <div class='status-indicator'>
            <div class='status-item'>
              <span class='status-label'>状态:</span>
              <span class='status-value' :class='`status-${recognitionState}`'>
                {{ getStatusText() }}
              </span>
            </div>
            <div class='status-item'>
              <span class='status-label'>模式:</span>
              <span class='status-value' :class='getModeClass()'>
                {{ getModeText() }}
              </span>
            </div>
            <div v-if="recognitionStats.fps > 0" class='status-item'>
              <span class='status-label'>FPS:</span>
              <span class='status-value'>{{ recognitionStats.fps }}</span>
            </div>
            <div v-if="recognitionStats.inferenceTime > 0" class='status-item'>
              <span class='status-label'>延迟:</span>
              <span class='status-value'>{{ recognitionStats.inferenceTime }}ms</span>
            </div>
          </div>
          
          <!-- 错误信息 -->
          <div v-if="errorMessage" class='error-message'>
            <span>⚠️</span> {{ errorMessage }}
            <button @click="errorMessage = ''" class='close-error'>×</button>
          </div>
        </div>
      </div>

      <!-- 左侧信息栏 -->
      <div class='drawer left' :class='{ open: ui.drawer.leftOpen || ui.drawer.leftPinned, pinned: ui.drawer.leftPinned }' 
           @mouseenter="ui.hover('left', true)" @mouseleave="ui.hover('left', false)">
        <div class='drawer-inner fluent-acrylic-strong'>
          <header class='drawer-header'>
            <h3>识别统计</h3>
            <button class='pin' @click="ui.togglePin('left')">
              {{ ui.drawer.leftPinned ? '取消固定' : '固定' }}
            </button>
          </header>
          <VideoRecognitionLeft class='panel' :detections="detections" :stats="recognitionStats" />
        </div>
        <button class='handle' @click="ui.toggleOpen('left')" @dblclick="ui.togglePin('left')" 
                aria-label='toggle left drawer'></button>
      </div>

      <!-- 右侧信息栏 -->
      <div class='drawer right' :class='{ open: ui.drawer.rightOpen || ui.drawer.rightPinned, pinned: ui.drawer.rightPinned }' 
           @mouseenter="ui.hover('right', true)" @mouseleave="ui.hover('right', false)">
        <div class='drawer-inner fluent-acrylic-strong'>
          <header class='drawer-header'>
            <h3>实时分析</h3>
            <button class='pin' @click="ui.togglePin('right')">
              {{ ui.drawer.rightPinned ? '取消固定' : '固定' }}
            </button>
          </header>
          <div class='panel'>
            <div class='fluent-card' style='padding:10px; border:1px solid rgba(255,255,255,.15); border-radius:10px; margin-bottom:8px;'>
              <h4 style='margin:6px 0 10px 0;'>跟踪设置</h4>
              <TrackingSettings />
            </div>
          </div>
          <VideoRecognitionRight class='panel' :detections="detections" :confidenceData="confidenceData" />
        </div>
        <button class='handle' @click="ui.toggleOpen('right')" @dblclick="ui.togglePin('right')" 
                aria-label='toggle right drawer'></button>
      </div>
    </div>
  </div>
</template>

<script setup lang='ts'>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import TopBar from '@/components/TopBar.vue'
import VideoRecognitionLeft from '@/components/VideoRecognitionLeft.vue'
import VideoRecognitionRight from '@/components/VideoRecognitionRight.vue'
import TrackingSettings from '@/components/TrackingSettings.vue'
import { useUIStore } from '@/stores/ui'
import { getRecognitionService, RecognitionState, type DetectionResult, type InferenceStats } from '@/services/recognition'
import { TestVideoManager } from '@/utils/testVideo'

const ui = useUIStore()
const route = useRoute()
const videoRef = ref<HTMLVideoElement>()
const videoWrapperRef = ref<HTMLDivElement>()
const isRecognizing = ref(false)
const recognitionService = getRecognitionService()
const recognitionState = ref<RecognitionState>(RecognitionState.UNINITIALIZED)
const errorMessage = ref<string>('')

// 测试视频数据
const testVideos = ref(TestVideoManager.getTestVideos())
const selectedVideoId = ref<string>('')
const DEFAULT_FIXED_VIDEO_SRC = '/Assets/data/b055d0c1228c117ae9f52286c92d706f.mp4'

// 检测结果数据
const detections = ref<DetectionResult[]>([])

// 识别统计数据
const recognitionStats = reactive({
  totalDetections: 0,
  peopleCount: 0,
  vehicleCount: 0,
  objectCount: 0,
  averageConfidence: 0,
  inferenceTime: 0,
  fps: 0,
  entered: 0,
  exited: 0,
})

// 置信度数据 (保持最近30个数据点)
const confidenceData = ref<Array<{ time: string, confidence: number }>>([])
const maxConfidencePoints = 30

// 推理循环
let inferenceLoop: number | null = null
let cancelVideoFrame: (()=>void) | null = null

// 加载测试视频
const loadTestVideo = async () => {
  if (!selectedVideoId.value || !videoRef.value) return
  
  try {
    // 切换源前优先停止上一源（特别是摄像头）
    TestVideoManager.stopVideo(videoRef.value)
    await TestVideoManager.loadTestVideo(videoRef.value, selectedVideoId.value)
    console.log(`已加载测试视频: ${selectedVideoId.value}`)
  } catch (error) {
    console.error('加载测试视频失败:', error)
    errorMessage.value = error instanceof Error ? error.message : '加载视频失败'
  }
}

function waitVideoCanPlay(video: HTMLVideoElement) {
  if (video.readyState >= 2) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      resolve()
    }, 8000)

    const onCanPlay = () => {
      cleanup()
      resolve()
    }

    const onError = () => {
      cleanup()
      reject(new Error('视频加载失败'))
    }

    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('error', onError)
    }

    video.addEventListener('canplay', onCanPlay, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

const loadFixedVideo = async () => {
  if (!videoRef.value) return
  TestVideoManager.stopVideo(videoRef.value)

  const currentSrc = videoRef.value.currentSrc || videoRef.value.src || ''
  if (!currentSrc.endsWith(DEFAULT_FIXED_VIDEO_SRC)) {
    videoRef.value.src = DEFAULT_FIXED_VIDEO_SRC
    videoRef.value.load()
  }

  await waitVideoCanPlay(videoRef.value)

  try {
    await videoRef.value.play()
  } catch {
    // 某些浏览器策略下可能被阻止；忽略，识别仍可执行
  }
}

const selectVideoFile = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'video/*'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file && videoRef.value) {
      // 如果之前是摄像头，先停止
      TestVideoManager.stopVideo(videoRef.value)
      const url = URL.createObjectURL(file)
      videoRef.value.src = url
      videoRef.value.load()
    }
  }
  input.click()
}

const toggleRecognition = async () => {
  if (isRecognizing.value) {
    stopRecognition()
  } else {
    await ensureRecognitionInitialized()
    startRecognition()
  }
}

let initPromise: Promise<void> | null = null

function syncRecognitionState() {
  try {
    recognitionState.value = recognitionService.getState()
  } catch {}
}

function waitForRecognitionReady(timeoutMs = 12000) {
  const current = recognitionService.getState()
  if (current === RecognitionState.READY || current === RecognitionState.RUNNING) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    const off = recognitionService.onStateChange((s) => {
      recognitionState.value = s
      if (s === RecognitionState.READY || s === RecognitionState.RUNNING) {
        cleanup()
        resolve()
      }
      if (s === RecognitionState.ERROR) {
        cleanup()
        reject(new Error('识别服务初始化失败'))
      }
    })

    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('识别服务初始化超时'))
    }, timeoutMs)

    const cleanup = () => {
      window.clearTimeout(timer)
      try { off?.() } catch {}
    }
  })
}

const ensureRecognitionInitialized = async () => {
  syncRecognitionState()
  const current = recognitionService.getState()

  if (current === RecognitionState.READY || current === RecognitionState.RUNNING) return
  if (current === RecognitionState.INITIALIZING || current === RecognitionState.WARMING_UP) {
    await waitForRecognitionReady()
    return
  }

  if (initPromise) {
    await initPromise
    return
  }

  initPromise = (async () => {
    try {
      errorMessage.value = ''
      const s = recognitionService.getState()
      if (s === RecognitionState.UNINITIALIZED) {
        await recognitionService.initialize()
      }
      // warmup 只允许 READY 状态
      if (recognitionService.getState() === RecognitionState.READY) {
        await recognitionService.warmup()
      }
      await waitForRecognitionReady()
    } catch (error) {
      errorMessage.value = `初始化失败: ${error instanceof Error ? error.message : String(error)}`
      console.error('Recognition initialization failed:', error)
      throw error
    } finally {
      initPromise = null
      syncRecognitionState()
    }
  })()

  await initPromise
}

const startRecognition = () => {
  syncRecognitionState()
  if (recognitionState.value !== RecognitionState.READY) {
    errorMessage.value = '推理服务未就绪'
    return
  }
  
  if (!videoRef.value) {
    errorMessage.value = '请先选择视频文件'
    return
  }
  
  isRecognizing.value = true
  
  const useRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype

  if (useRVFC && videoRef.value?.requestVideoFrameCallback) {
    const loop = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (!isRecognizing.value || !videoRef.value) return
      // 某些实现会将 metadata.mediaTime 提供为秒，传递给服务更稳
      ;(recognitionService as any)._rvfcTs = (metadata && typeof metadata.mediaTime === 'number') ? metadata.mediaTime * 1000 : undefined
      recognitionService.inferFrame(videoRef.value)
      videoRef.value.requestVideoFrameCallback(loop)
    }
    videoRef.value.requestVideoFrameCallback(loop)
    cancelVideoFrame = () => {
      // 无直接 cancel API；通过状态位退出
      cancelVideoFrame = null
    }
  } else {
    const runInference = () => {
      if (!isRecognizing.value || !videoRef.value) return
      recognitionService.inferFrame(videoRef.value)
      inferenceLoop = requestAnimationFrame(runInference)
    }
    runInference()
  }
}

const stopRecognition = () => {
  isRecognizing.value = false
  recognitionService.stop()
  
  if (inferenceLoop) {
    cancelAnimationFrame(inferenceLoop)
    inferenceLoop = null
  }
  if (cancelVideoFrame) {
    cancelVideoFrame()
    cancelVideoFrame = null
  }
}

const updateStats = (stats?: InferenceStats) => {
  recognitionStats.totalDetections = detections.value.length
  recognitionStats.peopleCount = detections.value.filter(d => d.label === '人员').length
  recognitionStats.vehicleCount = detections.value.filter(d => 
    d.label === '汽车' || d.label === '卡车' || d.label === '公交车' || d.label === '摩托车'
  ).length
  recognitionStats.objectCount = detections.value.length - recognitionStats.peopleCount - recognitionStats.vehicleCount
  
  if (detections.value.length > 0) {
    recognitionStats.averageConfidence = Math.round(
      detections.value.reduce((sum, d) => sum + d.confidence, 0) / detections.value.length
    )
  } else {
    recognitionStats.averageConfidence = 0
  }
  
  if (stats) {
    recognitionStats.inferenceTime = stats.timeMs
    recognitionStats.fps = stats.fps
    
    // 更新置信度趋势数据
    const now = new Date()
    const timeStr = now.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    })
    
    confidenceData.value.push({
      time: timeStr,
      confidence: recognitionStats.averageConfidence
    })
    
    // 保持最近30个数据点
    if (confidenceData.value.length > maxConfidencePoints) {
      confidenceData.value.shift()
    }
  }
}

const captureFrame = () => {
  if (videoRef.value) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = videoRef.value.videoWidth
    canvas.height = videoRef.value.videoHeight
    ctx?.drawImage(videoRef.value, 0, 0)
    
    // 下载截图
    const link = document.createElement('a')
    link.download = `capture_${Date.now()}.png`
    link.href = canvas.toDataURL()
    link.click()
  }
}

// 计算视频在容器中的实际显示矩形（考虑 object-fit: contain 的留黑）
function getDisplayedRect() {
  const video = videoRef.value
  const wrapper = videoWrapperRef.value
  if (!video || !wrapper || !video.videoWidth || !video.videoHeight) {
    return { x: 0, y: 0, w: wrapper?.clientWidth ?? 0, h: wrapper?.clientHeight ?? 0 }
  }
  const vw = video.videoWidth
  const vh = video.videoHeight
  const cw = wrapper.clientWidth
  const ch = wrapper.clientHeight
  const videoAR = vw / vh
  const containerAR = cw / ch
  if (containerAR > videoAR) {
    // 高度贴合，左右留边
    const h = ch
    const w = Math.round(h * videoAR)
    const x = Math.round((cw - w) / 2)
    const y = 0
    return { x, y, w, h }
  } else {
    // 宽度贴合，上下留边
    const w = cw
    const h = Math.round(w / videoAR)
    const x = 0
    const y = Math.round((ch - h) / 2)
    return { x, y, w, h }
  }
}

// 将检测结果（以原始帧百分比）映射到容器像素坐标
function getBoxStyle(d: DetectionResult) {
  const rect = getDisplayedRect()
  const left = rect.x + (d.x / 100) * rect.w
  const top = rect.y + (d.y / 100) * rect.h
  const width = (d.width / 100) * rect.w
  const height = (d.height / 100) * rect.h
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  }
}

// 获取识别按钮文本
const getRecognitionButtonText = () => {
  switch (recognitionState.value) {
    case RecognitionState.INITIALIZING:
      return '初始化中...'
    case RecognitionState.WARMING_UP:
      return '预热中...'
    case RecognitionState.RUNNING:
      return '停止识别'
    case RecognitionState.READY:
      return isRecognizing.value ? '停止识别' : '开始识别'
    case RecognitionState.ERROR:
      return '重新初始化'
    default:
      return '初始化识别'
  }
}

// 获取状态文本
const getStatusText = () => {
  switch (recognitionState.value) {
    case RecognitionState.UNINITIALIZED:
      return '未初始化'
    case RecognitionState.INITIALIZING:
      return '初始化中'
    case RecognitionState.WARMING_UP:
      return '预热中'
    case RecognitionState.READY:
      return isRecognizing.value ? '运行中' : '就绪'
    case RecognitionState.RUNNING:
      return '推理中'
    case RecognitionState.ERROR:
      return '错误'
    default:
      return '未知状态'
  }
}

// 获取模式文本
const getModeText = () => {
  const options = recognitionService.getOptions()
  return options.mockMode ? '演示模式' : 'AI模式'
}

// 获取模式样式类
const getModeClass = () => {
  const options = recognitionService.getOptions()
  return options.mockMode ? 'mode-demo' : 'mode-ai'
}

// 设置事件监听器
const setupRecognitionListeners = () => {
  recognitionService.onStateChange((state) => {
    recognitionState.value = state
  })
  syncRecognitionState()
  
  recognitionService.onResult((results, stats) => {
    detections.value = results
    updateStats(stats)
  })
  // 监听跟踪进入/离开事件
  // @ts-ignore 获取具体实现的 onTrackEvent
  if (typeof (recognitionService as any).onTrackEvent === 'function') {
    ;(recognitionService as any).onTrackEvent((ev: { entered: number; exited: number }) => {
      recognitionStats.entered += ev.entered
      recognitionStats.exited += ev.exited
    })
  }
  
  recognitionService.onError((error) => {
    errorMessage.value = error
    isRecognizing.value = false
  })
}

onMounted(() => {
  setupRecognitionListeners()
  updateStats()
  // 如果通过 URL 参数指定了测试源（如 ?source=webcam），则自动加载并启动识别
  const source = (route.query.source as string | undefined)?.toString()

  // 异步串行执行：加载视频/摄像头 -> 初始化/预热 -> 开始识别
  ;(async () => {
    try {
      if (source) {
        selectedVideoId.value = source
        await loadTestVideo()
      } else {
        // 默认固定视频：public/Assets/data/... -> /Assets/data/...
        await loadFixedVideo()
      }

      await ensureRecognitionInitialized()
      startRecognition()
    } catch (e) {
      console.error('自动启动失败:', e)
      errorMessage.value = e instanceof Error ? e.message : '自动启动失败'
    }
  })()
})

onUnmounted(() => {
  stopRecognition()
  // 注意：不销毁service，因为它是单例，可能被其他组件使用
})
</script>

<style scoped>
.screen {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.5;
}

.body {
  position: relative;
  flex: 1;
  min-height: 0;
}

.body.full > :not(.video-container) {
  display: none;
}

.body.full .video-container {
  margin: 8px;
}

.video-container {
  position: absolute;
  inset: 8px;
  border-radius: 14px;
  overflow: hidden;
  background: #000;
  display: flex;
  flex-direction: column;
}

.video-wrapper {
  position: relative;
  flex: 1;
  min-height: 0;
}

.video-player {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.recognition-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.detection-box {
  position: absolute;
  border: 2px solid #4C8BF5;
  border-radius: 4px;
  background: rgba(76, 139, 245, 0.1);
}

.detection-label {
  position: absolute;
  top: -28px;
  left: 0;
  background: #4C8BF5;
  color: white;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 13px;
  white-space: nowrap;
}

.video-controls {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  flex-wrap: wrap;
  align-items: center;
}

.video-selector {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: white;
  cursor: pointer;
  font-size: 14px;
  min-width: 150px;
  transition: all 0.3s ease;
}

.video-selector:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.video-selector option {
  background: #2a2a2a;
  color: white;
}

.control-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 14px;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.control-btn.active {
  background: #4C8BF5;
  border-color: #4C8BF5;
}

.control-btn.loading {
  background: #FFC107;
  border-color: #FFC107;
  cursor: not-allowed;
}

.control-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-indicator {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.status-label {
  opacity: 0.7;
}

.status-value {
  font-weight: bold;
}

.status-uninitialized {
  color: #666;
}

.status-initializing,
.status-warming_up {
  color: #FFC107;
}

.status-ready {
  color: #00BFA5;
}

.status-running {
  color: #4C8BF5;
}

.status-error {
  color: #F44336;
}

.mode-demo {
  color: #FF9800;
}

.mode-ai {
  color: #4CAF50;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid rgba(244, 67, 54, 0.3);
  border-radius: 6px;
  color: #F44336;
  font-size: 13px;
  flex: 1;
  min-width: 200px;
}

.close-error {
  background: none;
  border: none;
  color: #F44336;
  cursor: pointer;
  font-size: 16px;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-error:hover {
  background: rgba(244, 67, 54, 0.1);
  border-radius: 50%;
}

.drawer {
  position: absolute;
  top: 8px;
  bottom: 8px;
  transition: transform .25s ease, opacity .25s ease;
  z-index: 50;
  opacity: .98;
  pointer-events: none;
}

.drawer.left {
  left: 8px;
  width: var(--left-w, 360px);
  transform: translateX(calc(-100% + 10px));
}

.drawer.right {
  right: 8px;
  width: var(--right-w, 360px);
  transform: translateX(calc(100% - 10px));
}

.drawer .drawer-inner {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
  box-sizing: border-box;
  overflow: hidden;
}

.drawer .drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.drawer .pin {
  border: 1px solid rgba(255, 255, 255, .15);
  background: transparent;
  color: #fff;
  padding: 6px 10px;
  border-radius: 10px;
  cursor: pointer;
}

.drawer .pin:hover {
  background: rgba(255, 255, 255, .08);
}

.drawer.open,
.drawer.pinned {
  pointer-events: auto;
  transform: translateX(0);
}

.handle {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 72px;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, .35);
  border: none;
  border-radius: 5px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, .25);
  pointer-events: auto;
}

.drawer.left .handle {
  right: -10px;
}

.drawer.right .handle {
  left: -10px;
}

.handle:hover {
  background: rgba(255, 255, 255, .55);
}

.panel {
  flex: 1;
  min-height: 0;
}

@media (max-width: 768px) {
  .video-controls {
    gap: 10px;
    padding: 12px;
  }

  .video-selector {
    min-width: 0;
    flex: 1;
  }

  .status-indicator {
    gap: 12px;
  }
}
</style>

```



### 火灾疏散演示

```html
<template>
  <div class='screen'>
    <TopBar />
    <div class='body' :class='{ full: ui.fullscreen }'>
      <!-- 页面标题 -->
      <div class='page-header'>
        <h2 class='page-title'>🔥 火灾疏散模拟视频</h2>
        <p class='page-description'>观看不同场景下的火灾疏散模拟演示</p>
      </div>
      
      <!-- 视频网格容器 -->
      <div class='video-grid'>
        <div 
          v-for="video in evacuationVideos" 
          :key="video.id"
          class='video-card'
          :class="{ active: selectedVideo?.id === video.id }"
        >
          <div class='video-thumbnail' @click="selectVideo(video)">
            <div class='video-icon'>
              {{ video.icon }}
            </div>
            <div class='video-info'>
              <h3 class='video-title'>{{ video.title }}</h3>
              <p class='video-desc'>{{ video.description }}</p>
              <div class='video-meta'>
                <span class='duration'>{{ video.duration }}</span>
                <span class='category'>{{ video.category }}</span>
              </div>
            </div>
            <div class='play-button'>
              <span>▶️</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 视频播放器 -->
      <div class='video-player-section' v-if="selectedVideo">
        <div class='player-header'>
          <h3>{{ selectedVideo.title }}</h3>
          <button class='close-btn' @click="closePlayer">✕</button>
        </div>
        <div class='video-wrapper'>
          <video 
            ref="videoPlayerRef"
            class='video-player' 
            :src="currentVideoSrc"
            :poster="selectedVideo.poster"
            playsinline
            muted
            autoplay
          >
            您的浏览器不支持视频播放。
          </video>
          <!-- 自定义最小控件：隐藏原生进度条 -->
          <div class="custom-controls">
            <button class="ctrl-btn" @click="togglePlay">
              {{ isPlaying ? '暂停' : '播放' }}
            </button>
            <button class="ctrl-btn" @click="toggleMute">
              {{ isMuted ? '取消静音' : '静音' }}
            </button>
          </div>
          <!-- 加载指示器 -->
          <div v-if="isVideoLoading" class="video-loading">
            <div class="loading-spinner"></div>
            <p>正在加载视频...</p>
          </div>
        </div>
        <div class='video-details'>
          <p class='video-description'>{{ selectedVideo.fullDescription }}</p>
          <!-- 视角切换 -->
          <div class="view-switcher">
            <span class="label">视角：</span>
            <div class="views">
              <button
                v-for="view in selectedVideo.views"
                :key="view.id"
                class="view-btn"
                :class="{ active: currentViewId === view.id }"
                @click="switchView(view.id)"
              >
                {{ view.name }}
              </button>
            </div>
          </div>
          <div class='video-tags'>
            <span class='tag' v-for="tag in selectedVideo.tags" :key="tag">{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang='ts'>
import { ref, onMounted, computed } from 'vue'
import TopBar from '@/components/TopBar.vue'
import { useUIStore } from '@/stores/ui'

const ui = useUIStore()

interface VideoItem {
  id: string
  title: string
  description: string
  fullDescription: string
  poster?: string
  duration: string
  category: string
  icon: string
  tags: string[]
  views: Array<{ id: string; name: string; src: string; default?: boolean }>
}

const selectedVideo = ref<VideoItem | null>(null)
const videoPlayerRef = ref<HTMLVideoElement | null>(null)
const isVideoLoading = ref(false)
const currentViewId = ref<string | null>(null)
const isPlaying = ref(false)
const isMuted = ref(true)
const currentVideoSrc = computed(() => {
  if (!selectedVideo.value) return ''
  const view = selectedVideo.value.views.find(v => v.id === currentViewId.value) || selectedVideo.value.views[0]
  return view?.src || ''
})

const evacuationVideos: VideoItem[] = [
  {
    id: 'personnel',
    title: '人员疏散',
    description: '火灾场景下人员有序疏散的模拟演示',
    fullDescription: '本视频展示了在火灾紧急情况下，人员如何通过安全出口进行有序疏散的完整过程。包括疏散路线选择、人流控制和安全防护措施。',
    duration: '未知',
    category: '人员安全',
    icon: '🚶‍♂️',
    tags: ['人员疏散', '安全出口', '紧急避险', '消防安全'],
    views: [
      { id: 'default', name: '默认视角', src: '/FireEvacuation/人员疏散.mp4', default: true },
      { id: 'north-gate', name: '北门视角', src: '/FireEvacuation/人员北门视角.mp4' }
    ]
  },
  {
    id: 'vehicle',
    title: '车辆疏散',
    description: '火灾场景下车辆快速疏散的模拟演示',
    fullDescription: '本视频模拟了停车场或道路发生火灾时，车辆如何快速有序地撤离现场，避免交通拥堵，确保疏散通道畅通。',
    duration: '未知',
    category: '交通管理',
    icon: '🚗',
    tags: ['车辆疏散', '交通管制', '应急撤离', '道路安全'],
    views: [
      { id: 'default', name: '默认视角', src: '/FireEvacuation/车辆疏散.mp4', default: true }
    ]
  },
  {
    id: 'mixed',
    title: '人车混流',
    description: '人员与车辆混合疏散的复杂场景模拟',
    fullDescription: '本视频展示了最复杂的疏散场景：人员和车辆需要同时疏散的情况。演示了如何协调人车混流，确保疏散效率和安全性。',
    duration: '未知',
    category: '综合疏散',
    icon: '🚶‍♂️🚗',
    tags: ['人车混流', '协调疏散', '复合场景', '应急管理'],
    views: [
      { id: 'default', name: '默认视角', src: '/FireEvacuation/人车混流.mp4', default: true },
      { id: 'north-gate', name: '北门视角', src: '/FireEvacuation/人车混流北门视角.mp4' }
    ]
  }
]

const selectVideo = (video: VideoItem) => {
  if (selectedVideo.value?.id === video.id) {
    // 如果点击的是当前正在播放的视频，不需要重新加载
    return
  }
  
  selectedVideo.value = video
  isVideoLoading.value = true
  // 初始化当前视角
  currentViewId.value = video.views.find(v => v.default)?.id || video.views[0]?.id || null
  
  // 等待DOM更新后重新加载视频
  setTimeout(() => {
    if (videoPlayerRef.value) {
      // 添加事件监听器
      const handleLoadedData = () => {
        isVideoLoading.value = false
        videoPlayerRef.value?.removeEventListener('loadeddata', handleLoadedData)
        isPlaying.value = !videoPlayerRef.value?.paused
        isMuted.value = !!videoPlayerRef.value?.muted
      }
      
      const handleError = () => {
        isVideoLoading.value = false
        console.error('视频加载失败')
        videoPlayerRef.value?.removeEventListener('error', handleError)
      }
      
      videoPlayerRef.value.addEventListener('loadeddata', handleLoadedData)
      videoPlayerRef.value.addEventListener('error', handleError)
      
      videoPlayerRef.value.load() // 重新加载视频源
      videoPlayerRef.value.play().catch(err => {
        console.log('视频自动播放失败，需要用户手动播放:', err)
        isVideoLoading.value = false
      })
    }
    
    // 滚动到播放器区域
    const playerSection = document.querySelector('.video-player-section')
    if (playerSection) {
      playerSection.scrollIntoView({ behavior: 'smooth' })
    }
  }, 100)
}

const closePlayer = () => {
  if (videoPlayerRef.value) {
    videoPlayerRef.value.pause()
    videoPlayerRef.value.currentTime = 0
  }
  selectedVideo.value = null
  isVideoLoading.value = false
  currentViewId.value = null
}

onMounted(() => {
  // 页面加载时可以执行一些初始化操作
  console.log('火灾疏散页面已加载')
})

// 视角切换：按进度比例保持时间点
const switchView = (viewId: string) => {
  if (!selectedVideo.value || !videoPlayerRef.value) return
  if (currentViewId.value === viewId) return

  const videoEl = videoPlayerRef.value
  const oldDuration = Math.max(videoEl.duration || 0, 0.00001)
  const progress = videoEl.currentTime / oldDuration

  currentViewId.value = viewId
  isVideoLoading.value = true

  // 重新绑定一次 loadedmetadata 以便跳转进度
  const onLoadedMeta = () => {
    const newDuration = Math.max(videoEl.duration || 0, 0.00001)
    videoEl.currentTime = Math.min(newDuration * progress, newDuration - 0.05)
    videoEl.play().catch(() => {})
    isVideoLoading.value = false
    isPlaying.value = !videoEl.paused
    isMuted.value = !!videoEl.muted
    videoEl.removeEventListener('loadedmetadata', onLoadedMeta)
  }
  videoEl.addEventListener('loadedmetadata', onLoadedMeta)
  // 触发重新加载
  videoEl.load()
}

// 播放控制
const togglePlay = () => {
  const el = videoPlayerRef.value
  if (!el) return
  if (el.paused) {
    el.play().then(() => {
      isPlaying.value = true
    }).catch(() => {})
  } else {
    el.pause()
    isPlaying.value = false
  }
}

const toggleMute = () => {
  const el = videoPlayerRef.value
  if (!el) return
  el.muted = !el.muted
  isMuted.value = el.muted
}
</script>

<style scoped>
.screen {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #fff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.5;
}

.body {
  flex: 1;
  min-height: 0;
  padding: clamp(12px, 2.2vw, 20px);
  overflow-y: auto;
}

.body.full {
  padding: 8px;
}

.page-header {
  text-align: center;
  margin-bottom: 30px;
  padding: 20px;
}

.page-title {
  font-size: clamp(1.6rem, 4vw, 2.5rem);
  font-weight: bold;
  margin-bottom: 10px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.page-description {
  font-size: clamp(0.95rem, 2vw, 1.1rem);
  color: #b0b0b0;
  margin: 0;
}

/* 视频网格布局 */
.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: clamp(12px, 2vw, 20px);
  margin: 0 auto 40px;
  max-width: 1200px;
}

.video-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.video-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  background: rgba(255, 255, 255, 0.08);
}

.video-card.active {
  border-color: #ff6b35;
  box-shadow: 0 0 20px rgba(255, 107, 53, 0.3);
}

.video-thumbnail {
  padding: 20px;
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  gap: 15px;
}

.video-icon {
  font-size: 3rem;
  min-width: 80px;
  text-align: center;
}

.video-info {
  flex: 1;
}

.video-title {
  font-size: 1.4rem;
  font-weight: bold;
  color: #fff;
  margin: 0 0 8px 0;
}

.video-desc {
  color: #b0b0b0;
  font-size: 0.95rem;
  margin: 0 0 10px 0;
  line-height: 1.4;
}

.video-meta {
  display: flex;
  gap: 15px;
}

.duration, .category {
  font-size: 0.85rem;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.play-button {
  font-size: 1.5rem;
  opacity: 0.7;
  transition: opacity 0.3s ease;
}

.video-card:hover .play-button {
  opacity: 1;
}

/* 视频播放器样式 */
.video-player-section {
  max-width: 1000px;
  margin: 0 auto;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 16px;
  padding: 20px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.player-header h3 {
  color: #fff;
  font-size: 1.5rem;
  margin: 0;
}

.close-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  font-size: 1.2rem;
  width: 35px;
  height: 35px;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.3s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.video-wrapper {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 15px;
}

.video-player {
  width: 100%;
  height: auto;
  max-height: 60vh;
  background: #000;
}

/* 自定义控制条 */
.custom-controls {
  position: absolute;
  left: 10px;
  bottom: 10px;
  display: flex;
  gap: 8px;
  z-index: 2;
}

.ctrl-btn {
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.ctrl-btn:hover {
  background: rgba(0, 0, 0, 0.65);
}

.video-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  border-radius: 12px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top: 3px solid #ff6b35;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.video-details {
  padding: 15px 0;
}

.view-switcher {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.view-switcher .label {
  color: #fff;
  opacity: 0.8;
}

.views {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.view-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.9rem;
}

.view-btn.active, .view-btn:hover {
  background: rgba(255, 107, 53, 0.25);
  border-color: rgba(255, 107, 53, 0.5);
}

.video-description {
  color: #d0d0d0;
  font-size: 1rem;
  line-height: 1.6;
  margin-bottom: 15px;
}

.video-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  background: rgba(255, 107, 53, 0.2);
  color: #ff6b35;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.85rem;
  border: 1px solid rgba(255, 107, 53, 0.3);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .video-grid {
    grid-template-columns: 1fr;
    gap: 15px;
  }
  
  .page-title {
    font-size: 2rem;
  }
  
  .video-thumbnail {
    flex-direction: column;
    text-align: center;
    gap: 10px;
  }
  
  .video-icon {
    min-width: auto;
  }
  
  .body {
    padding: 15px;
  }
}

@media (max-width: 480px) {
  .page-title {
    font-size: 1.5rem;
  }
  
  .video-card {
    margin: 0 -5px;
  }
  
  .body {
    padding: 10px;
  }
}
</style>

```



### 语音/ai助手

```html
<template>
  <div class="voice-assistant" v-show="visible">
    <!-- 主要语音按钮 -->
    <button 
      v-if="supported" 
      class="voice-button" 
      :class="{ listening, processing: isProcessing, locked: aiReplyLock }" 
      @click="onVoiceButtonClick"
      :disabled="aiReplyLock"
      :title="aiReplyLock ? 'AI 正在回复，暂不接收语音' : (listening ? '点击停止语音' : '点击开始语音')"
    >
      <span v-if="!listening && !isProcessing">🎤</span>
      <span v-else-if="listening">🟢</span>
      <span v-else-if="isProcessing">⚡</span>
    </button>
    <button 
      v-else 
      class="voice-button unsupported" 
      disabled
      title="当前浏览器不支持语音识别"
    >❌</button>

    <!-- 语音反馈面板 -->
    <div class="voice-feedback" :class="{ visible: feedbackVisible }">
      <div v-if="interim" class="interim">正在识别: {{ interim }}</div>
      <div v-if="finalText" class="final">识别结果: {{ finalText }}</div>
      <div v-if="lastCommand && lastCommand !== finalText" class="last-command">
        上次命令: {{ lastCommand }}
      </div>
      <div v-if="error" class="error">{{ error }}</div>
      <div v-if="isProcessing" class="processing">正在处理命令...</div>
    </div>

    <!-- 语音状态指示器 -->
    <div class="voice-status" :class="{ visible: statusVisible }">
      <span v-if="listening">🎤 正在聆听...</span>
      <span v-else-if="isProcessing">⚡ 处理中...</span>
      <span v-else-if="!supported">❌ 不支持语音识别</span>
    </div>

    <!-- 命令提示面板 -->
    <div class="voice-commands" :class="{ visible: showCommands }" @click.stop>
      <div class="commands-header">
        <h4>📢 语音命令帮助</h4>
        <button class="close-commands" @click="showCommands = false">×</button>
      </div>
      <div class="commands-content">
        <div class="command-category">
          <h5>� 唤醒助手</h5>
          <ul>
            <li>先说“{{ WAKE_PROMPT }}”唤醒后再给其它指令</li>
          </ul>
        </div>
        <div class="command-category">
          <h5>�🔍 查询控制</h5>
          <ul>
            <li>“查询”/“搜索”/“规划” - 执行查询</li>
            <li>“起点北京终点上海” 或 “从北京到上海” - 设置起终点</li>
            <li>“明天8点”/“8点半” - 设置出发时间</li>
            <li>“明天上午8点到下午2点” - 设置时间窗</li>
            <li>“小货车/面包车/中型货车/重卡” - 选择车辆类型</li>
            <li>“载重2吨”/“500公斤” - 设置载重</li>
            <li>“冷链/危化/易碎/普通” - 设置运输要求</li>
            <li>“温控2到8度” - 设置温控范围</li>
            <li>“撤销/回退” - 撤销上一步</li>
          </ul>
        </div>
        <div class="command-category">
          <h5>🧭 页面导航</h5>
          <ul>
            <li>"首页" / "主页" - Dashboard</li>
            <li>"路线规划" / "导航规划" - 路线规划</li>
            <li>"商家推荐" / "推荐" - 商家推荐</li>
            <li>"天气分析" / "天气" - 天气分析</li>
            <li>"天气测试" - 天气测试</li>
            <li>"视频识别" / "目标识别" - 视频识别</li>
            <li>"疏散" / "消防演练" - 疏散演练</li>
            <li>"古景" / "古场景" - 古景场景</li>
          </ul>
        </div>
        <div class="command-category">
          <h5>🌤️ 界面控制</h5>
          <ul>
            <li>“全屏/退出全屏” - 切换显示</li>
            <li>“天气图层” - 切换天气图层</li>
            <li>“关闭/退出” - 关闭面板</li>
            <li>“帮助/命令” - 打开本帮助</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 帮助按钮 -->
    <button class="help-button" @click="toggleCommands" title="语音命令帮助">
      ❓
    </button>

    <!-- 聊天面板开关 -->
    <button class="chat-button" @click="toggleChatPanel" title="AI 助手">
      💬
    </button>

    <!-- LKE 聊天面板（增强：增量合并、事件折叠、状态与TTS） -->
    <div class="lke-chat" :class="{ visible: showChatPanel }" @click.stop>
      <div class="lke-chat__header">
        <span>AI 助手</span>
        <small v-if="!lkeReady">（未就绪，发送或语音将自动初始化）</small>
        <div class="hdr-actions">
          <button class="clear-chat" @click="onClearChat" title="清空聊天">🗑️</button>
          <button class="close-commands" @click="showChatPanel = false" title="关闭">×</button>
        </div>
      </div>
      <div class="lke-chat__body">
        <div class="lke-status">
          <span class="badge" :class="statusClass">{{ statusText }}</span>
          <label class="tts-toggle">
            <input type="checkbox" v-model="enableTTS" /> 语音播报
          </label>
        </div>
        <div v-if="lkeError" class="error">{{ lkeError }}</div>
        <div class="lke-msg-list">
          <div v-for="(m, i) in lkeMessages" :key="i" class="lke-msg" :class="m.role">
            <span class="role">{{ m.role === 'user' ? '我' : 'AI' }}</span>
            <div class="bubble" :class="{ typing: streaming && i === lastAssistantIndex }">
              <template v-if="m.role === 'assistant'">
                <div class="content md" :style="contentStyle(m)" v-html="renderMarkdown(m.content)"></div>
              </template>
              <template v-else>
                <span class="content" :style="contentStyle(m)">{{ m.content }}</span>
              </template>
              <span v-if="streaming && i === lastAssistantIndex" class="cursor">▌</span>
            </div>
          </div>
        </div>
        <!-- 事件折叠区 -->
        <details class="evt" v-if="thoughtLog.length">
          <summary>思考过程 thought ({{ thoughtLog.length }})</summary>
          <pre class="evt-pre">{{ thoughtLog.join('\n') }}</pre>
        </details>
        <details class="evt" v-if="tokenStat">
          <summary>token 统计</summary>
          <pre class="evt-pre">{{ tokenStat }}</pre>
        </details>
        <details class="evt" v-if="references && references.length">
          <summary>引用 materials ({{ references.length }})</summary>
          <ul class="refs">
            <li v-for="(r, idx) in references" :key="idx">
              <span class="ref-title">{{ r.title || r.name || '引用' }}</span>
              <a v-if="r.url" :href="r.url" target="_blank">链接</a>
            </li>
          </ul>
        </details>
      </div>
      <div class="lke-chat__footer">
        <input class="lke-input" v-model="textInput" @keyup.enter="onSendText" placeholder="输入消息并回车发送" />
        <button class="lke-send" @click="onSendText">发送</button>
        <button class="lke-stop" :disabled="!streaming" @click="onStop">停止生成</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed, getCurrentInstance, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useVoiceAssistant } from '@/composables/useVoiceAssistant'
import { useDeepSeekChat } from '@/composables/useDeepSeekChat'
import { emitVoiceCommand } from '@/bridge/voiceBus'
import { openRecommend } from '@/bridge/recommendUI'

const props = defineProps<{ visible?: boolean }>()
const emit = defineEmits<{
  (e: 'command', payload: { transcript: string; isFinal: boolean; parsed?: any }): void
}>()

const { 
  listening, 
  supported, 
  error, 
  interim, 
  finalText, 
  lastCommand,
  isProcessing,
  start,
  stop,
  toggle, 
  onCommand,
  speak,
  speaking,
  ttsPending,
  stopSpeaking,
  showHelp 
} = useVoiceAssistant({ lang: 'zh-CN', interimResults: true, continuous: true })

const feedbackVisible = ref(false)
const showCommands = ref(false)
const router = useRouter()

// 计算状态可见性
const statusVisible = computed(() => listening.value || isProcessing.value || !supported.value)

// 引入 DeepSeek Chat：用于园区厂家/供应商推荐查询
const {
  initialize: initLKE,
  isReady: lkeReady,
  error: lkeErrorRef,
  messages: lkeMessages,
  thoughtLog,
  tokenStat,
  references,
  status,
  sendMessage: sendLKE,
  streaming,
  lastAssistantIndex,
  stop: stopGenerate,
  clearMessages
} = useDeepSeekChat()
const wakeActive = ref(false)
const WAKE_PROMPT = '小智小智'
const WAKE_WORDS = [WAKE_PROMPT]
const normalizeWakeText = (input: string) => (input || '').replace(/[，,。\s]/g, '')
const containsWakeWord = (input: string) => {
  const normalized = normalizeWakeText(input)
  return WAKE_WORDS.some(w => normalized.includes(w))
}

function contentStyle(m: { role: 'user'|'assistant' }) {
  // 统一修改字体颜色：用户深灰、AI 蓝色
  return m.role === 'assistant' ? { color: '#0B5CAD' } : { color: '#333' }
}

function escapeHtml(input: string) {
  return (input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(input: string) {
  return escapeHtml(input).replace(/`/g, '&#96;')
}

function safeUrl(input: string) {
  const url = (input ?? '').trim()
  if (!url) return '#'
  if (url.startsWith('#') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) return url
  try {
    const u = new URL(url)
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:' || u.protocol === 'tel:') return url
  } catch {
    // ignore
  }
  return '#'
}

function renderInlineMarkdown(escapedText: string) {
  const codeSpans: string[] = []
  let text = escapedText

  text = text.replace(/`([^`]+?)`/g, (_m, code) => {
    const idx = codeSpans.push(code) - 1
    return `{{{CODE:${idx}}}}`
  })

  text = text.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, (_m, label, url) => {
    const href = safeUrl(String(url))
    const labelEscaped = String(label)
    return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${labelEscaped}</a>`
  })

  text = text.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\*([\s\S]+?)\*/g, '<em>$1</em>')

  text = text.replace(/\{\{\{CODE:(\d+)\}\}\}/g, (_m, idx) => {
    const code = codeSpans[Number(idx)] ?? ''
    return `<code>${code}</code>`
  })

  return text
}

function renderMarkdown(input: string) {
  const raw = (input ?? '').replace(/\r\n/g, '\n')
  if (!raw) return ''

  const parts = raw.split(/```/g)
  let html = ''

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const codeRaw = parts[i] ?? ''
      const firstNewline = codeRaw.indexOf('\n')
      const lang = firstNewline === -1 ? '' : codeRaw.slice(0, firstNewline).trim()
      const code = firstNewline === -1 ? codeRaw : codeRaw.slice(firstNewline + 1)
      html += `<pre class="md-pre"><code${lang ? ` class="language-${escapeAttr(lang)}"` : ''}>${escapeHtml(code)}</code></pre>`
      continue
    }

    const escaped = escapeHtml(parts[i] ?? '')
    const lines = escaped.split('\n')

    let inUl = false
    let inOl = false
    let inQuote = false

    const closeAll = () => {
      if (inUl) { html += '</ul>'; inUl = false }
      if (inOl) { html += '</ol>'; inOl = false }
      if (inQuote) { html += '</blockquote>'; inQuote = false }
    }

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        closeAll()
        continue
      }

      const heading = /^(\#{1,6})\s+(.+)$/.exec(trimmed)
      if (heading) {
        closeAll()
        const level = heading[1].length
        html += `<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`
        continue
      }

      const quote = /^&gt;\s+(.+)$/.exec(trimmed)
      if (quote) {
        if (!inQuote) { closeAll(); html += '<blockquote>'; inQuote = true }
        html += `<p>${renderInlineMarkdown(quote[1])}</p>`
        continue
      }

      const ol = /^(\d+)\.\s+(.+)$/.exec(trimmed)
      if (ol) {
        if (!inOl) { closeAll(); html += '<ol>'; inOl = true }
        html += `<li>${renderInlineMarkdown(ol[2])}</li>`
        continue
      }

      const ul = /^[-*]\s+(.+)$/.exec(trimmed)
      if (ul) {
        if (!inUl) { closeAll(); html += '<ul>'; inUl = true }
        html += `<li>${renderInlineMarkdown(ul[1])}</li>`
        continue
      }

      closeAll()
      html += `<p>${renderInlineMarkdown(trimmed)}</p>`
    }

    closeAll()
  }

  return html
}

const lkeError = computed(() => lkeErrorRef.value || null)
const showChatPanel = ref(false)
const textInput = ref('')
const enableTTS = ref(true) // 默认开启语音播报
const aiReplyLock = ref(false) // AI 回复期间锁定语音输入
const resumeAfterAI = ref(false) // 解锁后自动恢复聆听

const statusText = computed(() => {
  switch (status.value) {
    case 'connected': return '已连接'
    case 'connecting': return '连接中'
    case 'reconnecting': return '重连中'
    case 'error': return '错误'
    default: return '空闲'
  }
})
const statusClass = computed(() => ({
  connected: status.value === 'connected',
  connecting: status.value === 'connecting',
  reconnecting: status.value === 'reconnecting',
  error: status.value === 'error'
}))

// 懒初始化：第一次交互时初始化 LKE，避免无感加载成本
const ensureLKEInitialized = async () => {
  try {
    if (!lkeReady.value) {
      if (enableTTS.value) {
        speak('正在初始化AI助手')
      }
      await initLKE()
      if (lkeReady.value && enableTTS.value) {
        speak('AI助手已就绪')
      }
    }
  } catch (e) {
    if (enableTTS.value) {
      speak('AI助手初始化失败，请检查网络连接')
    }
    console.error('LKE初始化失败:', e)
  }
}

// 定位商家推荐页的查询表单组件实例（通过全局 DOM 查询）
function getRecFormExpose(): any | null {
  const el = document.querySelector('[data-rec-form]') as any
  if (!el) return null
  let comp = (el as any).__vueParentComponent || null
  // 向上查找直到找到暴露 applyVoiceCommand 的组件（RecQueryForm）
  while (comp && !(comp.exposed && typeof comp.exposed.applyVoiceCommand === 'function')) {
    comp = comp.parent || null
  }
  return comp?.exposed || null
}

// 语音命令联动：优先填充商家推荐表单；否则再导航、最后聊天
const handleFinalVoice = async (rawText: string, parsed?: any) => {
  const text = (rawText || '').trim()
  if (!text) {
    speak('未识别到有效语音内容')
    return
  }

  // 1) 商家推荐页：直接填充，不再跳转到 route 页
  if (parsed) {
    const isRecommend = parsed.navigation?.page === 'recommend' || /推荐|商家推荐/.test(text)
    if (isRecommend) {
      try {
        openRecommend()
        emitVoiceCommand({ transcript: text, isFinal: true, parsed })
        if (enableTTS.value) speak('已填入商家推荐表单')
        showChatPanel.value = false
        return
      } catch (e) {
        console.warn('填充推荐表单失败', e)
        if (enableTTS.value) speak('未能填入推荐表单，请稍后再试')
        return
      }
    }
  }

  // 2) 其它页面导航（route 页面已废弃：忽略）
  if (parsed?.navigation?.path && parsed.navigation.page !== 'route') {
    try {
      router.push(parsed.navigation.path)
      speak(`已跳转到${parsed.navigation.page}页面`)
    } catch (e) {
      speak('页面跳转失败')
    }
    return
  }

  await ensureLKEInitialized()
  if (!lkeReady.value) {
    speak('AI助手未就绪，正在初始化')
    return
  }

  // 对话承接：发送识别文本到 LKE，并展示面板
  try {
    speak('正在处理您的问题')
    await sendLKE(text)
    showChatPanel.value = true
  } catch (error) {
    speak('处理语音指令失败，请重试')
    console.error('Voice command error:', error)
  }
}

function toggleChatPanel() {
  showChatPanel.value = !showChatPanel.value
  if (showChatPanel.value) {
    ensureLKEInitialized()
    if (enableTTS.value) {
      speak('AI助手聊天面板已打开')
    }
  } else if (enableTTS.value) {
    speak('聊天面板已关闭')
  }
}

function onVoiceButtonClick() {
  // 若 AI 正在回复（流式或播报），拒绝开始语音输入
  if (aiReplyLock.value) return
  toggle()
}

async function onSendText() {
  const t = textInput.value.trim()
  if (!t) return
  await ensureLKEInitialized()
  if (!lkeReady.value) {
    speak('AI助手未就绪，请稍后重试')
    return
  }
  
  try {
    await sendLKE(t)
    textInput.value = ''
    showChatPanel.value = true
    // 不再播报“消息已发送”，改为在 AI 回复完成后由下方 watcher 进行 TTS 播报
  } catch (error) {
    speak('发送消息失败，请重试')
    console.error('Send message error:', error)
  }
}

// 切换命令帮助面板
const toggleCommands = () => {
  showCommands.value = !showCommands.value
  if (showCommands.value) {
    speak('语音命令帮助已打开')
  }
}

onMounted(() => {
  // 恢复 TTS 设置
  const savedTTSState = localStorage.getItem('voice-assistant-tts-enabled')
  if (savedTTSState !== null) {
    enableTTS.value = savedTTSState === 'true'
  }
  
  console.log('[VoiceAssistantFloat] Component mounted, supported:', supported.value)
  
  onCommand((e) => {
    console.log('[VoiceAssistantFloat] Voice command received:', e)
    feedbackVisible.value = true
    emit('command', e)
    
    // 智能反馈延迟
    const delay = e.isFinal ? 3000 : 1500
    window.setTimeout(() => { 
      if (!listening.value) {
        feedbackVisible.value = false 
      }
    }, delay)
    
    // 接入 LKE：在最终结果时将内容发送给 AI / 或商家推荐表单
    if (e.isFinal) {
      const text = (e.transcript || '').trim()
      if (!text) return

      // 语音直接控制：聊天开关 / 播报开关 / 停止生成 / 帮助
      if (/(打开|显示)(聊天|助手)|唤醒(助手|小智)/.test(text)) {
        if (containsWakeWord(text)) {
          wakeActive.value = true
        }
        showChatPanel.value = true
        ensureLKEInitialized()
        if (enableTTS.value) speak('AI助手聊天面板已打开')
        return
      }
      if (/(关闭|隐藏)(聊天|助手)/.test(text)) {
        showChatPanel.value = false
        if (enableTTS.value) speak('聊天面板已关闭')
        // 关闭时退出唤醒状态
        wakeActive.value = false
        return
      }
      if (/(停止|打住|别说了)(生成|回复|回答)?/.test(text)) {
        onStop()
        return
      }
      if (/((打开|开启)语音播报)/.test(text)) {
        enableTTS.value = true
        speak('语音播报已开启')
        return
      }
      if (/(关闭语音播报)/.test(text)) {
        enableTTS.value = false
        // 关闭播报时不再播语音提示
        return
      }
      if (/(帮助|命令)/.test(text)) {
        showCommands.value = true
        speak('语音命令帮助已打开')
        return
      }

      // 若聊天面板已打开，也需要唤醒词后才能向 AI 发送
      if (showChatPanel.value) {
        if (!wakeActive.value) {
          return
        }
        handleFinalVoice(text, e.parsed)
        return
      }

      // 可操作口令（无需唤醒词）：
      // - 商家推荐意图或字段（位置/时间窗/载重/需求/温区）+ 推荐上下文
      // - 明确的页面导航到 recommend
      const p = e.parsed || {}
      const hasRecommendFields = !!(p.location || p.cities || p.timeWindow || p.weightKg || p.demandType || p.temperatureRange)
      const isRecommendMention = /推荐|商家推荐/.test(text) || p?.navigation?.page === 'recommend'
      // 只有明确提到推荐，或者有推荐相关字段时才无需唤醒
      if (isRecommendMention || (hasRecommendFields && isRecommendMention)) {
        handleFinalVoice(text, p)
        return
      }
      
      // 其他页面导航也无需唤醒（排除已废弃的 route）
      if (p?.navigation?.path && p.navigation.page !== 'recommend' && p.navigation.page !== 'route') {
        handleFinalVoice(text, p)
        return
      }

      // 其余自由聊天/问答再使用唤醒词
      if (!wakeActive.value) {
        if (containsWakeWord(text)) {
          wakeActive.value = true
          speak('我在，请问您需要什么帮助？')
          return
        }
        return
      }

      // 退出唤醒
      if (/退出|结束|收工/.test(text)) {
        wakeActive.value = false
        speak('好的，已退出唤醒模式')
        return
      }

      handleFinalVoice(text, e.parsed)
    }
  })
})

// 监听最后一条 assistant 回复变化，按需进行 TTS 播报
let lastSpokenContent = ''
let lastMessageCount = 0

// 监听消息变化和流式状态
watch([lkeMessages, streaming], ([messages, isStreaming]) => {
  if (!enableTTS.value) return
  
  // 当流式输出结束且有新消息时进行播报
  if (!isStreaming && messages.length > lastMessageCount) {
    const latestMessage = messages[messages.length - 1]
    if (latestMessage?.role === 'assistant' && 
        latestMessage.content && 
        latestMessage.content.trim() !== lastSpokenContent) {
      lastSpokenContent = latestMessage.content.trim()
      speak(latestMessage.content)
    }
    lastMessageCount = messages.length
  }
}, { deep: true, immediate: false })

// 锁定/解锁逻辑：当 AI 正在流式输出或 TTS 播报时，禁止语音识别
watch([streaming, speaking, ttsPending], ([isStreaming, isSpeaking, hasPending], [pS, pSp, pP]) => {
  const lock = !!(isStreaming || isSpeaking || hasPending)
  if (lock === aiReplyLock.value) return
  aiReplyLock.value = lock
  if (lock) {
    if (listening.value) {
      resumeAfterAI.value = true
      try { stop() } catch {}
    }
  } else {
    if (resumeAfterAI.value) {
      // AI 完成后自动恢复聆听
      resumeAfterAI.value = false
      try { start() } catch {}
    }
  }
})

// 持久化 TTS 设置
watch(enableTTS, (newValue) => {
  localStorage.setItem('voice-assistant-tts-enabled', String(newValue))
  if (newValue) {
    speak('语音播报已开启')
  } else {
    speak('语音播报已关闭')
  }
})

function onStop() {
  try { 
    stop()
    if (enableTTS.value) {
      speak('已停止生成')
    }
  } catch (error) {
    console.warn('Stop generation error:', error)
  }
}

function onClearChat() {
  try {
    if (confirm('确定要清空当前聊天记录吗？')) {
      clearMessages()
    }
  } catch (e) {}
}
</script>

<style scoped>
.lke-msg.assistant .content { color: #0B5CAD; }
.lke-msg.user .content { color: #333; }
.lke-msg .bubble.typing .cursor { animation: blink 1s steps(1) infinite; margin-left: 4px; color: #0B5CAD; }
@keyframes blink { 50% { opacity: 0; } }
.lke-stop { padding: 6px 12px; background: #E53935; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
.voice-assistant {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2000;
  display: flex;
 
  align-items: flex-end;
  gap: 12px;
}

.voice-button {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1E88E5 0%, #1565C0 100%);
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  box-shadow: 0 6px 16px rgba(30, 136, 229, 0.4);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.voice-button:hover {
  transform: translateY(-3px) scale(1.05);
  box-shadow: 0 8px 20px rgba(30, 136, 229, 0.5);
}

.voice-button.listening {
  background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%);
  box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
  animation: pulse 2s infinite;
}

.voice-button.processing {
  background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%);
  box-shadow: 0 6px 20px rgba(255, 152, 0, 0.4);
  animation: spin 1s linear infinite;
}

.voice-button.locked,
.voice-button:disabled {
  background: linear-gradient(135deg, #90A4AE 0%, #78909C 100%);
  box-shadow: 0 6px 16px rgba(0,0,0,0.2);
  cursor: not-allowed;
  opacity: 0.85;
}

.voice-button.unsupported {
  background: linear-gradient(135deg, #9E9E9E 0%, #757575 100%);
  box-shadow: 0 6px 16px rgba(0,0,0,0.25);
  cursor: not-allowed;
}

.help-button {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: #1E88E5;
  border: 1px solid rgba(30, 136, 229, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.help-button:hover {
  background: #1E88E5;
  color: white;
  transform: scale(1.1);
}

/* 可选：若后续添加聊天开关按钮，可复用 help-button 的样式 */
.chat-button {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: #1E88E5;
  border: 1px solid rgba(30, 136, 229, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.chat-button:hover {
  background: #1E88E5;
  color: white;
  transform: scale(1.1);
}

/* LKE 聊天面板 */
.lke-chat {
  position: fixed;
  right: 20px;
  bottom: 160px;
  width: 360px;
  max-width: calc(100vw - 40px);
  background: rgba(255, 255, 255, 0.98);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  opacity: 0;
  transform: translateY(20px) scale(0.95);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  border: 1px solid rgba(0, 0, 0, 0.1);
  max-height: 420px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.lke-chat.visible {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

.lke-chat__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #1E88E5;
  color: #fff;
}
.lke-chat__header .hdr-actions { display: inline-flex; gap: 6px; align-items: center; }
.lke-chat__header .clear-chat { background: rgba(255,255,255,0.15); color: #fff; border: none; border-radius: 6px; padding: 4px 6px; cursor: pointer; }
.lke-chat__header .clear-chat:hover { background: rgba(255,255,255,0.25); }

.lke-chat__body {
  padding: 10px 12px;
  overflow: auto;
  flex: 1;
}

.lke-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  color: #fff;
}
.badge.connected { background: #4CAF50; }
.badge.connecting { background: #1E88E5; }
.badge.reconnecting { background: #FB8C00; }
.badge.error { background: #E53935; }
.tts-toggle { font-size: 12px; color: #333; }

.lke-msg-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lke-msg {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.lke-msg .role { font-size: 12px; color: #888; min-width: 24px; text-align: right; }
.lke-msg .bubble { background: #f6f8fa; border-radius: 8px; padding: 8px 10px; max-width: 260px; white-space: pre-wrap; word-break: break-word; }
.lke-msg.assistant .bubble { background: #e8f4ff; white-space: normal; }

/* AI Markdown 渲染（仅对 assistant 生效） */
.lke-msg.assistant .content.md { line-height: 1.5; }
.lke-msg.assistant .content.md p { margin: 0 0 6px; }
.lke-msg.assistant .content.md p:last-child { margin-bottom: 0; }
.lke-msg.assistant .content.md ul,
.lke-msg.assistant .content.md ol { margin: 0 0 6px 18px; padding: 0; }
.lke-msg.assistant .content.md li { margin: 2px 0; }
.lke-msg.assistant .content.md blockquote { margin: 0 0 6px; padding-left: 10px; border-left: 3px solid rgba(11, 92, 173, 0.35); color: #334; }
.lke-msg.assistant .content.md h1,
.lke-msg.assistant .content.md h2,
.lke-msg.assistant .content.md h3,
.lke-msg.assistant .content.md h4,
.lke-msg.assistant .content.md h5,
.lke-msg.assistant .content.md h6 { margin: 0 0 6px; font-size: 13px; font-weight: 700; }
.lke-msg.assistant .content.md a { color: #0B5CAD; text-decoration: underline; }
.lke-msg.assistant .content.md code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 4px; }
.lke-msg.assistant .content.md pre.md-pre { background: #0b1021; color: #e6edf3; padding: 8px 10px; border-radius: 8px; overflow: auto; margin: 0 0 6px; white-space: pre; }
.lke-msg.assistant .content.md pre.md-pre code { background: transparent; padding: 0; color: inherit; }

.lke-chat__footer {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid rgba(0,0,0,0.06);
}
/* 事件折叠 */
.evt { margin-top: 8px; }
.evt-pre { background: #f6f8fa; padding: 8px; border-radius: 6px; max-height: 160px; overflow: auto; }
.refs { margin: 6px 0 0 16px; padding: 0; }
.refs li { font-size: 12px; color: #333; margin-bottom: 4px; }
.ref-title { margin-right: 8px; }
.lke-input { flex: 1; padding: 6px 10px; border: 1px solid #ddd; border-radius: 6px; }
.lke-send { padding: 6px 12px; background: #1E88E5; color: #fff; border: none; border-radius: 6px; cursor: pointer; }

@media (max-width: 768px) {
  .lke-chat { width: calc(100vw - 40px); right: 20px; }
}

.voice-feedback {
  position: fixed;
  right: 20px;
  bottom: 100px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 12px 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  max-width: 320px;
  opacity: 0;
  transform: translateY(10px);
  transition: all 0.3s ease;
  pointer-events: none;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.voice-feedback.visible {
  opacity: 1;
  transform: translateY(0);
}

.interim {
  color: #666;
  font-size: 12px;
  font-style: italic;
}

.final {
  color: #111;
  font-size: 13px;
  font-weight: 600;
  margin-top: 4px;
}

.last-command {
  color: #888;
  font-size: 11px;
  margin-top: 4px;
  border-top: 1px solid #eee;
  padding-top: 4px;
}

.processing {
  color: #FF9800;
  font-size: 12px;
  font-weight: 500;
  margin-top: 4px;
}

.error {
  color: #EF5350;
  font-size: 12px;
  font-weight: 500;
}

.voice-status {
  position: fixed;
  right: 20px;
  bottom: 160px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  backdrop-filter: blur(10px);
}

.voice-status.visible {
  opacity: 1;
}

.voice-commands {
  position: fixed;
  right: 20px;
  bottom: 100px;
  width: 350px;
  max-width: calc(100vw - 40px);
  background: rgba(255, 255, 255, 0.98);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  opacity: 0;
  transform: translateY(20px) scale(0.95);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  backdrop-filter: blur(15px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  max-height: 400px;
  overflow-y: auto;
}

.voice-commands.visible {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

.commands-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1E88E5;
  color: white;
  border-radius: 12px 12px 0 0;
}

.commands-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.close-commands {
  background: transparent;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.close-commands:hover {
  background: rgba(255, 255, 255, 0.2);
}

.commands-content {
  padding: 16px;
}

.command-category {
  margin-bottom: 16px;
}

.command-category:last-child {
  margin-bottom: 0;
}

.command-category h5 {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 6px;
}

.command-category ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.command-category li {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
  padding: 4px 8px;
  background: rgba(30, 136, 229, 0.05);
  border-radius: 4px;
  border-left: 3px solid #1E88E5;
}

@keyframes pulse {
  0% { transform: scale(1); }
  70% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 移动端适配 */
@media (max-width: 768px) {
  .voice-commands {
    width: calc(100vw - 40px);
    right: 20px;
  }
  
  .voice-feedback {
    max-width: calc(100vw - 40px);
  }
}
</style>

```



### 地图/三维场景

```html
<template>
  <div class="map-root" v-bind="$attrs">
    <div id="cesiumContainer" ref="cesiumContainer"></div>

    <!-- 图层面板（右上角，可折叠） -->
    <div class="layer-panel" :class="{ collapsed: panelCollapse.layers }">
      <div class="row title">
        <span>图层</span>
        <button class="collapse-btn" @click="panelCollapse.layers = !panelCollapse.layers" :title="panelCollapse.layers ? '展开' : '收起'">{{ panelCollapse.layers ? '＋' : '－' }}</button>
      </div>
      <transition name="panel-fade">
        <div v-show="!panelCollapse.layers" class="panel-body">
          <label class="row"><input type="checkbox" v-model="ui.osgb"> OSGB 建筑</label>
          <label class="row"><input type="checkbox" v-model="ui.factory"> 厂房模型</label>
          <label class="row small" v-if="ui.factory"><input type="checkbox" v-model="ui.factoryRoofOpen"> 厂房掀盖</label>
          <label class="row"><input type="checkbox" v-model="ui.office"> 新大楼模型</label>
          <label class="row"><input type="checkbox" v-model="ui.geo"> 仓库面 (GeoJSON)</label>
          <label class="row"><input type="checkbox" v-model="ui.floors"> 楼层抽屉</label>
          <label class="row"><input type="checkbox" v-model="ui.facilities"> 设施标注</label>
          <label class="row"><input type="checkbox" v-model="ui.fireExtinguishers"> 灭火器</label>
          <label class="row"><input type="checkbox" v-model="ui.pano"> 全景红点</label>

          <div class="row small">
            <span class="base-map-label">底图</span>
            <select v-model="ui.baseMap" class="base-map-select">
              <option value="ion">Cesium Ion(推荐)</option>
              <option value="amap">高德影像</option>
              <option value="osm">OpenStreetMap</option>
            </select>
          </div>

          <div class="row sep"></div>

          <!-- 管线图层控制 -->
          <label class="row">
            <input type="checkbox" v-model="ui.pipelines"> 地下管线
          </label>
          <template v-if="ui.pipelines">
            <label class="row small"><input type="checkbox" v-model="ui.terrainXray"> 地形透视</label>
            <template v-if="ui.terrainXray">
              <div class="row small">地形透明度：{{ ui.terrainAlpha }}</div>
              <input class="slider" type="range" min="0" max="1" step="0.05" v-model.number="ui.terrainAlpha" />
            </template>
          </template>

          <div class="row sep"></div>

          <label class="row">
            <input type="checkbox" v-model="ui.cluster"> 红点聚合
          </label>
          <div class="row small">聚合强度：{{ ui.clusterRange }}</div>
          <input class="slider" type="range" min="20" max="90" step="1" v-model.number="ui.clusterRange" />

          <div class="row sep"></div>

          <!-- 天气图层控制 -->
          <label class="row">
            <input type="checkbox" v-model="ui.weather"> 天气图层
          </label>
          <template v-if="ui.weather">
            <label class="row small"><input type="checkbox" v-model="ui.temperature"> 温度分布</label>
            <label class="row small"><input type="checkbox" v-model="ui.precipitation"> 降水预报</label>
            <label class="row small"><input type="checkbox" v-model="ui.wind"> 风力风向</label>
            <label class="row small"><input type="checkbox" v-model="ui.warnings"> 预警信息</label>
            <div class="row small">透明度：{{ ui.weatherOpacity }}%</div>
            <input class="slider" type="range" min="10" max="100" step="10" v-model.number="ui.weatherOpacity" />
          </template>

          <div class="row sep"></div>

          <!-- 园区路线（抛物线） -->
          <label class="row">
            <input type="checkbox" v-model="ui.vendorCurves"> 园区→目的地曲线
          </label>
          <template v-if="ui.vendorCurves">
            <div class="row small">数量上限：
              <input class="num-input" type="number" min="1" max="500" step="1" v-model.number="ui.vendorCurvesMax"> 条
              <button class="btn small redraw-btn" @click="drawVendorCurvesForSelected">重绘</button>
            </div>
            <div class="row small">分段（越大越顺滑）：{{ ui.vendorCurvesStep }}</div>
            <input class="slider" type="range" min="8" max="120" step="2" v-model.number="ui.vendorCurvesStep" />
            <div class="row small">高度比例：{{ (ui.vendorCurvesHeight*100).toFixed(0) }}%</div>
            <input class="slider" type="range" min="0.05" max="0.3" step="0.01" v-model.number="ui.vendorCurvesHeight" />
          </template>

          <div class="row sep"></div>

          <div class="row small">Tiles 细节（SSE）：{{ ui.sse }}</div>
          <input class="slider" type="range" min="8" max="24" step="1" v-model.number="ui.sse" />
        </div>
      </transition>
    </div>

    <!-- 管线分析工具面板（左上角，可折叠） -->
    <div class="analysis-panel" v-if="ui.pipelines" :class="{ collapsed: panelCollapse.analysis }">
      <div class="panel-header">
        <h3>地下管线分析</h3>
        <button class="collapse-btn" @click="panelCollapse.analysis = !panelCollapse.analysis" :title="panelCollapse.analysis ? '展开' : '收起'">{{ panelCollapse.analysis ? '＋' : '－' }}</button>
      </div>
      <transition name="panel-fade">
        <div v-show="!panelCollapse.analysis" class="panel-collapse-body">
          <!-- 信息面板（优先显示结果） -->
          <div class="info-panel" v-if="pipelineInfo.show">
            <div class="panel-header">
              <h3>{{ pipelineInfo.title }}</h3>
              <button @click="pipelineInfo.show = false" class="close-btn">×</button>
            </div>
            <div class="control-group with-top" v-if="pipelineInfo.pipelines.length > 0">
              <button @click="exportPipelinesGeoJSON">导出 GeoJSON</button>
              <button @click="exportPipelinesCSV">导出 CSV</button>
            </div>
            <div class="info-content">
              <div v-if="pipelineInfo.pipelines.length === 0" class="no-data">
                未发现管线
              </div>
              <div v-else class="pipeline-list">
                <div v-for="(pipeline, index) in pipelineInfo.pipelines" :key="index" class="pipeline-item" @click="focusPipeline(index)">
                  <h4>管线 {{ index + 1 }}: {{ pipeline.name }}</h4>
                  <div class="properties">
                    <div v-for="(value, key) in pipeline.properties" :key="key" class="property">
                      <span class="label">{{ key }}:</span>
                      <span class="value">{{ value }}</span>
                    </div>
                    <div v-if="pipeline.distance !== undefined" class="property">
                      <span class="label">距离:</span>
                      <span class="value">{{ pipeline.distance.toFixed(1) }}m</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 管线图例（信息面板下方，随分析面板滚动） -->
          <div class="legend-section" v-if="ui.pipelines">
            <div class="panel-header">
              <h3>管线图例</h3>
            </div>
            <div class="legend-content">
              <div v-for="([name, group]) in pipelineGroupEntries" :key="name" class="legend-item">
                <label>
                  <input type="checkbox" 
                         :checked="group.visible !== false" 
                         @change="togglePipelineGroup(name, $event.target.checked)" />
                  <span class="swatch" :style="{ backgroundColor: group.color }"></span>
                  <span class="name">{{ name }}</span>
                  <span class="count">({{ Array.isArray(group.entities) ? group.entities.length : 0 }})</span>
                </label>
              </div>
            </div>
          </div>

          <!-- 剖面工具 -->
          <div class="subsection">
            <div class="sub-title">剖面工具</div>
            <div class="control-group">
              <button @click="startSectionAnalysis" :class="{ active: sectionMode }" title="剖面分析：依次点击两点生成剖面，并列出附近管线">
                {{ sectionMode ? '取消剖面' : '剖面分析' }}
              </button>
              <div class="row small indent-2">缓冲距离：{{ ui.sectionBuffer }} m</div>
              <input class="slider" type="range" min="10" max="200" step="5" v-model.number="ui.sectionBuffer" />
            </div>
          </div>

          <!-- 挖方工具：聚合相关按钮，明确用途 -->
          <div class="subsection">
            <div class="sub-title">挖方工具</div>
            <div class="control-group">
              <button @click="startExcavationAnalysis" :class="{ active: excavationMode }" title="挖方分析：进入多边形绘制模式，单击加点">
                {{ excavationMode ? '取消挖方' : '挖方分析' }}
              </button>
              <button @click="completeExcavation" :disabled="!excavationMode || excavationPointsCount < 3" title="完成挖方：点位≥3后生成挖方范围并展示结果">
                完成挖方
              </button>
              <button @click="undoExcavationPoint" :disabled="!excavationMode || excavationPointsCount === 0" title="撤销一点：可按 Backspace/Delete 快捷键">
                撤销一点
              </button>
            </div>
            <div class="row small" v-if="excavationMode">
              已选点：{{ excavationPointsCount }}（单击加点，双击完成，Backspace 撤销，Esc 取消）
            </div>
          </div>

          <!-- 通用操作 -->
          <div class="control-group">
            <button @click="clearAllAnalysis" title="清除分析：移除临时绘制、结果列表与范围标注">清除分析</button>
          </div>
        </div>
      </transition>
    </div>

    <!-- 全景查看器 -->
    <PanoramaViewer 
      ref="panoramaViewer"
      :visible="panoramaModal.show" 
      @close="onPanoramaClosed" />
  
  <!-- 分析模式提示覆盖层（不拦截鼠标，pointer-events:none） -->
  <div class="analysis-overlay" v-if="sectionMode || excavationMode">
    <div class="msg">
      <strong>{{ sectionMode ? '剖面分析进行中' : '挖方分析进行中' }}</strong>
      <div class="sub" v-if="sectionMode">依次点击两点确定剖面（Esc 取消）</div>
      <div class="sub" v-else>单击加点，双击或“完成挖方”结束（Esc 取消 / Backspace 撤销）</div>
    </div>
  </div>
  <!-- 推荐商家高亮悬浮窗 -->
  <div v-if="vendorHover.visible" class="vendor-float" :class="{ dragging: vendorHover.dragging }" :style="{ left: vendorHover.x + 'px', top: vendorHover.y + 'px' }" @mousedown="onVendorFloatMouseDown">
    <div class="vh-name">{{ vendorHover.vendor?.name }}</div>
    <div class="vh-line">中心: {{ vendorHover.vendor?.centerName || vendorHover.vendor?.warehouse?.centerName || '未知' }}</div>
    <div class="vh-line" v-if="vendorHover.vendor?.route">线路: {{ vendorHover.vendor?.route }}</div>
    <div class="vh-metrics">
      <span v-if="vendorHover.vendor?.metrics">评分 {{ vendorHover.vendor.metrics.rating?.toFixed?.(1) }}</span>
      <span v-if="vendorHover.vendor?.metrics">准时 {{ (vendorHover.vendor.metrics.onTimeRate*100).toFixed(0) }}%</span>
      <span v-if="vendorHover.vendor?.capabilities">载重 {{ vendorHover.vendor.capabilities.maxWeightKg }}kg</span>
    </div>
    <div class="vh-tags" v-if="vendorHover.vendor?.tags?.length">
      <span v-for="t in vendorHover.vendor.tags.slice(0,6)" :key="t" class="vh-tag">{{ t }}</span>
    </div>
    <div class="vh-close" @click="vendorHover.visible=false" title="关闭">×</div>
  </div>

  <!-- 页面加载遮罩 -->
  <div v-if="isLoading" class="loading-mask">
    <div class="loading-spinner"></div>
    <div class="loading-text">{{ loadingText }}</div>
  </div>
  </div>
</template>

<script lang="js">
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { defineComponent, onMounted, onUnmounted, reactive, watch, ref, nextTick, computed } from 'vue'
import PanoramaViewer from './PanoramaViewer.vue'
import { DataSourceManager } from '@/utils/DataSourceManager.js'
import { weatherService } from '@/services/weather'
import { disasterService } from '@/services/disaster'
import { selectedVendor } from '@/bridge/recommendMapBus'

export default defineComponent({
  name: 'MapView',
  components: { PanoramaViewer },
  setup() {
    let poke = null
    let isDestroying = false
    let removeRenderErrorListener = null
    let removeBaseImageryErrorListener = null
    let pipelineBlinkInterval = null
    const pendingTimeouts = new Set()
    let restoreWidgetErrorPanel = null
    let removeCanvasWheelListener = null
    let removeWebglContextLostListener = null
    let removeWebglContextRestoredListener = null
    let removeWindowWheelCaptureListener = null
    let lastWheel = null
    let renderErrorBurstCount = 0
    let renderErrorBurstTs = 0
    let appliedCesiumSafeMode = false
    const isLoading = ref(true)
    const loadingText = ref('资源加载中...')
const FACTORY_MODEL_CONFIG = {
  baseId: 'factory-base',
  roofId: 'factory-roof',
  hingeOffsetENU: [0, -20, 0],
  rotationAxis: 'x',
  liftMeters: 12,
  openAngleDeg: 70,
  animationDurationMs: 1200,
  // 统一降级为平移动画
  mode: 'translate',
  fallbackLiftMeters: 30
}
const OFFICE_MODEL_ID = 'office-building'
const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN || ''
const CESIUM_ION_IMAGERY_ASSET_ID = Number.parseInt(import.meta.env.VITE_CESIUM_IMAGERY_ASSET_ID || '', 10)

window.CESIUM_BASE_URL = '/'

// 全景红点图标配置（可直接替换为自定义 SVG/PNG）
const PANO_ICON_CONFIG = {
  external: { image: '/Assets/Images/pano-dot.svg', width: 28, height: 28 },
  marzipano: { image: '/Assets/Images/pano-360.svg', width: 30, height: 30 }
}

// 全局 Viewer 引用与安全重绘辅助（requestRender）
const viewerRef = ref(null)
let onResize = null
let onWindowError = null
let onUnhandledRejection = null
const CESIUM_RECOVERY_KEY = '__cesium_auto_recover_ts'
const shouldRecoverFromCesiumError = (err) => {
  const msg = String(err?.message ?? err ?? '')
  // 只匹配非常明确的 destroyed 崩溃特征，避免误伤其它渲染/网络报错
  return msg.includes('This object was destroyed') ||
    msg.includes('destroy() was called') ||
    msg.includes('VertexArray.throwOnDestroyed')
}
const tryRecoverCesium = (origin, err) => {
  if (isDestroying) return
  try {
    const now = Date.now()
    const last = Number(sessionStorage.getItem(CESIUM_RECOVERY_KEY) || 0)
    // 防止进入无限刷新循环：15 秒内只允许触发一次
    if (now - last < 15000) return
    sessionStorage.setItem(CESIUM_RECOVERY_KEY, String(now))
  } catch {}
  console.warn('[CesiumRecover]', origin, err)
  try { window.location.reload() } catch {}
}
/**
 * 触发一次场景重绘；若后续需要支持对某个仓库 w 的中心飞行，可再提供参数。
 * 目前仅在 requestRenderMode 下，用于保证状态更新后场景刷新。
 */
const requestRender = () => {
  if (isDestroying) return
  const v = viewerRef.value
  if (!v || v.isDestroyed?.()) return
  // 仅执行一次 requestRender，不做 camera.flyTo（避免误用未定义 w 导致报错）
  if (v.scene && typeof v.scene.requestRender === 'function') {
    v.scene.requestRender()
  }
}

// UI 控制面板状态
const ui = reactive({
  osgb: true,
  factory: true,
  factoryRoofOpen: false,
  geo: true,
  floors: true,
  facilities: true,
  fireExtinguishers: true,
  pano: true,
  demoParabola: false,
  pipelines: true,
  baseMap: 'ion', // amap | ion | osm
  terrainXray: false, // 地形透视（仅用于地下管线查看）
  terrainAlpha: 0.85,  // 地形透明度（默认更接近正常底图观感，需要看地下管线可调低）
  cluster: true,
  clusterRange: 45, // 像素范围
  sse: 12,          // 屏幕误差（越大越省）
  // 天气图层控制
  weather: true,
  temperature: true,
  precipitation: false,
  wind: false,
  warnings: true,
  weatherOpacity: 70,
  // 剖面分析缓冲距离（米）
  sectionBuffer: 50,
  // 园区 -> 物流目的地 曲线
  vendorCurves: true,
  vendorCurvesMax: 80,
  vendorCurvesStep: 40,
  vendorCurvesHeight: 0.12
})

// 面板折叠状态
const panelCollapse = reactive({
  layers: false,
  analysis: false
})

// 仓库调试状态（用于展示 FID 与分组规则推断结果）
const warehousesMeta = reactive({
  list: [],        // { fid, groupName, rowCount, lon, lat, entity }
  showLabels: true,
  selectedFid: null,
  fidGroupSize: 120,
  missFids: []
})
// 数据源信息（用于 UI 显示使用了增强还是原始仓库 geojson）
const dataSourcesInfo = reactive({
  warehouseSource: ''
})
// 推荐选中商家悬浮窗状态
const vendorHover = reactive({ visible:false, x:20, y:120, vendor:null, dragging:false, offsetX:0, offsetY:0, width:320, height:0 })
const currentWarehouseDetail = computed(() => warehousesMeta.list.find(w => w.fid === warehousesMeta.selectedFid) || null)
// 当前中心对应线路 vendors（按序号数字排序，支持合并后文件的 FID 精确匹配）
const currentCenterVendors = computed(()=>{
  if(!currentWarehouseDetail.value) return []
  const key = currentWarehouseDetail.value.groupName
  if(!key) return []
  let list = []
  const fid = currentWarehouseDetail.value.fid
  if(Number.isFinite(fid) && vendorsByWarehouseFid.has(fid)) {
    list = vendorsByWarehouseFid.get(fid)
  } else {
    list = vendorsByCenter.get(key) || []
  }
  const parseSeq = (s)=>{ if(!s) return Number.MAX_SAFE_INTEGER; const m = String(s).match(/\d+/); return m? parseInt(m[0]): Number.MAX_SAFE_INTEGER }
  return [...list].sort((a,b)=> parseSeq(a.sequence)-parseSeq(b.sequence))
})
// 按 centerName 聚合的线路单位 vendors
const vendorsByCenter = reactive(new Map()) // centerName -> Vendor[]
const aggregatedCenterMetrics = reactive(new Map()) // centerName -> 聚合指标
function aggregateCenterMetrics(list){
  if(!list.length) return null
  const serviceRadiusKm = Math.round(list.reduce((a,v)=>a+(v.serviceRadiusKm||0),0)/list.length)
  const types = Array.from(new Set(list.flatMap(v=>v.capabilities?.types||[])))
  const maxWeightKg = Math.max(...list.map(v=>v.capabilities?.maxWeightKg||0))
  const rating = +(list.reduce((a,v)=>a+(v.metrics?.rating||0),0)/list.length).toFixed(2)
  const onTimeRate = +(list.reduce((a,v)=>a+(v.metrics?.onTimeRate||0),0)/list.length).toFixed(3)
  const priceIndex = +(list.reduce((a,v)=>a+(v.metrics?.priceIndex||0),0)/list.length).toFixed(2)
  const capacityUtilization = +(list.reduce((a,v)=>a+(v.metrics?.capacityUtilization||0),0)/list.length).toFixed(2)
  const tags = Array.from(new Set(list.flatMap(v=>v.tags||[]))).slice(0,12)
  return { serviceRadiusKm, capabilities:{types, maxWeightKg, cold:null}, metrics:{rating,onTimeRate,priceIndex,capacityUtilization}, tags, lineCount:list.length }
}
// 额外 FID -> vendor 列表索引 (来自 vendors-with-warehouse.json)
const vendorsByWarehouseFid = reactive(new Map())
async function loadVendorsForCenters(){
  const sources = ['/data/vendors-with-warehouse.json','/data/vendors.json']
  let rows = []
  let used = ''
  for(const u of sources){
    try{
      const r = await fetch(u)
      if(!r.ok) throw new Error(r.status+'')
      rows = await r.json()
      used = u
      break
    }catch(e){ /* 尝试下一个 */ }
  }
  if(!rows.length){ console.warn('[loadVendorsForCenters] 未能加载 vendors 数据'); return }
  console.info('[loadVendorsForCenters] 使用数据源:', used, '数量:', rows.length)
  vendorsByCenter.clear(); vendorsByWarehouseFid.clear(); aggregatedCenterMetrics.clear()
  rows.forEach(v=>{
    const key = v.centerName || '未知中心'
    if(!vendorsByCenter.has(key)) vendorsByCenter.set(key, [])
    vendorsByCenter.get(key).push(v)
    const fid = v.warehouse?.fid
    if(Number.isFinite(fid)){
      if(!vendorsByWarehouseFid.has(fid)) vendorsByWarehouseFid.set(fid, [])
      vendorsByWarehouseFid.get(fid).push(v)
    }
  })
  vendorsByCenter.forEach((list,key)=> aggregatedCenterMetrics.set(key, aggregateCenterMetrics(list)))
  return rows
}

// 将 vendors 详情注入仓库实体的 InfoBox 描述
function enrichWarehouseDescriptions(){
  if(!warehousesMeta.list.length) return
  warehousesMeta.list.forEach(w=>{
    const ent = w.entity
    if(!ent) return
    const centerName = w.groupName
    const csvRows = w.routes || []
    const vendors = (function(){
      if(Number.isFinite(w.fid) && vendorsByWarehouseFid.has(w.fid)) return vendorsByWarehouseFid.get(w.fid)
      return vendorsByCenter.get(centerName)||[]
    })()
    // 构建 CSV 表格（保持原逻辑）
    let html = `<div style="font-family:Arial;font-size:13px;">\n<h3 style=\"margin:4px 0 8px;\">${centerName}</h3>`
    if(csvRows.length){
      const trs = csvRows.map(r=>`<tr><td>${r['序号']||''}</td><td>${r['物流']||''}</td><td>${r['线路/目的地']||r['线路']||''}</td><td>${r['电话']||''}</td></tr>`).join('')
      html += `<table style=\"border-collapse:collapse;width:100%;margin-bottom:6px;\">\n<thead><tr style=\"background:#2c3e50;color:#fff;\"><th style=\"border:1px solid #ccc;padding:4px;\">序号</th><th style=\"border:1px solid #ccc;padding:4px;\">物流</th><th style=\"border:1px solid #ccc;padding:4px;\">线路/目的地</th><th style=\"border:1px solid #ccc;padding:4px;\">电话</th></tr></thead><tbody>${trs}</tbody></table>`
      html += `<p style=\"margin:2px 0 8px;color:#666;\">CSV 线路: ${csvRows.length} 条</p>`
    } else {
      html += `<p style=\"color:#999;margin:4px 0;\">暂无 CSV 线路数据</p>`
    }
    // Vendors 详情表格
    if(vendors.length){
      const vendorRows = vendors.map((v,i)=>{
        const types = (v.capabilities?.types||[]).join('/')
        const onTime = v.metrics?.onTimeRate!=null ? (v.metrics.onTimeRate*100).toFixed(1)+'%' : ''
        const util = v.metrics?.capacityUtilization!=null ? (v.metrics.capacityUtilization*100).toFixed(0)+'%' : ''
        return `<tr><td>${i+1}</td><td>${v.sequence||''}</td><td>${v.logisticsName||''}</td><td>${v.route||''}</td><td>${v.phone||''}</td><td>${types}</td><td>${v.capabilities?.maxWeightKg||''}</td><td>${v.serviceRadiusKm||''}</td><td>${v.metrics?.rating||''}</td><td>${onTime}</td><td>${v.metrics?.priceIndex||''}</td><td>${util}</td></tr>`
      }).join('')
      html += `<h4 style=\"margin:6px 0 4px;\">Vendors 线路 (${vendors.length})</h4>`
      html += `<div style=\"max-height:220px;overflow:auto;border:1px solid #ccc;\"><table style=\"border-collapse:collapse;width:100%;font-size:12px;\">`+
        `<thead><tr style=\"background:#3d5872;color:#fff;\"><th style=\"padding:2px;border:1px solid #444;\">#</th><th style=\"padding:2px;border:1px solid #444;\">序号</th><th style=\"padding:2px;border:1px solid #444;\">物流</th><th style=\"padding:2px;border:1px solid #444;\">线路</th><th style=\"padding:2px;border:1px solid #444;\">电话</th><th style=\"padding:2px;border:1px solid #444;\">类型</th><th style=\"padding:2px;border:1px solid #444;\">载重</th><th style=\"padding:2px;border:1px solid #444;\">半径</th><th style=\"padding:2px;border:1px solid #444;\">评级</th><th style=\"padding:2px;border:1px solid #444;\">准时</th><th style=\"padding:2px;border:1px solid #444;\">价格</th><th style=\"padding:2px;border:1px solid #444;\">利用</th></tr></thead>`+
        `<tbody>${vendorRows}</tbody></table></div>`
      const agg = aggregatedCenterMetrics.get(centerName)
      if(agg){
        html += `<p style=\"margin:6px 0 0;color:#555;\">聚合: 线路数 ${agg.lineCount}; 评级均值 ${agg.metrics.rating}; 准时率均值 ${(agg.metrics.onTimeRate*100).toFixed(1)}%; 利用率均值 ${(agg.metrics.capacityUtilization*100).toFixed(0)}%</p>`
      }
    } else {
      html += `<p style=\"color:#999;margin:6px 0;\">暂无 Vendors 线路数据</p>`
    }
    html += '</div>'
    ent.description = html
  })
}

// 管线分析状态
const sectionMode = ref(false)
const excavationMode = ref(false)
const pipelineInfo = reactive({
  show: false,
  title: '',
  pipelines: []
})
const pipelineGroups = ref(new Map())
const pipelineGroupEntries = computed(() => {
  const val = pipelineGroups.value
  if (val && typeof val.entries === 'function') {
    return Array.from(val.entries())
  }
  // 兼容对象
  return Object.entries(val || {})
})

// 暴露给模板的组切换函数（需在顶层定义，避免闭包导致模板取不到）
function togglePipelineGroup(name, visible) {
  const val = pipelineGroups.value
  if (!val) return
  const group = typeof val.get === 'function' ? val.get(name) : val[name]
  if (group) {
    group.visible = visible
    if (group.dataSource && typeof group.dataSource.show !== 'undefined') {
      // 仅当总开关开启时才真正设置显示；否则只记录状态
      if (ui.pipelines) {
        group.dataSource.show = visible
      }
    }
  }
  requestRender()
}

// 全景查看器状态
const panoramaModal = reactive({
  show: false
})
const panoramaViewer = ref(null)

// 管线分析变量
let sectionPoints = []
let excavationPoints = []
const excavationPointsCount = ref(0)
let sectionLine = null
let excavationPolygon = null
let excavationResultPolygon = null
let excavationResultLabel = null
let sectionPreviewLine = null
let excavationPreviewPolygon = null
let currentMousePosition = null
let sectionClippingPlanes = null
let excavationClippingPlanes = null
let highlightedPipelines = []
let sectionTempEntities = []
let excavationTempEntities = []
let dataSourceManager = null
let warehouseDebugDS = null
let vendorCurvesDS = null
let lastWarehouseHighlight = null
let redecorateTimer = null
// 仓库实体集合，用于区分与普通 polygon 高亮
const warehouseEntities = new Set()

// 厂房 / 新大楼模型引用与动画状态
let factoryRoofTileset = null
let factoryRoofAnimatorOverrides = null
let factoryRoofState = null
let factoryRoofDesiredOpen = false
let factoryRoofAnimationId = null

// 楼层抽屉相关变量
let floor1 = null
let floor2 = null
let floorHandler = null
let facilitiesDS = null
let fireExtinguishersDS = null
// 楼层抽屉内部状态
let floorInfos = []

// 全景查看器控制（移出 onMounted，避免模板引用未定义）
function openPanorama(url, info = null) {
  panoramaModal.show = true
  nextTick(() => {
    if (panoramaViewer.value) {
      panoramaViewer.value.loadPanorama(url, info)
    }
  })
}
function onPanoramaClosed() {
  panoramaModal.show = false
}

// 分析事件处理器与天气更新定时器需要在清理阶段访问，故提前声明
let analysisHandler = null
let weatherUpdateInterval = null

// —— 剖面/挖方分析：顶层实现，以便模板按钮可调用 ——
function startSectionAnalysis() {
  const viewer = viewerRef.value
  if (!viewer) return
  if (sectionMode.value) {
    endSectionAnalysis()
    return
  }
  sectionMode.value = true
  excavationMode.value = false
  sectionPoints = []
  clearClipping()
  viewer.canvas.style.cursor = 'crosshair'
  // 创建预览线
  sectionPreviewLine = viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(() => {
        if (sectionPoints.length === 0) return []
        if (sectionPoints.length === 1 && currentMousePosition) {
          return [
            Cesium.Cartesian3.fromRadians(sectionPoints[0].longitude, sectionPoints[0].latitude, sectionPoints[0].height),
            Cesium.Cartesian3.fromRadians(currentMousePosition.longitude, currentMousePosition.latitude, currentMousePosition.height)
          ]
        }
        if (sectionPoints.length === 2) {
          return [
            Cesium.Cartesian3.fromRadians(sectionPoints[0].longitude, sectionPoints[0].latitude, sectionPoints[0].height),
            Cesium.Cartesian3.fromRadians(sectionPoints[1].longitude, sectionPoints[1].latitude, sectionPoints[1].height)
          ]
        }
        return []
      }, false),
      width: 4,
      material: Cesium.Color.YELLOW,
      clampToGround: true
    }
  })
  requestRender()
}

function endSectionAnalysis() {
  const viewer = viewerRef.value
  sectionMode.value = false
  sectionPoints = []
  if (viewer) viewer.canvas.style.cursor = 'default'
  if (sectionPreviewLine && viewer) {
    viewer.entities.remove(sectionPreviewLine)
    sectionPreviewLine = null
  }
  if (viewer) {
    sectionTempEntities.forEach(entity => viewer.entities.remove(entity))
  }
  sectionTempEntities = []
  requestRender()
}

function startExcavationAnalysis() {
  const viewer = viewerRef.value
  if (!viewer) return
  if (excavationMode.value) {
    endExcavationAnalysis()
    return
  }
  excavationMode.value = true
  sectionMode.value = false
  excavationPoints = []
  excavationPointsCount.value = 0
  clearClipping()
  viewer.canvas.style.cursor = 'crosshair'
  // 预览面（动态包含鼠标位置）
  excavationPreviewPolygon = viewer.entities.add({
    polygon: {
      show: new Cesium.CallbackProperty(() => {
        const pts = [...excavationPoints]
        if (currentMousePosition) pts.push(currentMousePosition)
        return pts.length >= 3
      }, false),
      hierarchy: new Cesium.CallbackProperty(() => {
        const pts = [...excavationPoints]
        if (currentMousePosition) pts.push(currentMousePosition)
        if (pts.length < 3) return undefined
        const positions = pts.map(p => Cesium.Cartesian3.fromRadians(p.longitude, p.latitude, p.height || 0))
        return new Cesium.PolygonHierarchy(positions)
      }, false),
      material: Cesium.Color.CYAN.withAlpha(0.2),
      outline: true,
      outlineColor: Cesium.Color.CYAN
    }
  })
  requestRender()
}

function endExcavationAnalysis() {
  const viewer = viewerRef.value
  excavationMode.value = false
  excavationPoints = []
  excavationPointsCount.value = 0
  if (viewer) viewer.canvas.style.cursor = 'default'
  if (excavationPreviewPolygon && viewer) {
    viewer.entities.remove(excavationPreviewPolygon)
    excavationPreviewPolygon = null
  }
  if (viewer) {
    excavationTempEntities.forEach(entity => viewer.entities.remove(entity))
  }
  excavationTempEntities = []
  requestRender()
}

function clearAllAnalysis() {
  endSectionAnalysis()
  endExcavationAnalysis()
  clearClipping()
  pipelineInfo.show = false
  // 清除已完成的挖方范围
  const viewer = viewerRef.value
  if (viewer && excavationResultPolygon) {
    viewer.entities.remove(excavationResultPolygon)
    excavationResultPolygon = null
  }
  if (viewer && excavationResultLabel) {
    viewer.entities.remove(excavationResultLabel)
    excavationResultLabel = null
  }
  clearHighlightedPipelines()
  requestRender()
}

function clearClipping() {
  const viewer = viewerRef.value
  if (viewer) viewer.scene.globe.clippingPlanes = undefined
  // 若未来对 3DTiles 使用裁剪，这里也应清理
  const osgb = dataSourceManager?.getDataSource?.('osgb')
  if (osgb) osgb.clippingPlanes = undefined
}

//（移除重复的早期实现，保留下方更精确的版本）

function focusPipeline(index) {
  const viewer = viewerRef.value
  if (!viewer) return
  const item = pipelineInfo.pipelines[index]
  if (!item || !item.entity) return
  try {
    viewer.zoomTo(item.entity)
    if (item.entity.polylineVolume) {
      let count = 0
      if (pipelineBlinkInterval) {
        try { clearInterval(pipelineBlinkInterval) } catch {}
        pipelineBlinkInterval = null
      }
      const blink = setInterval(() => {
        count++
        try {
          const v = viewerRef.value
          if (isDestroying || !v || v.isDestroyed?.()) { clearInterval(blink); pipelineBlinkInterval = null; return }
          const on = count % 2 === 1
          item.entity.polylineVolume.material = on ? Cesium.Color.ORANGE.withAlpha(1.0) : Cesium.Color.YELLOW.withAlpha(0.9)
          requestRender()
        } catch {
          clearInterval(blink)
          pipelineBlinkInterval = null
          return
        }
        if (count >= 6) {
          clearInterval(blink)
          pipelineBlinkInterval = null
          try {
            item.entity.polylineVolume.material = Cesium.Color.YELLOW.withAlpha(0.9)
            requestRender()
          } catch {}
        }
      }, 300)
      pipelineBlinkInterval = blink
    }
  } catch {}
}

function exportPipelinesGeoJSON() {
  const fc = {
    type: 'FeatureCollection',
    features: pipelineInfo.pipelines.map(p => entityToFeature(p.entity, p.properties, p.name))
  }
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, `${pipelineInfo.title || 'pipelines'}.geojson`)
}

function exportPipelinesCSV() {
  const headers = ['name', ...collectPropertyKeys(pipelineInfo.pipelines)]
  const rows = pipelineInfo.pipelines.map(p => [
    escapeCsv(p.name || ''),
    ...headers.slice(1).map(k => escapeCsv(p.properties?.[k] ?? ''))
  ])
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, `${pipelineInfo.title || 'pipelines'}.csv`)
}

function collectPropertyKeys(list) {
  const set = new Set()
  list.forEach(p => Object.keys(p.properties || {}).forEach(k => set.add(k)))
  return Array.from(set)
}

function escapeCsv(v) {
  const s = String(v)
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

function entityToFeature(entity, props, name) {
  let coords = []
  try {
    const positions = entity.polylineVolume?.positions?.getValue?.(Cesium.JulianDate.now())
    if (positions && positions.length) {
      coords = positions.map(c => {
        const cart = Cesium.Cartographic.fromCartesian(c)
        return [Cesium.Math.toDegrees(cart.longitude), Cesium.Math.toDegrees(cart.latitude), cart.height || 0]
      })
    }
  } catch {}
  return {
    type: 'Feature',
    properties: { name, ...(props || {}) },
    geometry: {
      type: 'LineString',
      coordinates: coords
    }
  }
}

function triggerDownload(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function showPipelineInfo(pipelines, title) {
  pipelineInfo.title = title
  pipelineInfo.pipelines = pipelines
  pipelineInfo.show = true
  highlightPipelines(pipelines)
}

// —— 高亮与定位 ——
function highlightPipelines(pipelines) {
  clearHighlightedPipelines()
  const viewer = viewerRef.value
  if (!viewer) return
  pipelines.forEach(p => {
    const ent = p.entity
    if (ent && ent.polylineVolume) {
      const originalShape = ent.polylineVolume.shape
      const original = {
        material: ent.polylineVolume.material,
        outlineColor: ent.polylineVolume.outlineColor,
        outline: ent.polylineVolume.outline,
        shape: Array.isArray(originalShape) ? originalShape.slice() : originalShape
      }
      highlightedPipelines.push({ entity: ent, original })
      // 更亮的黄色 + 白色描边
      ent.polylineVolume.material = Cesium.Color.fromCssColorString('#FFE600').withAlpha(1.0)
      ent.polylineVolume.outline = true
      ent.polylineVolume.outlineColor = Cesium.Color.WHITE
      // 放大直径以强调（基于原 shape 圆截面缩放）
      if (Array.isArray(originalShape) && originalShape.length > 0) {
        const factor = 1.6 // 高亮加粗系数
        ent.polylineVolume.shape = originalShape.map(v => new Cesium.Cartesian2(v.x * factor, v.y * factor))
      }
    }
  })
  requestRender()
}

function clearHighlightedPipelines() {
  highlightedPipelines.forEach(({ entity, original }) => {
    if (entity && entity.polylineVolume) {
      entity.polylineVolume.material = original.material
      entity.polylineVolume.outline = original.outline
      entity.polylineVolume.outlineColor = original.outlineColor
      if (original.shape) {
        entity.polylineVolume.shape = original.shape
      }
    }
  })
  highlightedPipelines = []
  requestRender()
}

// 简单的点在多边形内测试（射线法），输入经纬度（弧度）数组
function cartographicInPolygon(cart, polygonCarts) {
  const x = Cesium.Math.toDegrees(cart.longitude)
  const y = Cesium.Math.toDegrees(cart.latitude)
  const pts = polygonCarts.map(c => ({
    x: Cesium.Math.toDegrees(c.longitude),
    y: Cesium.Math.toDegrees(c.latitude)
  }))
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y
    const xj = pts[j].x, yj = pts[j].y
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function analyzeExcavationPipelines(polygonCartographics) {
  const pipelines = []
  if (!dataSourceManager) return pipelines
  const pipelineSources = dataSourceManager.getPipelineDataSources()
  pipelineSources.forEach(sourceData => {
    sourceData.entities.forEach(entity => {
      if (entity.polylineVolume && entity.polylineVolume.positions) {
        const positions = entity.polylineVolume.positions.getValue(Cesium.JulianDate.now())
        if (!positions || positions.length === 0) return
        // 取若干采样点判断是否落在多边形内
        const sampleCount = Math.min(10, positions.length)
        for (let s = 0; s < sampleCount; s++) {
          const idx = Math.floor((s / sampleCount) * (positions.length - 1))
          const cart = Cesium.Cartographic.fromCartesian(positions[idx])
          if (cartographicInPolygon(cart, polygonCartographics)) {
            const properties = {}
            if (entity.properties) {
              const propertyNames = entity.properties.propertyNames || []
              propertyNames.forEach(name => {
                let value = entity.properties[name]
                if (value && typeof value.getValue === 'function') {
                  value = value.getValue(Cesium.JulianDate.now())
                }
                if (value !== undefined && value !== null) properties[name] = value
              })
            }
            pipelines.push({
              entity,
              name: entity.name || '未知管线',
              properties
            })
            break
          }
        }
      }
    })
  })
  return pipelines
}

// 手动完成挖方分析（按钮或双击触发）
function completeExcavation() {
  if (!excavationMode.value) return
  if (excavationPoints.length < 3) return
  const viewer = viewerRef.value
  if (viewer) {
    // 绘制最终挖方范围多边形
    const positions = excavationPoints.map(p => Cesium.Cartesian3.fromRadians(p.longitude, p.latitude, p.height || 0))
    if (excavationResultPolygon) {
      viewer.entities.remove(excavationResultPolygon)
      excavationResultPolygon = null
    }
    excavationResultPolygon = viewer.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        material: Cesium.Color.CYAN.withAlpha(0.25),
        outline: true,
        outlineColor: Cesium.Color.CYAN,
        clampToGround: true
      }
    })
    // 自动缩放至挖方范围
    viewer.zoomTo(excavationResultPolygon)
    // 计算面积与周长并标注
    const metrics = computeAreaPerimeter(excavationPoints)
    const center = centroidOfCartographics(excavationPoints)
    const centerPos = Cesium.Cartesian3.fromRadians(center.longitude, center.latitude, center.height || 0)
    if (excavationResultLabel) {
      viewer.entities.remove(excavationResultLabel)
      excavationResultLabel = null
    }
    excavationResultLabel = viewer.entities.add({
      position: centerPos,
      label: {
        text: `面积: ${formatArea(metrics.area)}\n周长: ${formatLength(metrics.perimeter)}`,
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('rgba(0,0,0,0.4)')
      }
    })
  }
  const pipelines = analyzeExcavationPipelines(excavationPoints)
  showPipelineInfo(pipelines, '挖方分析结果')
  endExcavationAnalysis()
}

// 撤销最后一个点（按钮或 Backspace）
function undoExcavationPoint() {
  if (!excavationMode.value) return
  if (excavationPoints.length === 0) return
  const viewer = viewerRef.value
  excavationPoints.pop()
  excavationPointsCount.value = excavationPoints.length
  const last = excavationTempEntities.pop()
  if (viewer && last) viewer.entities.remove(last)
  requestRender()
}

// 键盘快捷键：Backspace/Delete 撤销一点
const onKeydown = (e) => {
  if (!excavationMode.value) return
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault()
    undoExcavationPoint()
  } else if (e.key === 'Escape') {
    // 取消当前绘制：仅退出模式并清理临时点/预览，不影响已完成结果
    e.preventDefault()
    endExcavationAnalysis()
  }
}

// —— 计算工具 ——
// 使用局部 ENU 平面计算面积与周长（单位：米/平方米）
function computeAreaPerimeter(cartographics) {
  if (!cartographics || cartographics.length < 3) return { area: 0, perimeter: 0 }
  const origin = Cesium.Cartesian3.fromRadians(cartographics[0].longitude, cartographics[0].latitude, cartographics[0].height || 0)
  const ellipsoid = Cesium.Ellipsoid.WGS84
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(origin, ellipsoid)
  const inv = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4())
  const pts = cartographics.map(c => {
    const p = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height || 0)
    const local = Cesium.Matrix4.multiplyByPoint(inv, p, new Cesium.Cartesian3())
    return { x: local.x, y: local.y }
  })
  // 周长
  let perimeter = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    perimeter += Math.hypot(b.x - a.x, b.y - a.y)
  }
  // 面积（有向面积公式）
  let area2 = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    area2 += a.x * b.y - b.x * a.y
  }
  const area = Math.abs(area2) / 2
  return { area, perimeter }
}

function centroidOfCartographics(cartographics) {
  const len = cartographics.length
  let lon = 0, lat = 0, h = 0
  for (const c of cartographics) {
    lon += c.longitude; lat += c.latitude; h += (c.height || 0)
  }
  return new Cesium.Cartographic(lon / len, lat / len, h / len)
}

function formatArea(a) {
  if (a < 1e6) return `${a.toFixed(1)} m²`
  return `${(a / 1e6).toFixed(3)} km²`
}

function formatLength(l) {
  if (l < 1000) return `${l.toFixed(1)} m`
  return `${(l / 1000).toFixed(3)} km`
}

// 生成模型矩阵的工具函数
function generateModelMatrix(position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const rotationX = Cesium.Matrix4.fromRotationTranslation(
    Cesium.Matrix3.fromRotationX(Cesium.Math.toRadians(rotation[0])))

  const rotationY = Cesium.Matrix4.fromRotationTranslation(
    Cesium.Matrix3.fromRotationY(Cesium.Math.toRadians(rotation[1])))

  const rotationZ = Cesium.Matrix4.fromRotationTranslation(
    Cesium.Matrix3.fromRotationZ(Cesium.Math.toRadians(rotation[2])))
    
  if (!(position instanceof Cesium.Cartesian3)) {
    position = Cesium.Cartesian3.fromDegrees(...position)
  }
  
  const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(position)
  Cesium.Matrix4.multiply(enuMatrix, rotationX, enuMatrix)
  Cesium.Matrix4.multiply(enuMatrix, rotationY, enuMatrix)
  Cesium.Matrix4.multiply(enuMatrix, rotationZ, enuMatrix)
  
  const scaleMatrix = Cesium.Matrix4.fromScale(new Cesium.Cartesian3(...scale))
  const modelMatrix = Cesium.Matrix4.multiply(enuMatrix, scaleMatrix, new Cesium.Matrix4())

  return modelMatrix
}

// 初始化楼层抽屉（不再单独注册事件，改为融入主点击逻辑）
function initFloorDrawer(viewer, floors, distance = 35.0) {
  floorInfos = floors.map(floor => {
    const initialMatrix = floor.root?.transform?.clone() || floor.modelMatrix?.clone()
    const center = floor.boundingSphere.center
    const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(center)
    return { floor, initialMatrix, center, enuTransform }
  })
  function translateNorth(info) {
    const { initialMatrix, center, enuTransform } = info
    const translationENU = new Cesium.Cartesian3(0, distance, 0)
    const translationWorld = Cesium.Matrix4.multiplyByPoint(enuTransform, translationENU, new Cesium.Cartesian3())
    const offset = Cesium.Cartesian3.subtract(translationWorld, center, new Cesium.Cartesian3())
    const translationMatrix = Cesium.Matrix4.fromTranslation(offset)
    return Cesium.Matrix4.multiply(translationMatrix, initialMatrix, new Cesium.Matrix4())
  }

  function expandFloor(target) {
    floorInfos.forEach(info => {
      if (info === target) {
        const newMatrix = translateNorth(info)
        if (info.floor.root) info.floor.root.transform = newMatrix
        else info.floor.modelMatrix = newMatrix
        info.floor.style = new Cesium.Cesium3DTileStyle({ color: "color('white', 1.0)" })
      } else {
        if (info.floor.root) info.floor.root.transform = info.initialMatrix.clone()
        else info.floor.modelMatrix = info.initialMatrix.clone()
        info.floor.style = new Cesium.Cesium3DTileStyle({ color: "color('white', 0.01)" })
      }
    })
    requestRender()
  }

  function resetFloors() {
    floorInfos.forEach(info => {
      if (info.floor.root) info.floor.root.transform = info.initialMatrix.clone()
      else info.floor.modelMatrix = info.initialMatrix.clone()
      info.floor.style = new Cesium.Cesium3DTileStyle({ color: "color('white', 0.01)" })
    })
    requestRender()
  }

  return { expandFloor, resetFloors }
}

function factoryConfigWithOverrides(overrides = {}) {
  const base = { ...FACTORY_MODEL_CONFIG, ...overrides }
  if (!base.mode) base.mode = 'hinge'
  return base
}

function computeHingeOffsetCartesian(offset = []) {
  if (!Array.isArray(offset) || offset.length !== 3) return null
  return new Cesium.Cartesian3(offset[0], offset[1], offset[2])
}

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function cancelFactoryRoofAnimation() {
  if (factoryRoofAnimationId != null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(factoryRoofAnimationId)
  }
  factoryRoofAnimationId = null
}

function applyFactoryRoofProgress(progress, { forceRender = false } = {}) {
  if (!factoryRoofState) return
  const clamped = Cesium.Math.clamp(progress, 0, 1)
  const { target, root, baseMatrix, hingeFrame, hingeFrameInverse, config } = factoryRoofState
  const mode = (config?.mode || 'hinge').toLowerCase()

  if (mode === 'translate') {
    const lift = (config.fallbackLiftMeters ?? config.liftMeters ?? 10) * clamped
    const translation = Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, lift))
    const finalMatrix = Cesium.Matrix4.multiply(translation, baseMatrix, new Cesium.Matrix4())
    if (root) root.transform = finalMatrix
    else target.modelMatrix = finalMatrix
  } else {
    if (!hingeFrame || !hingeFrameInverse) return
    const angleRad = Cesium.Math.toRadians((config.openAngleDeg ?? 70) * clamped)
    const lift = (config.liftMeters ?? 10) * clamped

    let rotationMatrix3
    switch ((config.rotationAxis || 'x').toLowerCase()) {
      case 'y':
        rotationMatrix3 = Cesium.Matrix3.fromRotationY(angleRad)
        break
      case 'z':
        rotationMatrix3 = Cesium.Matrix3.fromRotationZ(angleRad)
        break
      default:
        rotationMatrix3 = Cesium.Matrix3.fromRotationX(angleRad)
        break
    }
    const rotation = Cesium.Matrix4.fromRotationTranslation(rotationMatrix3)
    const translation = Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, lift))
    const localTransform = Cesium.Matrix4.multiply(translation, rotation, new Cesium.Matrix4())
    const hingeLocal = Cesium.Matrix4.multiply(hingeFrame, localTransform, new Cesium.Matrix4())
    const worldTransform = Cesium.Matrix4.multiply(hingeLocal, hingeFrameInverse, new Cesium.Matrix4())
    const finalMatrix = Cesium.Matrix4.multiply(worldTransform, baseMatrix, new Cesium.Matrix4())

    if (root) root.transform = finalMatrix
    else target.modelMatrix = finalMatrix
  }

  factoryRoofState.progress = clamped
  if (!forceRender) requestRender()
}

function setupFactoryRoofAnimator(target, overrides = {}) {
  if (!target) return
  cancelFactoryRoofAnimation()

  const root = target.root || null
  const baseMatrix =
    (root?.transform && Cesium.Matrix4.clone(root.transform, new Cesium.Matrix4())) ||
    (target.modelMatrix && Cesium.Matrix4.clone(target.modelMatrix, new Cesium.Matrix4())) ||
    Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY, new Cesium.Matrix4())
  const options = factoryConfigWithOverrides(overrides)
  if ((options.mode || 'hinge').toLowerCase() === 'translate') {
    factoryRoofState = {
      target,
      root,
      baseMatrix,
      hingeFrame: null,
      hingeFrameInverse: null,
      config: options,
      progress: 0
    }
    applyFactoryRoofProgress(factoryRoofDesiredOpen ? 1 : 0, { forceRender: true })
    return
  }

  const center = target.boundingSphere?.center
  if (!center) return

  const hingeOffset = computeHingeOffsetCartesian(options.hingeOffsetENU)
  const enuAtCenter = Cesium.Transforms.eastNorthUpToFixedFrame(center)
  let hingePosition = Cesium.Cartesian3.clone(center)
  if (hingeOffset) {
    hingePosition = Cesium.Matrix4.multiplyByPoint(enuAtCenter, hingeOffset, new Cesium.Cartesian3())
  }
  const hingeFrame = Cesium.Transforms.eastNorthUpToFixedFrame(hingePosition)
  let hingeFrameInverse = null
  try {
    hingeFrameInverse = Cesium.Matrix4.inverse(hingeFrame, new Cesium.Matrix4())
  } catch (err) {
    console.warn('[factoryRoof] hinge inverse failed:', err)
    return
  }

  factoryRoofState = {
    target,
    root,
    baseMatrix,
    hingeFrame,
    hingeFrameInverse,
    config: options,
    progress: 0
  }

  applyFactoryRoofProgress(factoryRoofDesiredOpen ? 1 : 0, { forceRender: true })
}

function animateFactoryRoof(open) {
  factoryRoofDesiredOpen = !!open
  if (!factoryRoofState) return
  cancelFactoryRoofAnimation()

  const startProgress = factoryRoofState.progress ?? 0
  const target = open ? 1 : 0
  if (Math.abs(target - startProgress) < 1e-3) {
    applyFactoryRoofProgress(target)
    return
  }

  const duration = factoryRoofState.config.animationDurationMs ?? 1200
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now()

  const step = (timestamp) => {
    const now = timestamp ?? (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const elapsed = now - start
    const ratio = Math.min(elapsed / duration, 1)
    const eased = easeInOutCubic(ratio)
    const value = startProgress + (target - startProgress) * eased
    applyFactoryRoofProgress(value)
    if (ratio < 1 && typeof requestAnimationFrame === 'function') {
      factoryRoofAnimationId = requestAnimationFrame(step)
    } else {
      factoryRoofAnimationId = null
      applyFactoryRoofProgress(target)
    }
  }

  if (typeof requestAnimationFrame === 'function') {
    factoryRoofAnimationId = requestAnimationFrame(step)
  } else {
    // 环境不支持 requestAnimationFrame 时直接跳转
    applyFactoryRoofProgress(target)
  }
}

onMounted(async () => {
  // 注意：在第一个 await 之前不要调用生命周期注册之外的异步副作用，防止生命周期警告
  if (CESIUM_ION_TOKEN) {
    Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN
  } else {
    console.warn('[MapView] 未设置 VITE_CESIUM_ION_TOKEN，Cesium World Terrain 可能无法访问。请在 .env.local 中配置。')
  }

  let terrainProvider
  try {
    terrainProvider = await Cesium.createWorldTerrainAsync({
      requestWaterMask: true,
      requestVertexNormals: true
    })
  } catch (err) {
    console.error('[MapView] 加载 Cesium World Terrain 失败，改用 EllipsoidTerrainProvider：', err)
    terrainProvider = new Cesium.EllipsoidTerrainProvider()
  }

  if (isDestroying) return
  const createAmapImageryProvider = () =>
    new Cesium.UrlTemplateImageryProvider({
      url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
      subdomains: ['1', '2', '3', '4']
    })
  const createOsmImageryProvider = () =>
    new Cesium.UrlTemplateImageryProvider({
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: ['a', 'b', 'c']
    })
  let imageryProvider = null
  const preferBaseMap = String(ui.baseMap || 'amap')
  if (preferBaseMap === 'ion' && CESIUM_ION_TOKEN) {
    if (Number.isFinite(CESIUM_ION_IMAGERY_ASSET_ID) && CESIUM_ION_IMAGERY_ASSET_ID > 0) {
      try {
        imageryProvider = await Cesium.IonImageryProvider.fromAssetId(CESIUM_ION_IMAGERY_ASSET_ID)
      } catch (err) {
        console.error(`[MapView] 加载指定 Ion 影像资产 ${CESIUM_ION_IMAGERY_ASSET_ID} 失败，尝试默认世界影像：`, err)
      }
    }
    if (!imageryProvider) {
      try {
        imageryProvider = await Cesium.IonImageryProvider.fromAssetId(3)
      } catch (err) {
        console.error('[MapView] 加载 Ion 世界影像失败，稍后将使用公共 OSM 影像：', err)
      }
    }
  }

  if (!imageryProvider) {
    // 国内网络默认走 AMap；如主动选择 OSM 则使用 OSM
    if (preferBaseMap === 'osm') {
      imageryProvider = createOsmImageryProvider()
      console.warn('[MapView] basemap=osm')
    } else {
      imageryProvider = createAmapImageryProvider()
      console.info('[MapView] basemap=amap')
    }
  }

  // 1) Viewer：按需渲染 + 冻结时钟 + 降后处理
  if (isDestroying) return
  const viewer = new Cesium.Viewer('cesiumContainer', {
    terrainProvider,
    imageryProvider,
    animation: false,
    timeline: false,
    infoBox: false,
    selectionIndicator: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    showRenderLoopErrors: false,
    requestRenderMode: true,
    maximumRenderTimeChange: Number.POSITIVE_INFINITY,
    useBrowserRecommendedResolution: true
  })
  try { viewer.scene.rethrowRenderErrors = false } catch {}
  try { viewer.scene.orderIndependentTranslucency = false } catch {}
  try { viewer.scene.pickTranslucentDepth = false } catch {}

  const applyCesiumSafeMode = () => {
    if (appliedCesiumSafeMode) return
    appliedCesiumSafeMode = true
    try { viewer.scene.orderIndependentTranslucency = false } catch {}
    try { viewer.scene.pickTranslucentDepth = false } catch {}
    try { viewer.resolutionScale = Math.min(viewer.resolutionScale || 1, 0.65) } catch {}
    try {
      const osgb = dataSourceManager?.getDataSource?.('osgb')
      if (osgb && typeof osgb.maximumScreenSpaceError === 'number') {
        osgb.maximumScreenSpaceError = Math.max(osgb.maximumScreenSpaceError, 20)
      }
    } catch {}
    console.warn('[CesiumSafeMode] applied (OIT off, translucent depth off, lower resolutionScale).')
  }

  const restartDefaultRenderLoop = () => {
    try { viewer.cesiumWidget.useDefaultRenderLoop = true } catch {}
    try { viewer.useDefaultRenderLoop = true } catch {}
    try { viewer.scene.requestRender() } catch {}
  }

  const scheduleRestartDefaultRenderLoop = () => {
    Promise.resolve().then(() => {
      if (isDestroying || viewer.isDestroyed()) return
      restartDefaultRenderLoop()
    })
  }
  
  // 监听渲染错误并自动恢复：缩放/拖拽高频渲染时，若出现 destroyed 类错误，做一次性刷新兜底。
  removeRenderErrorListener = viewer.scene.renderError.addEventListener((scene, error) => {
    console.error('[Cesium Render Error]', error)
    if (shouldRecoverFromCesiumError(error)) {
      if (isDestroying || viewer.isDestroyed()) return
      applyCesiumSafeMode()
      try {
        const now = Date.now()
        if (now - renderErrorBurstTs > 2000) renderErrorBurstCount = 0
        renderErrorBurstTs = now
        renderErrorBurstCount += 1
      } catch {}
      scheduleRestartDefaultRenderLoop()
      if (renderErrorBurstCount >= 3) {
        tryRecoverCesium('scene.renderError(burst)', error)
      }
    }
  })
  // CesiumWidget 渲染循环也会捕获错误并停止渲染：这里拦截 errorPanel 入口，确保 destroyed 类错误能触发恢复逻辑
  try {
    const widget = viewer.cesiumWidget
    if (widget && typeof widget.showErrorPanel === 'function') {
      const original = widget.showErrorPanel.bind(widget)
      widget.showErrorPanel = (title, message, error) => {
        try {
          console.error('[CesiumWidget RenderLoop Error]', title, error, {
            lastWheel,
            devicePixelRatio: window.devicePixelRatio,
            canvas: {
              clientWidth: viewer?.canvas?.clientWidth,
              clientHeight: viewer?.canvas?.clientHeight,
              width: viewer?.canvas?.width,
              height: viewer?.canvas?.height
            }
          })
          if (shouldRecoverFromCesiumError(error)) {
            if (!isDestroying && !viewer.isDestroyed()) {
              applyCesiumSafeMode()
              try {
                const now = Date.now()
                if (now - renderErrorBurstTs > 2000) renderErrorBurstCount = 0
                renderErrorBurstTs = now
                renderErrorBurstCount += 1
              } catch {}
              scheduleRestartDefaultRenderLoop()
              if (renderErrorBurstCount >= 3) {
                tryRecoverCesium('CesiumWidget.showErrorPanel(burst)', error)
              }
            }
            return
          }
        } catch {}
        return original(title, message, error)
      }
      restoreWidgetErrorPanel = () => { widget.showErrorPanel = original }
    }
  } catch {}

  // 记录滚轮信息，并阻止 Ctrl+滚轮触发浏览器缩放导致的 WebGL 不稳定
  try {
    const canvas = viewer.canvas
    const onWheel = (e) => {
      lastWheel = { t: Date.now(), deltaY: e.deltaY, ctrlKey: !!e.ctrlKey, metaKey: !!e.metaKey }
      if (e.ctrlKey || e.metaKey) {
        try { e.preventDefault() } catch {}
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    removeCanvasWheelListener = () => canvas.removeEventListener('wheel', onWheel)
  } catch {}

  // 触控板 pinch-to-zoom 在 Chrome 往往会以 `ctrlKey=true` 的 wheel 事件触发在子元素上（不一定是 canvas），这里用 capture 兜底拦截浏览器缩放
  try {
    const root = viewer.container || document.getElementById('cesiumContainer')
    const onWindowWheelCapture = (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      if (!root) return
      const target = e.target
      if (target && root.contains(target)) {
        lastWheel = { t: Date.now(), deltaY: e.deltaY, ctrlKey: !!e.ctrlKey, metaKey: !!e.metaKey, captured: true }
        try { e.preventDefault() } catch {}
      }
    }
    window.addEventListener('wheel', onWindowWheelCapture, { passive: false, capture: true })
    removeWindowWheelCaptureListener = () => window.removeEventListener('wheel', onWindowWheelCapture, true)
  } catch {}

  // 监听 WebGL 上下文丢失/恢复，便于定位并做兜底恢复
  try {
    const canvas = viewer.canvas
    const onLost = (e) => {
      try { e.preventDefault?.() } catch {}
      console.error('[webglcontextlost]', e)
      if (shouldRecoverFromCesiumError(e)) {
        tryRecoverCesium('webglcontextlost', e)
      } else {
        tryRecoverCesium('webglcontextlost', new Error('webglcontextlost'))
      }
    }
    const onRestored = (e) => {
      console.warn('[webglcontextrestored]', e)
      try { viewer.scene?.requestRender?.() } catch {}
    }
    canvas.addEventListener('webglcontextlost', onLost, false)
    canvas.addEventListener('webglcontextrestored', onRestored, false)
    removeWebglContextLostListener = () => canvas.removeEventListener('webglcontextlost', onLost, false)
    removeWebglContextRestoredListener = () => canvas.removeEventListener('webglcontextrestored', onRestored, false)
  } catch {}

  viewer.scene.postProcessStages.fxaa.enabled = false
  viewer.shadows = false
  viewer.targetFrameRate = 30

  // —— 关键：不开启时钟动画，否则会持续重绘
  viewer.clock.shouldAnimate = false
  viewer.clock.multiplier = 0
  viewer.scene.globe.enableLighting = false
  viewer.scene.sun.show = false
  viewer.scene.moon.show = false
  viewer.resolutionScale = 0.75 // 视效与负载的折中

  // camera.changed 在缩放时会非常高频：这里做“每帧最多一次”的节流，避免渲染风暴。
  let pokeRafId = null
  poke = () => {
    if (isDestroying) return
    if (!viewer || viewer.isDestroyed()) return
    if (pokeRafId != null) return
    pokeRafId = window.requestAnimationFrame(() => {
      pokeRafId = null
      if (isDestroying) return
      if (viewer && !viewer.isDestroyed()) {
        viewer.scene.requestRender()
      }
    })
  }

  // requestRenderMode 下 Cesium 会在交互时自行触发渲染，这里不再额外绑定 camera.changed（降低缩放压力）。

  // resize 事件在浏览器缩放/设备像素比变化时可能高频触发：用 RAF 合并，避免重建 WebGL 资源过于频繁
  let resizeRafId = null
  onResize = () => {
    if (isDestroying) return
    if (resizeRafId != null) return
    resizeRafId = window.requestAnimationFrame(() => {
      resizeRafId = null
      if (isDestroying) return
      const v = viewerRef.value
      if (!v || v.isDestroyed()) return
      try { v.resize() } catch {}
      poke()
    })
  }
  window.addEventListener('resize', onResize)

  onWindowError = (e) => {
    const err = e?.error || e?.message
    if (shouldRecoverFromCesiumError(err)) {
      tryRecoverCesium('window.error', err)
    }
  }
  onUnhandledRejection = (e) => {
    const reason = e?.reason
    if (shouldRecoverFromCesiumError(reason)) {
      tryRecoverCesium('unhandledrejection', reason)
    }
  }
  window.addEventListener('error', onWindowError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  // 存下全局引用用于其他顶层方法
  viewerRef.value = viewer

  // 强制确保 globe + 底图层存在（避免某些环境下底图不显示）
  try {
    viewer.scene.globe.show = true
    viewer.imageryLayers.removeAll(true)
    viewer.imageryLayers.addImageryProvider(imageryProvider)
  } catch {}

  // 底图兜底：监控瓦片错误，OSM 在部分网络环境下会超时，默认直接切到 AMap 以保证有底图
  let baseMapLabel = String(ui.baseMap || 'amap')
  const attachBaseImageryErrorListener = (provider, label) => {
    if (!provider?.errorEvent?.addEventListener) return
    if (removeBaseImageryErrorListener) {
      try { removeBaseImageryErrorListener() } catch {}
      removeBaseImageryErrorListener = null
    }
    baseMapLabel = label || baseMapLabel
    let errCount = 0
    let windowStart = Date.now()
    removeBaseImageryErrorListener = provider.errorEvent.addEventListener((err) => {
      try {
        const now = Date.now()
        if (now - windowStart > 8000) {
          windowStart = now
          errCount = 0
        }
        errCount += 1
        // OSM 一旦失败基本不可用：快速切换；其它源给一点容错
        const threshold = baseMapLabel === 'osm' ? 1 : 4
        if (errCount < threshold) return
        if (isDestroying || viewer.isDestroyed()) return
        try { err.retry = false } catch {}
        if (baseMapLabel !== 'amap') {
          console.warn(`[MapView] 底图(${baseMapLabel})瓦片连续失败，切换 AMap 兜底。`, err)
          ui.baseMap = 'amap'
        }
      } catch {}
    })
  }
  try {
    const layer0 = viewer.imageryLayers?.get?.(0)
    if (layer0?.imageryProvider) attachBaseImageryErrorListener(layer0.imageryProvider, baseMapLabel)
  } catch {}

  const applyBaseMap = async (mode) => {
    const desired = String(mode || 'amap')
    if (isDestroying || viewer.isDestroyed()) return
    if (desired === baseMapLabel) return

    let provider = null
    if (desired === 'ion') {
      if (!CESIUM_ION_TOKEN) {
        console.warn('[MapView] basemap=ion requires VITE_CESIUM_ION_TOKEN, fallback to amap')
        ui.baseMap = 'amap'
        provider = createAmapImageryProvider()
      } else {
        try {
          if (Number.isFinite(CESIUM_ION_IMAGERY_ASSET_ID) && CESIUM_ION_IMAGERY_ASSET_ID > 0) {
            provider = await Cesium.IonImageryProvider.fromAssetId(CESIUM_ION_IMAGERY_ASSET_ID)
          } else {
            provider = await Cesium.IonImageryProvider.fromAssetId(3)
          }
        } catch (e) {
          console.warn('[MapView] basemap=ion failed, fallback to amap', e)
          ui.baseMap = 'amap'
          provider = createAmapImageryProvider()
        }
      }
    } else if (desired === 'osm') {
      provider = createOsmImageryProvider()
    } else {
      provider = createAmapImageryProvider()
    }

    try {
      viewer.imageryLayers.removeAll(true)
      viewer.imageryLayers.addImageryProvider(provider)
      baseMapLabel = String(ui.baseMap || desired)
      baseMapFallbackStage = baseMapLabel === 'amap' ? 1 : (baseMapLabel === 'osm' ? 2 : 0)
      attachBaseImageryErrorListener(provider, baseMapLabel)
      poke?.()
    } catch (e) {
      console.warn('[MapView] applyBaseMap failed', e)
    }
  }
  watch(() => ui.baseMap, (m) => { applyBaseMap(m) })

  // 初始镜头：先展示地球，再在数据加载后飞到园区
  const waitNextFrame = () =>
    new Promise((resolve) => {
      try {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
        else resolve()
      } catch {
        resolve()
      }
    })
  const nextFrame = () => waitNextFrame()
  const setGlobeView = (headingRad = 0) => {
    try {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(105, 32, 28000000),
        orientation: { heading: headingRad, pitch: Cesium.Math.toRadians(-90), roll: 0 }
      })
    } catch {}
  }
  const sleep = (ms) =>
    new Promise((resolve) => {
      const t = setTimeout(() => {
        pendingTimeouts.delete(t)
        resolve()
      }, ms)
      pendingTimeouts.add(t)
    })
  const spinIntro = async (ms = 1600) => {
    try {
      const start = (typeof performance !== 'undefined' ? performance.now() : Date.now())
      const delta = Cesium.Math.toRadians(28)
      while (true) {
        if (isDestroying || viewer.isDestroyed()) return
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
        const t = Math.min((now - start) / ms, 1)
        const eased = (Cesium.EasingFunction?.SINE_IN_OUT?.(t)) ?? t
        setGlobeView(delta * eased)
        poke?.()
        if (t >= 1) break
        await nextFrame()
      }
    } catch {}
  }
  try {
    loadingText.value = '展示地球...'
    setGlobeView(0)
    poke?.()
    await spinIntro(1600)
    await sleep(450)
    await nextFrame()
    loadingText.value = '加载模型与图层...'
  } catch {}

  // 2) 创建数据源管理器并加载所有数据
  dataSourceManager = new DataSourceManager(viewer)
  // ===== 抛物线演示 (可选) =====
  function animatedParabola(twoPoints) {
    if(!ui.demoParabola) return
    const start = [twoPoints[0], twoPoints[1], 0]
    const step = 80
    const heightProportion = 0.125
    const dLon = (twoPoints[2] - start[0]) / step
    const dLat = (twoPoints[3] - start[1]) / step
    const deltaLon = dLon * Math.abs(111000 * Math.cos(start[1]))
    const deltaLat = dLat * 111000
    const end = [0,0,0]
    const heigh = Math.floor(step * Math.sqrt(deltaLon ** 2 + deltaLat ** 2) * heightProportion)
    const x2 = 10000 * Math.sqrt(dLon ** 2 + dLat ** 2)
    const a = heigh / (x2 * x2)
    const y = x => Math.floor(heigh - a * x * x)
    for (let i=1;i<=step;i++){
      end[0] = start[0] + dLon
      end[1] = start[1] + dLat
      const x = x2 * ((2 * i) / step - 1)
      end[2] = y(x)
      const positions = Cesium.Cartesian3.fromDegreesArrayHeights([...start, ...end])
      viewer.entities.add({
        polyline: {
          positions,
          width: 3,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: Cesium.Color.GOLD,
            outlineWidth: 0.3
          })
        }
      })
      start[0] = end[0]; start[1] = end[1]; start[2] = end[2]
    }
  }
  if(ui.demoParabola){
    const twoPoints = [118.22951002492071, 35.10534526147898, 116.391389, 39.905556]
    animatedParabola(twoPoints)
  }

  // ===== 园区 -> 物流目的地 曲线（批量绘制） =====
  function ensureVendorCurvesDS(){
    const viewer = viewerRef.value
    if(!viewer) return null
    if(!vendorCurvesDS){
      vendorCurvesDS = new Cesium.CustomDataSource('vendor-curves')
      viewer.dataSources.add(vendorCurvesDS)
    }
    return vendorCurvesDS
  }
  function clearVendorCurves(){
    const viewer = viewerRef.value
    if(vendorCurvesDS && viewer){
      try{ viewer.dataSources.remove(vendorCurvesDS) }catch{}
      vendorCurvesDS = null
      requestRender()
    }
  }
  function drawParabolaToDS(ds, startLng, startLat, endLng, endLat, attrs = {}){
    if(!ds) return
    const start = [startLng, startLat, 0]
    const step = Math.max(4, Math.floor(ui.vendorCurvesStep || 40))
    const heightProportion = ui.vendorCurvesHeight || 0.12
    const dLon = (endLng - start[0]) / step
    const dLat = (endLat - start[1]) / step
    const deltaLon = dLon * Math.abs(111000 * Math.cos(start[1]))
    const deltaLat = dLat * 111000
    const end = [0,0,0]
    const heigh = Math.floor(step * Math.sqrt(deltaLon ** 2 + deltaLat ** 2) * heightProportion)
    const x2 = 10000 * Math.sqrt(dLon ** 2 + dLat ** 2)
    const a = heigh / (x2 * x2)
    const y = x => Math.floor(heigh - a * x * x)
    for (let i=1;i<=step;i++){
      end[0] = start[0] + dLon
      end[1] = start[1] + dLat
      const x = x2 * ((2 * i) / step - 1)
      end[2] = y(x)
      const positions = Cesium.Cartesian3.fromDegreesArrayHeights([...start, ...end])
      ds.entities.add({
        polyline: {
          positions,
          width: 2,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: Cesium.Color.GOLD,
            outlineWidth: 0.25
          })
        },
        properties: {
          type: 'vendor-curve',
          ...attrs
        }
      })
      start[0] = end[0]; start[1] = end[1]; start[2] = end[2]
    }
  }
  // 解析 route 字段中的城市列表（去重、去空）
  function parseRouteCities(route){
    if(!route) return []
    const s = String(route)
    // 将连接符与标点替换为空格，然后按空白切分
    const norm = s.replace(/[↔<＞>←→\-–—~～→⇒▶️➡️至到、，,;；|]/g, ' ')
    const parts = norm.split(/\s+/).map(t=>t.trim()).filter(Boolean)
    // 过滤掉太短的词（如单个符号），保留中文/字母/市/州等常见后缀
    const cleaned = parts.map(p=>p.replace(/^[^\p{L}\p{Script=Han}]+|[^\p{L}\p{Script=Han}]+$/gu, ''))
      .filter(p=>p && p.length>=2)
    // 去重，保持顺序
    const seen = new Set()
    const result = []
    for(const c of cleaned){ if(!seen.has(c)){ seen.add(c); result.push(c) } }
    return result
  }
  async function drawVendorCurvesForSelected(){
    const viewer = viewerRef.value
    if(!viewer) return
    const w = currentWarehouseDetail.value
    if(!w || w.lon==null || w.lat==null) return
    const ds = ensureVendorCurvesDS()
    if(!ds) return
    try{ ds.entities.removeAll() }catch{}
    const vendors = currentCenterVendors.value || []
    if(!vendors.length) return
    const maxCount = Math.max(1, Math.floor(ui.vendorCurvesMax || 80))
    console.info('[VendorCurves] 准备绘制: center="'+(w.groupName||'')+'" vendors='+vendors.length+' 上限='+maxCount)
    let count = 0
    for(const v of vendors){
      if(count >= maxCount) break
      const loc = v.location || {}
      const lng = Number(loc.lng ?? loc.lon)
      const lat = Number(loc.lat)
      if(Number.isFinite(lng) && Number.isFinite(lat)){
        const attrs = {
          vendorId: v.id,
          vendorName: v.logisticsName || v.name || '',
          centerName: w.groupName || v.centerName || '',
          routeRaw: v.route || '',
          routeCities: parseRouteCities(v.route || '')
        }
        drawParabolaToDS(ds, w.lon, w.lat, lng, lat, attrs)
        count++
      }
    }
    console.info('[VendorCurves] 已绘制曲线数量=', count)
    requestRender()
  }

  // ===== 全景红点 (pano) =====
  const redEntities = []
  function createScaledRedDot(){
    const canvas = document.createElement('canvas')
    canvas.width = 16; canvas.height = 16
    const ctx = canvas.getContext('2d')
    ctx.beginPath(); ctx.arc(8,8,6,0,Math.PI*2)
    ctx.fillStyle='red'; ctx.fill(); ctx.strokeStyle='white'; ctx.lineWidth=0.5; ctx.stroke()
    return canvas
  }
  // 利用后面已存在的 redPoints 数组：这里只做 ui.pano 初始隐藏控制
  const panoInitialHide = () => {
    // 延迟到主 redPoints 创建完成后再处理（微任务）
    Promise.resolve().then(()=>{
      if (isDestroying || viewer.isDestroyed()) return
      if(!ui.pano){
        try { viewer.entities.values.forEach(ent=>{ if(ent.__pano) ent.show = false }) } catch {}
      }
    })
  }
  panoInitialHide()
  
  // 管线地形透明度设置
  viewer.scene.screenSpaceCameraController.enableCollisionDetection = false
  viewer.scene.globe.translucency.enabled = !!(ui.pipelines && ui.terrainXray)
  viewer.scene.globe.translucency.frontFaceAlpha = (ui.pipelines && ui.terrainXray) ? ui.terrainAlpha : 1
  viewer.scene.globe.translucency.backFaceAlpha = (ui.pipelines && ui.terrainXray) ? 0.05 : 1
  viewer.scene.pickTranslucentDepth = false
  
  // 批量加载所有预定义数据源
  console.log('开始加载数据源...')
  const loadedSources = await dataSourceManager.loadPredefinedDataSources()
  // 记录仓库数据源使用路径（DataSourceManager 内部在 console 输出，前端再尝试探测）
  try {
    // 通过尝试 HEAD 增强文件判断
    const resp = await fetch('/data/warehouse-with-vendors.geojson', { method: 'HEAD' })
    dataSourcesInfo.warehouseSource = resp.ok ? 'warehouse-with-vendors.geojson' : '仓库.json'
  } catch { dataSourcesInfo.warehouseSource = '仓库.json' }
  
  // 获取主要建筑数据用于缩放
  const osgb = dataSourceManager.getDataSource('osgb')
  if (osgb) {
    try {
      loadingText.value = '定位园区...'
      await sleep(900)

      // 电影感两段式飞行：先俯视接近园区，再绕一点角度倾斜推进，最后轻微“停靠”
      const flyToBSPromise = (boundingSphere, options) =>
        new Promise((resolve) => {
          try {
            viewer.camera.flyToBoundingSphere(boundingSphere, {
              ...options,
              complete: () => resolve(true),
              cancel: () => resolve(false)
            })
          } catch (e) {
            console.warn('[MapView] camera.flyToBoundingSphere failed', e)
            resolve(false)
          }
        })

      try { await osgb.readyPromise } catch {}
      const bs = osgb.boundingSphere
      const r = Math.max(1, bs?.radius || 1)
      const rangeFar = Math.max(26000, r * 42)
      const rangeNear = Math.max(1500, r * 7.5)
      const rangeDock = 400
      const heading0 = Cesium.Math.toRadians(35)
      const heading1 = heading0 + Cesium.Math.toRadians(42)

  
      await flyToBSPromise(bs, {
        offset: new Cesium.HeadingPitchRange(heading0, Cesium.Math.toRadians(-90), rangeFar),
        duration: 6.8,
        easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
      })

      await sleep(350)
      await flyToBSPromise(bs, {
        offset: new Cesium.HeadingPitchRange(heading1, Cesium.Math.toRadians(-35), rangeNear),
        duration: 5.8,
        easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
      })

      await sleep(220)
      loadingText.value = '进入园区...'
      await flyToBSPromise(bs, {
        offset: new Cesium.HeadingPitchRange(heading1, Cesium.Math.toRadians(-28), rangeDock),
        duration: 2.8,
        easingFunction: Cesium.EasingFunction.SINE_IN_OUT
      })
    } catch (e) {
      console.warn('[MapView] 初始飞行失败，fallback zoomTo', e)
      try { viewer.zoomTo(osgb) } catch {}
    }
  }
  // 初始飞行结束即可进入交互，其余资源后台继续加载
  if (!isDestroying) isLoading.value = false

  // 仅使用 factory-base 做平移动画（删去其它逻辑与 roof 依赖）
  const factoryBaseModel = dataSourceManager.getDataSource(FACTORY_MODEL_CONFIG.baseId) || null
  factoryRoofTileset = factoryBaseModel
  factoryRoofAnimatorOverrides = {
    mode: 'translate',
    fallbackLiftMeters: FACTORY_MODEL_CONFIG.fallbackLiftMeters ?? FACTORY_MODEL_CONFIG.liftMeters
  }
  factoryRoofDesiredOpen = !!ui.factoryRoofOpen
  if (factoryRoofTileset) {
    setupFactoryRoofAnimator(factoryRoofTileset, factoryRoofAnimatorOverrides || {})
  }
  
  // 设置管线图例
  const pipelineSources = dataSourceManager.getPipelineDataSources()
  const groups = new Map()
  pipelineSources.forEach((value, key) => {
    groups.set(value.config.name, {
      entities: value.entities,
      color: value.config.color,
      visible: true,
      dataSource: value.dataSource
    })
  })
  pipelineGroups.value = groups
  
  console.log(`数据源加载完成: ${loadedSources.size} 个数据源`)

  // ===== 仓库 CSV 装饰与调试标签 =====
  try {
    // 先加载 vendors（包含增强 FID 信息），再装饰仓库并注入说明
    await loadVendorsForCenters()
    const meta = await dataSourceManager.decorateWarehousesFromCSV({
      id: 'warehouse',
      csvUrl: '/data/warehouse-centers.csv',
      fidGroupSize: warehousesMeta.fidGroupSize,
      forceReload: true
    })
    warehousesMeta.list = meta
    // 初始化未匹配 FID 列表，避免后续模板访问 undefined
    warehousesMeta.missFids = meta.filter(m => m.rowCount === 0).map(m => m.fid)
  // 建立仓库实体集合
  warehouseEntities.clear()
  meta.forEach(w => { if (w.entity) warehouseEntities.add(w.entity) })
    // 注入 vendor 描述
    enrichWarehouseDescriptions()
    // 创建调试标签数据源
    if (warehouseDebugDS) {
      try { viewer.dataSources.remove(warehouseDebugDS) } catch {}
    }
    warehouseDebugDS = new Cesium.CustomDataSource('warehouse-debug-labels')
    meta.forEach(w => {
      if (w.lon != null && w.lat != null) {
        warehouseDebugDS.entities.add({
          position: Cesium.Cartesian3.fromDegrees(w.lon, w.lat, 12),
          label: {
            text: `${w.fid}\n${w.groupName}`,
            font: '12px sans-serif',
            fillColor: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -4),
            scaleByDistance: new Cesium.NearFarScalar(50, 1.0, 5000, 0.3)
          },
          properties: {
            type: 'warehouse-debug',
            fid: w.fid,
            group: w.groupName
          }
        })
      }
    })
    await viewer.dataSources.add(warehouseDebugDS)
    warehouseDebugDS.show = warehousesMeta.showLabels
    console.log('[仓库调试] 标签已建立:', warehouseDebugDS.entities.values.length)
    // 若开启了园区曲线且尚未选中园区，则默认选中第一个有坐标的园区并绘制
    if (ui.vendorCurves) {
      if (!warehousesMeta.selectedFid) {
        const candidate = (warehousesMeta.list||[]).find(m => Number.isFinite(m.lon) && Number.isFinite(m.lat))
        if (candidate) warehousesMeta.selectedFid = candidate.fid
      }
      try { await drawVendorCurvesForSelected() } catch (e) { console.warn('[VendorCurves] 初次绘制失败:', e) }
    }
    // （已合并至主点击 handler 中，这里不再单独注册仓库拾取）
  } catch (e) {
    console.warn('装饰仓库 CSV 失败:', e)
  }
  
  // ================= 加载楼层抽屉功能 =================
  try {
    console.log('开始加载楼层数据...')
    floor1 = await Cesium.Cesium3DTileset.fromUrl("/Assets/data/floor1/tileset.json")
    if (!viewer.isDestroyed()) viewer.scene.primitives.add(floor1)
    floor1.root.transform = generateModelMatrix([118.22839686268975, 35.10694503147065, -318], [0, 0, -1], [1, 1.5, 1])
    floor1.style = new Cesium.Cesium3DTileStyle({
      color: "color('white', 0.01)"
    })
    
    floor2 = await Cesium.Cesium3DTileset.fromUrl("/Assets/data/floor2/tileset.json")
    if (!viewer.isDestroyed()) viewer.scene.primitives.add(floor2)
    floor2.root.transform = generateModelMatrix([118.22839686268975, 35.10694503147065, -318], [0, 0, -1], [1, 1.5, 1])
    floor2.style = new Cesium.Cesium3DTileStyle({
      color: "color('white', 0.01)"
    })
    
  // 初始化楼层抽屉（事件逻辑融入主 handler）
  initFloorDrawer(viewer, [floor1, floor2], 35.0)
    console.log('楼层数据加载完成')
  } catch (error) {
    console.warn('楼层数据加载失败:', error)
  }
  
  // ================= 加载设施标注功能 =================
  try {
    facilitiesDS = await Cesium.GeoJsonDataSource.load('/Assets/data/geojson/设施.json', {
      clampToGround: true
    })
    if (!viewer.isDestroyed()) viewer.dataSources.add(facilitiesDS)
    
    facilitiesDS.entities.values.forEach(entity => {
      if (Cesium.defined(entity.position)) {
        // 获取当前坐标（世界坐标转经纬高）
        let carto = Cesium.Cartographic.fromCartesian(entity.position.getValue(Cesium.JulianDate.now()))
        let lon = Cesium.Math.toDegrees(carto.longitude)
        let lat = Cesium.Math.toDegrees(carto.latitude)
        let height = 20  // 在地面基础上抬高20米

        let newPosition = Cesium.Cartesian3.fromDegrees(lon, lat, height)
        let imageUrl = `/Assets/Images/qipao1.png`

        // 获取 GeoJSON 属性中的"名称字段"
        let name = entity.properties?.名称?.getValue ? entity.properties.名称.getValue() : '未知设施'

        entity.position = newPosition
        // 添加文字标签（显示名称字段）
        entity.label = new Cesium.LabelGraphics({
          text: name,
          font: "18px sans-serif",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK, 
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          pixelOffset: new Cesium.Cartesian2(0, -30)
        })
        
        entity.billboard = new Cesium.BillboardGraphics({
          image: imageUrl,
          width: 120,
          height: 56, 
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: 0
        })
      }
    })
    console.log('设施标注加载完成')
  } catch (error) {
    console.warn('设施标注加载失败:', error)
  }
  
  // ================= 加载灭火器功能 =================
  try {
    fireExtinguishersDS = await Cesium.GeoJsonDataSource.load('/Assets/data/geojson/灭火器.json', {
      clampToGround: true
    })
    if (!viewer.isDestroyed()) viewer.dataSources.add(fireExtinguishersDS)
    
    fireExtinguishersDS.entities.values.forEach(entity => {
      if (Cesium.defined(entity.position)) {
        // 获取当前坐标（世界坐标转经纬高）
        let carto = Cesium.Cartographic.fromCartesian(entity.position.getValue(Cesium.JulianDate.now()))
        let lon = Cesium.Math.toDegrees(carto.longitude)
        let lat = Cesium.Math.toDegrees(carto.latitude)
        let height = 8  // 在地面基础上抬高8米
        
        // 重新生成位置（相对地面8m高）
        let newPosition = Cesium.Cartesian3.fromDegrees(lon, lat, height)
        let imageUrl = `/Assets/Images/灭火器.png`
        
        entity.position = newPosition
        entity.billboard = new Cesium.BillboardGraphics({
          image: imageUrl,
          scale: 0.15,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: 0
        })
        entity.point = undefined  // 移除默认点样式
      }
    })
    console.log('灭火器标注加载完成')
  } catch (error) {
    console.warn('灭火器标注加载失败:', error)
  }
  
  poke()

  // 4) 点击高亮 + 红点跳转（共用一个 handler）
  let lastSelected = null
  function clearHighlight(entity) {
    if (!entity || !entity.polygon) return
    entity.polygon.material = Cesium.Color.fromCssColorString('rgba(0,255,255,0.01)')
    entity.polygon.outline = false
  }
  function highlightEntity(entity) {
    if (!entity || !entity.polygon) return
    entity.polygon.material = Cesium.Color.RED.withAlpha(0.5)
    entity.polygon.outline = true
    entity.polygon.outlineColor = Cesium.Color.RED
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  handler.setInputAction((movement) => {
    // 分析模式：主点击逻辑短路，不影响剖面/挖方采点
    if (sectionMode.value || excavationMode.value) return
    const picked = viewer.scene.pick(movement.position)

    // ========= 厂房掀盖：若当前为“开启”状态且点击目标不是厂房模型，则先收回并中止后续逻辑 =========
    if (ui.factory && ui.factoryRoofOpen) {
      let isClickOnFactory = false
      try {
        const prim = picked && (picked.primitive || picked.model || null)
        const ts = picked && picked.tileset
        if (prim && (prim === factoryRoofTileset)) isClickOnFactory = true
        // 当采用 fallback（以基础模型充当 roof 动画目标）时，同样接受点击基础模型
        if (!isClickOnFactory && prim && factoryRoofTileset && factoryRoofTileset.root == null && prim === factoryRoofTileset) {
          isClickOnFactory = true
        }
        if (!isClickOnFactory && ts && (ts === factoryRoofTileset)) isClickOnFactory = true
      } catch {}
      if (!isClickOnFactory) {
        ui.factoryRoofOpen = false
        // 由 watch(ui.factoryRoofOpen) 触发动画收回；此处吞掉事件，避免与仓库点击高亮冲突
        poke()
        return
      }
    }

    // ========= 楼层抽屉逻辑（优先处理） =========
    if (ui.floors && floorInfos.length) {
      // 兼容 Cesium 不同版本 pick 结果：primitive 或 tileset
      const clickedTileset = picked && (
        (picked.primitive instanceof Cesium.Cesium3DTileset && picked.primitive) ||
        (picked.tileset instanceof Cesium.Cesium3DTileset && picked.tileset) ||
        null
      )
      const target = clickedTileset && floorInfos.find(f => f.floor === clickedTileset)
      if (target) {
        // 判断是否已展开（通过比较 transform 是否不同于 initialMatrix）
        // 简单做法：再点同一楼层也保持展开，只切换目标
        initFloorDrawer // 引用避免 tree-shaking（无实际调用）
        // 展开目标楼层
        const { expandFloor } = { expandFloor: (t)=>{
          floorInfos.forEach(info => {
            if (info === t) {
              const translationENU = new Cesium.Cartesian3(0, 35.0, 0)
              const translationWorld = Cesium.Matrix4.multiplyByPoint(info.enuTransform, translationENU, new Cesium.Cartesian3())
              const offset = Cesium.Cartesian3.subtract(translationWorld, info.center, new Cesium.Cartesian3())
              const translationMatrix = Cesium.Matrix4.fromTranslation(offset)
              const newMatrix = Cesium.Matrix4.multiply(translationMatrix, info.initialMatrix, new Cesium.Matrix4())
              if (info.floor.root) info.floor.root.transform = newMatrix
              else info.floor.modelMatrix = newMatrix
              info.floor.style = new Cesium.Cesium3DTileStyle({ color: "color('white', 1.0)" })
            } else {
              if (info.floor.root) info.floor.root.transform = info.initialMatrix.clone()
              else info.floor.modelMatrix = info.initialMatrix.clone()
              info.floor.style = new Cesium.Cesium3DTileStyle({ color: "color('white', 0.01)" })
            }
          })
          requestRender()
        }}
        expandFloor(target)
        return // 阻止后续高亮/全景逻辑
      } else if (!picked) {
        // 点击空白复位
        floorInfos.forEach(info => {
          if (info.floor.root) info.floor.root.transform = info.initialMatrix.clone()
          else info.floor.modelMatrix = info.initialMatrix.clone()
          info.floor.style = new Cesium.Cesium3DTileStyle({ color: "color('white', 0.01)" })
        })
        requestRender()
      }
    }

    // 红点 / 任何带 url 的目标：根据类型处理
    if (picked && picked.id) {
      const ent = picked.id
      const url =
        ent.url ||
        (ent.properties && ent.properties.url && ent.properties.url.getValue && ent.properties.url.getValue())
      const type = 
        ent.type ||
        (ent.properties && ent.properties.type && ent.properties.type.getValue && ent.properties.type.getValue())
      
      // 分析模式下禁用全景打开（已在上方 return，这里逻辑冗余保护）
      if (url) {
        if (type === 'marzipano') {
          // 本地全景：使用全景查看器
          openPanorama(url, {
            name: `360° 全景点位`,
            url: url,
            type: type,
            coordinates: { lon: ent.lon, lat: ent.lat }
          })
        } else {
          // 外部链接：使用全景查看器显示外部内容
          openPanorama(url, {
            name: `全景点位 ${ent.lon?.toFixed(6)}, ${ent.lat?.toFixed(6)}`,
            url: url,
            type: type || 'external',
            coordinates: { lon: ent.lon, lat: ent.lat }
          })
        }
        poke()
        return
      }
    }

    // 多边形高亮
    if (lastSelected && (!picked || picked.id !== lastSelected)) {
      clearHighlight(lastSelected)
      lastSelected = null
    }
    if (picked && picked.id && picked.id.polygon) {
      const ent = picked.id
      // 检测是否仓库：1) 直接在集合中 2) 通过 fid 属性兜底匹配
      let isWarehouse = warehouseEntities.has(ent)
      let found = null
      if (isWarehouse) {
        found = warehousesMeta.list.find(w => w.entity === ent) || null
      } else {
        // 兜底：尝试读取 fid/FID 属性（可能是 ConstantProperty 或普通值）
        let fidProp = null
        try {
          const props = ent.properties
          if (props) {
            fidProp = props.fid || props.FID || (props.getValue && props.getValue(Cesium.JulianDate.now())?.fid)
            if (fidProp && fidProp.getValue) fidProp = fidProp.getValue(Cesium.JulianDate.now())
          }
        } catch {}
        if (fidProp != null) {
          found = warehousesMeta.list.find(w => Number(w.fid) === Number(fidProp)) || null
          if (found) {
            isWarehouse = true
            // 缺失引用一致性：把该实体加入集合，后续可直接命中
            warehouseEntities.add(ent)
            if (!found.entity) found.entity = ent
          }
        }
      }

      if (isWarehouse && found) {
        // 仓库高亮：对齐原通用逻辑，先清除上一通用高亮
        if (lastSelected && lastSelected !== ent) {
          clearHighlight(lastSelected)
          lastSelected = null
        }
        // 避免重复点击重复飞行：如果是同一个仓库且已经选中则不重复飞行
        const already = warehousesMeta.selectedFid === found.fid
        selectWarehouse(found, !already) // 已经选中则不再飞行
        poke()
        return
      }

      // 通用多边形高亮（保持原有“再次点击同一实体不处理”的行为）
      if (lastSelected === ent) {
        // 再次点击同一多边形：不做任何操作（保持与原实现一致）
        poke()
        return
      }
      if (lastSelected && lastSelected !== ent) {
        clearHighlight(lastSelected)
        lastSelected = null
      }
      highlightEntity(ent)
      lastSelected = ent
    }
    poke()
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  // 5) 全景红点（支持自定义图标 + 距离裁剪 + 聚合）

const redPointSeeds = [
    { lon: 118.22840000032071, lat: 35.10694586947898, url: '/Assets/data/project-title/', type: 'marzipano' },
    { lon: 118.22810000032071, lat: 35.10656486947898, url: 'http://172.20.10.2:3002', type: 'external' },
    { lon: 118.227706, lat: 35.10656486947898, url: 'http://172.20.10.2:3096', type: 'external' },
    { lon: 118.227311, lat: 35.10656486947898, url: 'http://192.168.2.9:3003 ' },
    { lon: 118.226933, lat: 35.10656486947898, url: 'http://192.168.2.9:3097 ' },
    { lon: 118.226555, lat: 35.10656486947898, url: 'http://192.168.2.9:3004' },
    { lon: 118.226555, lat: 35.10632486947898, url: 'http://192.168.2.9:3005 ' },
    { lon: 118.226555, lat: 35.10604486947898, url: 'http://192.168.2.9:3006' },
    { lon: 118.226933, lat: 35.10604486947898, url: 'http://192.168.2.9:3098 ' },
    { lon: 118.227311, lat: 35.10604486947898, url: 'http://192.168.2.9:3007 ' },
    { lon: 118.227706, lat: 35.10604486947898, url: 'http://192.168.2.9:3099 ' },
    { lon: 118.22810000032071, lat: 35.10604486947898, url: 'http://192.168.2.9:3008' },
    { lon: 118.22810000032071, lat: 35.10632486947898, url: 'http://192.168.2.9:3009 ' },
    { lon: 118.22810000032071, lat: 35.1057, url: 'http://192.168.2.9:3010' },
    { lon: 118.227706, lat: 35.1057, url: 'http://192.168.2.9:3011 ' },
    { lon: 118.227311, lat: 35.1057, url: 'http://192.168.2.9:3011 ' },
    { lon: 118.226933, lat: 35.1057, url: 'http://192.168.2.9:3012 ' },
    { lon: 118.226555, lat: 35.1057, url: 'http://192.168.2.9:3012' },
    { lon: 118.226555, lat: 35.10544526147898, url: 'http://192.168.2.9:3013 ' },
    { lon: 118.226555, lat: 35.10516526147898, url: 'http://192.168.2.9:3014' },
    { lon: 118.226933, lat: 35.10516526147898, url: 'http://192.168.2.9:3015 ' },
    { lon: 118.227311, lat: 35.10516526147898, url: 'http://192.168.2.9:3015 ' },
    { lon: 118.227706, lat: 35.10516526147898, url: 'http://192.168.2.9:3016 ' },
    { lon: 118.22810000032071, lat: 35.10516526147898, url: 'http://192.168.2.9:3016' },
    { lon: 118.22810000032071, lat: 35.10544526147898, url: 'http://192.168.2.9:3017 ' },
    { lon: 118.22810000032071, lat: 35.10483526147898, url: 'http://192.168.2.9:3018' },
    { lon: 118.227706, lat: 35.10483526147898, url: 'http://192.168.2.9:3019 ' },
    { lon: 118.227311, lat: 35.10483526147898, url: 'http://192.168.2.9:3019 ' },
    { lon: 118.226933, lat: 35.10483526147898, url: 'http://192.168.2.9:3020 ' },
    { lon: 118.226555, lat: 35.10483526147898, url: 'http://192.168.2.9:3020' },
    { lon: 118.226555, lat: 35.10455526147898, url: 'http://192.168.2.9:3021 ' },
    { lon: 118.226555, lat: 35.10427526147898, url: 'http://192.168.2.9:3022' },
    { lon: 118.226933, lat: 35.10427526147898, url: 'http://192.168.2.9:3023 ' },
    { lon: 118.227311, lat: 35.10427526147898, url: 'http://192.168.2.9:3023 ' },
    { lon: 118.227706, lat: 35.10427526147898, url: 'http://192.168.2.9:3024 ' },
    { lon: 118.22810000032071, lat: 35.10427526147898, url: 'http://192.168.2.9:3024' },
    { lon: 118.22810000032071, lat: 35.10455526147898, url: 'http://192.168.2.9:3025 ' },
    { lon: 118.22810000032071, lat: 35.10394526147898, url: 'http://192.168.2.9:3026' },
    { lon: 118.227706, lat: 35.10394526147898, url: 'http://192.168.2.9:3027 ' },
    { lon: 118.227311, lat: 35.10394526147898, url: 'http://192.168.2.9:3027 ' },
    { lon: 118.226933, lat: 35.10394526147898, url: 'http://192.168.2.9:3028 ' },
    { lon: 118.226555, lat: 35.10394526147898, url: 'http://192.168.2.9:3028' },
    { lon: 118.226555, lat: 35.10366526147898, url: 'http://192.168.2.9:3029 ' },
    { lon: 118.226555, lat: 35.10338526147898, url: 'http://192.168.2.9:3030' },
    { lon: 118.226933, lat: 35.10338526147898, url: 'http://192.168.2.9:3031 ' },
    { lon: 118.227311, lat: 35.10338526147898, url: 'http://192.168.2.9:3031 ' },
    { lon: 118.227706, lat: 35.10338526147898, url: 'http://192.168.2.9:3032 ' },
    { lon: 118.22810000032071, lat: 35.10338526147898, url: 'http://192.168.2.9:3032' },
    { lon: 118.22810000032071, lat: 35.10366526147898, url: 'http://192.168.2.9:3033 ' },
    { lon: 118.23060000032071, lat: 35.10656476947898, url: 'http://192.168.2.9:3034' },
    { lon: 118.230125, lat: 35.10656476947898, url: 'http://192.168.2.9:3035 ' },
    { lon: 118.22965000032071, lat: 35.10656476947898, url: 'http://192.168.2.9:3035 ' },
    { lon: 118.22915, lat: 35.10656476947898, url: 'http://192.168.2.9:3036 ' },
    { lon: 118.22865000032071, lat: 35.10656476947898, url: 'http://192.168.2.9:3036' },
    { lon: 118.22865000032071, lat: 35.10632486947898, url: 'http://192.168.2.9:3037 ' },
    { lon: 118.22865000032071, lat: 35.10604486947898, url: 'http://192.168.2.9:3038' },
    { lon: 118.22915, lat: 35.10604486947898, url: 'http://192.168.2.9:3039 ' },
    { lon: 118.22965000032071, lat: 35.10604486947898, url: 'http://192.168.2.9:3039 ' },
    { lon: 118.230125, lat: 35.10604486947898, url: 'http://192.168.2.9:3040 ' },
    { lon: 118.23060000032071, lat: 35.10604486947898, url: 'http://192.168.2.9:3040' },
    { lon: 118.23060000032071, lat: 35.10632486947898, url: 'http://192.168.2.9:3041 ' },
    { lon: 118.23060000032071, lat: 35.1057, url: 'http://192.168.2.9:3042' },
    { lon: 118.230125, lat: 35.1057, url: 'http://192.168.2.9:3043 ' },
    { lon: 118.22965000032071, lat: 35.1057, url: 'http://192.168.2.9:3043 ' },
    { lon: 118.22915, lat: 35.1057, url: 'http://192.168.2.9:3044 ' },
    { lon: 118.22865000032071, lat: 35.1057, url: 'http://192.168.2.9:3044' },
    { lon: 118.22865000032071, lat: 35.10544526147898, url: 'http://192.168.2.9:3045 ' },
    { lon: 118.22865000032071, lat: 35.10516526147898, url: 'http://192.168.2.9:3046' },
    { lon: 118.22915, lat: 35.10516526147898, url: 'http://192.168.2.9:3047 ' },
    { lon: 118.22965000032071, lat: 35.10516526147898, url: 'http://192.168.2.9:3047 ' },
    { lon: 118.230125, lat: 35.10516526147898, url: 'http://192.168.2.9:3048 ' },
    { lon: 118.23060000032071, lat: 35.10516526147898, url: 'http://192.168.2.9:3048' },
    { lon: 118.23060000032071, lat: 35.10544526147898, url: 'http://192.168.2.9:3049 ' },
    { lon: 118.23060000032071, lat: 35.10483526147898, url: 'http://192.168.2.9:3050' },
    { lon: 118.230125, lat: 35.10483526147898, url: 'http://192.168.2.9:3051 ' },
    { lon: 118.22965000032071, lat: 35.10483526147898, url: 'http://192.168.2.9:3051 ' },
    { lon: 118.22915, lat: 35.10483526147898, url: 'http://192.168.2.9:3052 ' },
    { lon: 118.22865000032071, lat: 35.10483526147898, url: 'http://192.168.2.9:3052' },
    { lon: 118.22865000032071, lat: 35.10455526147898, url: 'http://192.168.2.9:3053 ' },
    { lon: 118.22865000032071, lat: 35.10427526147898, url: 'http://192.168.2.9:3054' },
    { lon: 118.22915, lat: 35.10427526147898, url: 'http://192.168.2.9:3055 ' },
    { lon: 118.22965000032071, lat: 35.10427526147898, url: 'http://192.168.2.9:3055 ' },
    { lon: 118.230125, lat: 35.10427526147898, url: 'http://192.168.2.9:3055 ' },
    { lon: 118.23060000032071, lat: 35.10427526147898, url: 'http://192.168.2.9:3056' },
    { lon: 118.23060000032071, lat: 35.10455526147898, url: 'http://192.168.2.9:3057 ' },
    { lon: 118.23010000032071, lat: 35.10394526147898, url: 'http://192.168.2.9:3058' },
    { lon: 118.229725, lat: 35.10394526147898, url: 'http://192.168.2.9:3059' },
    { lon: 118.22935000032071, lat: 35.10394526147898, url: 'http://192.168.2.9:3059 ' },
    { lon: 118.229, lat: 35.10394526147898, url: 'http://192.168.2.9:3060' },
    { lon: 118.22865000032071, lat: 35.10394526147898, url: 'http://192.168.2.9:3060' },
    { lon: 118.22865000032071, lat: 35.10366526147898, url: 'http://192.168.2.9:3061 ' },
    { lon: 118.22865000032071, lat: 35.10338526147898, url: 'http://192.168.2.9:3062' },
    { lon: 118.229, lat: 35.10338526147898, url: 'http://192.168.2.9:3063' },
    { lon: 118.22935000032071, lat: 35.10338526147898, url: 'http://192.168.2.9:3063 ' },
    { lon: 118.229725, lat: 35.10338526147898, url: 'http://192.168.2.9:3064' },
    { lon: 118.23010000032071, lat: 35.10338526147898, url: 'http://192.168.2.9:3064' },
    { lon: 118.23010000032071, lat: 35.10366526147898, url: 'http://192.168.2.9:3065 ' },
    { lon: 118.2277, lat: 35.10308526147898, url: 'http://192.168.2.9:3066' },
    { lon: 118.22648, lat: 35.10308526147898, url: 'http://192.168.2.9:3067 ' },
    { lon: 118.22648, lat: 35.10277526147898, url: 'http://192.168.2.9:3068' },
    { lon: 118.22648, lat: 35.10249526147898, url: 'http://192.168.2.9:3069 ' },
    { lon: 118.2277, lat: 35.10249526147898, url: 'http://192.168.2.9:3070' },
    { lon: 118.2277, lat: 35.10277526147898, url: 'http://192.168.2.9:3071 ' },
    { lon: 118.2277, lat: 35.10217526147898, url: 'http://192.168.2.9:3072' },
    { lon: 118.22648, lat: 35.10217526147898, url: 'http://192.168.2.9:3073 ' },
    { lon: 118.22648, lat: 35.10189526147898, url: 'http://192.168.2.9:3074' },
    { lon: 118.22648, lat: 35.10161526147898, url: 'http://192.168.2.9:3075 ' },
    { lon: 118.22648, lat: 35.10133526147898, url: 'http://192.168.2.9:3076' },
    { lon: 118.2277, lat: 35.10133526147898, url: 'http://192.168.2.9:3077 ' },
    { lon: 118.2277, lat: 35.10161526147898, url: 'http://192.168.2.9:3078' },
    { lon: 118.2277, lat: 35.10189526147898, url: 'http://192.168.2.9:3079 ' },
    { lon: 118.229, lat: 35.10217526147898, url: 'http://192.168.2.9:3080' },
    { lon: 118.22810000032071, lat: 35.10217526147898, url: 'http://192.168.2.9:3081 ' },
    { lon: 118.22810000032071, lat: 35.10189526147898, url: 'http://192.168.2.9:3082' },
    { lon: 118.22810000032071, lat: 35.10161526147898, url: 'http://192.168.2.9:3083 ' },
    { lon: 118.22810000032071, lat: 35.10133526147898, url: 'http://192.168.2.9:3084' },
    { lon: 118.229, lat: 35.10133526147898, url: 'http://192.168.2.9:3085 ' },
    { lon: 118.229, lat: 35.10161526147898, url: 'http://192.168.2.9:3086 ' },
    { lon: 118.229, lat: 35.10189526147898, url: 'http://192.168.2.9:3087 ' },
    { lon: 118.22935000032071, lat: 35.10308526147898, url: 'http://192.168.2.9:3088 ' },
    { lon: 118.22865000032071, lat: 35.10308526147898, url: 'http://192.168.2.9:3089 ' },
    { lon: 118.22810000032071, lat: 35.10308526147898, url: 'http://192.168.2.9:3090 ' },
    { lon: 118.22810000032071, lat: 35.10277526147898, url: 'http://192.168.2.9:3091 ' },
    { lon: 118.22810000032071, lat: 35.10249526147898, url: 'http://192.168.2.9:3092 ' },
    { lon: 118.22865000032071, lat: 35.10249526147898, url: 'http://192.168.2.9:3093 ' },
    { lon: 118.22935000032071, lat: 35.10249526147898, url: 'http://192.168.2.9:3094 ' },
    { lon: 118.22935000032071, lat: 35.10277526147898, url: 'http://192.168.2.9:3095 ' }
  ]

  // 将点位映射到本地 Marzipano 全景资源（public/Assets/data/picture/picture/pic*/project-title/app-files）
  // 说明：浏览器端无法直接遍历 public 目录，因此这里按 pic1..pic127 约定映射；如需更精确映射可改为读取 JSON 清单。
  const PANO_LOCAL_ROOT = '/Assets/data/picture/picture'
  let panoRoot = PANO_LOCAL_ROOT
  let panoIds = Array.from({ length: 127 }, (_, i) => `pic${i + 1}`)
  try {
    const res = await fetch('/Assets/data/picture/pano-manifest.json', { cache: 'no-cache' })
    if (res.ok) {
      const manifest = await res.json()
      if (manifest && typeof manifest.root === 'string') panoRoot = manifest.root
      if (manifest && Array.isArray(manifest.ids) && manifest.ids.length) {
        panoIds = manifest.ids.map((v) => String(v)).filter(Boolean)
      } else if (manifest && Number.isFinite(manifest.start) && Number.isFinite(manifest.end)) {
        const start = Number(manifest.start)
        const end = Number(manifest.end)
        const pattern = typeof manifest.pattern === 'string' ? manifest.pattern : 'pic{n}'
        if (end >= start && end - start < 2000) {
          const ids = []
          for (let n = start; n <= end; n++) ids.push(pattern.replace('{n}', String(n)))
          panoIds = ids
        }
      }
    }
  } catch {}

  // 用 index.html 作为入口：既能被 PanoramaViewer 解析（提取 app-files 基址），也方便你直接在浏览器访问查看
  const toLocalPanoUrl = (id) => `${panoRoot}/${id}/project-title/app-files/index.html`
  const redPoints = redPointSeeds.slice(0, panoIds.length).map((pt, idx) => ({
    lon: pt.lon,
    lat: pt.lat,
    id: panoIds[idx],
    type: 'marzipano',
    url: toLocalPanoUrl(panoIds[idx])
  }))

  // 获取图标配置
  function getPanoIcon(type = 'external') {
    return PANO_ICON_CONFIG[type] || PANO_ICON_CONFIG.external
  }

  const panoDS = new Cesium.CustomDataSource('pano-dots')
  redPoints.forEach((pt) => {
    const icon = getPanoIcon(pt.type)
    panoDS.entities.add({
      // 将全景红点高度从 0 调整为 50 米，避免贴地被建筑或地形遮挡
      position: Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, 100),
      billboard: {
        image: icon.image,
        width: icon.width,
        height: icon.height,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance: new Cesium.NearFarScalar(500, 1.0, 6000, 0.3),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6500),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: 1e6
      },
      properties: { 
        url: pt.url,
        type: pt.type || 'external'
      },
      lon: pt.lon,
      lat: pt.lat
    })
  })
  await viewer.dataSources.add(panoDS)
  panoDS.clustering.enabled = ui.cluster
  panoDS.clustering.pixelRange = ui.clusterRange
  panoDS.clustering.minimumClusterSize = 6
  // clustering 会在相机缩放/移动时自动触发更新；这里不额外 requestRender，避免缩放期间产生额外渲染压力
  poke()

  // ================= 天气图层初始化 =================
  const weatherDS = new Cesium.CustomDataSource('weather-layer')
  const temperatureDS = new Cesium.CustomDataSource('temperature-layer')
  const precipitationDS = new Cesium.CustomDataSource('precipitation-layer')
  const windDS = new Cesium.CustomDataSource('wind-layer')
  const warningsDS = new Cesium.CustomDataSource('warnings-layer')

  await Promise.all([
    viewer.dataSources.add(weatherDS),
    viewer.dataSources.add(temperatureDS),
    viewer.dataSources.add(precipitationDS),
    viewer.dataSources.add(windDS),
    viewer.dataSources.add(warningsDS)
  ])

  // 天气数据更新函数
  async function updateWeatherLayers() {
    try {
      if (ui.temperature && ui.weather) {
        await loadTemperatureLayer()
      }
      if (ui.warnings && ui.weather) {
        await loadWarningsLayer()
      }
      poke()
    } catch (error) {
      console.warn('天气图层更新失败:', error)
    }
  }

  // 加载温度图层
  async function loadTemperatureLayer() {
    try {
      temperatureDS.entities.removeAll()
      const provinceWeather = await weatherService.getProvinceWeather()
      
      // 基础省会城市坐标（简化版）
      const provinceCenters = {
        '北京': { lat: 39.9042, lng: 116.4074 },
        '上海': { lat: 31.2304, lng: 121.4737 },
        '天津': { lat: 39.3434, lng: 117.3616 },
        '重庆': { lat: 29.4316, lng: 106.9123 },
        '广东': { lat: 23.1291, lng: 113.2644 },
        '江苏': { lat: 32.0603, lng: 118.7969 },
        '山东': { lat: 36.6512, lng: 117.1201 },
        '浙江': { lat: 30.2741, lng: 120.1551 },
        '河南': { lat: 34.7466, lng: 113.6254 },
        '四川': { lat: 30.6171, lng: 104.0668 },
        '湖北': { lat: 30.5928, lng: 114.3055 },
        '湖南': { lat: 28.2282, lng: 112.9388 },
        '河北': { lat: 38.0428, lng: 114.5149 },
        '福建': { lat: 26.0745, lng: 119.3062 }
      }

      Object.entries(provinceWeather).forEach(([province, data]) => {
        const center = provinceCenters[province]
        if (!center) return

        temperatureDS.entities.add({
          position: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, 50000),
          billboard: {
            show: true,
            image: createTemperatureIcon(data.temp, data.color),
            width: 48,
            height: 48,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            scaleByDistance: new Cesium.NearFarScalar(100000, 1.0, 2000000, 0.3)
          },
          label: {
            text: `${province}\n${data.temp}°C\n${data.weather}`,
            font: '12px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -60),
            scaleByDistance: new Cesium.NearFarScalar(100000, 1.0, 2000000, 0.3)
          },
          properties: {
            type: 'temperature',
            province: province,
            temperature: data.temp,
            weather: data.weather
          }
        })
      })
    } catch (error) {
      console.warn('温度图层加载失败:', error)
    }
  }

  // 加载预警图层
  async function loadWarningsLayer() {
    try {
      warningsDS.entities.removeAll()
      
      // 示例：在几个主要城市检查预警
      const majorCities = [
        { name: '北京', lat: 39.9042, lng: 116.4074 },
        { name: '上海', lat: 31.2304, lng: 121.4737 },
        { name: '广州', lat: 23.1291, lng: 113.2644 },
        { name: '深圳', lat: 22.5431, lng: 114.0579 }
      ]

      for (const city of majorCities) {
        const warnings = await weatherService.getDisasterWarning(city)
        
        warnings.forEach(warning => {
          warningsDS.entities.add({
            position: Cesium.Cartesian3.fromDegrees(city.lng, city.lat, 10000),
            billboard: {
              image: getWarningIcon(warning.level),
              width: 32,
              height: 32,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              scaleByDistance: new Cesium.NearFarScalar(10000, 1.0, 500000, 0.2)
            },
            label: {
              text: `⚠️ ${warning.title}`,
              font: '11px sans-serif',
              fillColor: Cesium.Color.YELLOW,
              outlineColor: Cesium.Color.RED,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -40)
            },
            properties: {
              type: 'warning',
              warningData: warning
            }
          })
        })
      }
    } catch (error) {
      console.warn('预警图层加载失败:', error)
    }
  }

  // 创建温度图标
  function createTemperatureIcon(temp, color) {
    const canvas = document.createElement('canvas')
    canvas.width = 48
    canvas.height = 48
    const ctx = canvas.getContext('2d')
    
    // 绘制圆形背景
    ctx.beginPath()
    ctx.arc(24, 24, 20, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 绘制温度文字
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${temp}°`, 24, 24)
    
    return canvas.toDataURL()
  }

  // 获取预警图标
  function getWarningIcon(level) {
    const colors = {
      '蓝色': '#0066FF',
      '黄色': '#FFCC00', 
      '橙色': '#FF6600',
      '红色': '#FF0000'
    }
    
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const ctx = canvas.getContext('2d')
    
    // 绘制警告三角形
    ctx.beginPath()
    ctx.moveTo(16, 4)
    ctx.lineTo(28, 24)
    ctx.lineTo(4, 24)
    ctx.closePath()
    ctx.fillStyle = colors[level] || '#FFCC00'
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 绘制感叹号
    ctx.fillStyle = '#000'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('!', 16, 16)
    
    return canvas.toDataURL()
  }

  // 初始加载天气图层
  await updateWeatherLayers()

  // ================= 管线分析功能 =================

  // 剖面分析
  // 上述分析方法已在顶层实现，这里移除重复定义

  // 分析剖面管线
  function analyzeSectionPipelines(startCart, endCart) {
    const pipelines = []
    const startPos = Cesium.Cartesian3.fromRadians(startCart.longitude, startCart.latitude, startCart.height)
    const endPos = Cesium.Cartesian3.fromRadians(endCart.longitude, endCart.latitude, endCart.height)
    
    if (dataSourceManager) {
      const pipelineSources = dataSourceManager.getPipelineDataSources()
      
      pipelineSources.forEach((sourceData) => {
        sourceData.entities.forEach(entity => {
          if (entity.polylineVolume && entity.polylineVolume.positions) {
            const positions = entity.polylineVolume.positions.getValue(Cesium.JulianDate.now())
            if (positions && positions.length >= 2) {
              for (let i = 0; i < positions.length - 1; i++) {
                const segStart = positions[i]
                const segEnd = positions[i + 1]
                const distance = calculateLineSegmentDistance(startPos, endPos, segStart, segEnd)
                if (distance < ui.sectionBuffer) { // 可调缓冲区（米）
                  const properties = {}
                  if (entity.properties) {
                    const propertyNames = entity.properties.propertyNames || []
                    propertyNames.forEach(name => {
                      let value = entity.properties[name]
                      if (value && typeof value.getValue === 'function') {
                        value = value.getValue(Cesium.JulianDate.now())
                      }
                      if (value !== undefined && value !== null) {
                        properties[name] = value
                      }
                    })
                  }
                  pipelines.push({
                    entity: entity,
                    name: entity.name || '未知管线',
                    properties: properties,
                    distance: distance
                  })
                  break
                }
              }
            }
          }
        })
      })
    }
    
    return pipelines
  }

  // 计算两条3D线段的最短距离
  function calculateLineSegmentDistance(a, b, c, d) {
    // 算法参考: 3D 线段-线段最近距离（基于投影与参数裁剪），返回欧氏距离
    const EPS = 1e-8
    const u = Cesium.Cartesian3.subtract(b, a, new Cesium.Cartesian3())
    const v = Cesium.Cartesian3.subtract(d, c, new Cesium.Cartesian3())
    const w = Cesium.Cartesian3.subtract(a, c, new Cesium.Cartesian3())
    const aU = Cesium.Cartesian3.dot(u, u) // |u|^2
    const bU = Cesium.Cartesian3.dot(u, v) // u·v
    const cU = Cesium.Cartesian3.dot(v, v) // |v|^2
    const dU = Cesium.Cartesian3.dot(u, w) // u·w
    const eU = Cesium.Cartesian3.dot(v, w) // v·w
    const D = aU * cU - bU * bU
    let sc, sN, sD = D
    let tc, tN, tD = D
    if (D < EPS) {
      // 线段几乎平行，退化处理：令 s=0，沿 v 找最近点
      sN = 0.0
      sD = 1.0
      tN = eU
      tD = cU
    } else {
      sN = (bU * eU - cU * dU)
      tN = (aU * eU - bU * dU)
      if (sN < 0) { sN = 0; tN = eU; tD = cU }
      else if (sN > sD) { sN = sD; tN = eU + bU; tD = cU }
    }
    if (tN < 0) {
      tN = 0
      if (-dU < 0) sN = 0
      else if (-dU > aU) sN = sD
      else { sN = -dU; sD = aU }
    } else if (tN > tD) {
      tN = tD
      if ((-dU + bU) < 0) sN = 0
      else if ((-dU + bU) > aU) sN = sD
      else { sN = (-dU + bU); sD = aU }
    }
    sc = Math.abs(sN) < EPS ? 0 : sN / sD
    tc = Math.abs(tN) < EPS ? 0 : tN / tD
    const dP = Cesium.Cartesian3.subtract(
      Cesium.Cartesian3.add(w, Cesium.Cartesian3.multiplyByScalar(u, sc, new Cesium.Cartesian3()), new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(v, tc, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    )
    return Cesium.Cartesian3.magnitude(dP)
  }

  // 显示管线信息
  function showPipelineInfo(pipelines, title) {
    pipelineInfo.title = title
    pipelineInfo.pipelines = pipelines
    pipelineInfo.show = true
  }

  // 管线分析鼠标事件
  analysisHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  
  // 鼠标移动
  analysisHandler.setInputAction((movement) => {
    const ray = viewer.camera.getPickRay(movement.endPosition)
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene)
    if (cartesian) {
      currentMousePosition = Cesium.Cartographic.fromCartesian(cartesian)
    } else {
      currentMousePosition = null
    }
    requestRender()
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
  
  // 点击事件
  analysisHandler.setInputAction((movement) => {
    if (sectionMode.value) {
      const ray = viewer.camera.getPickRay(movement.position)
      const cartesian = viewer.scene.globe.pick(ray, viewer.scene)
      if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
        sectionPoints.push(cartographic)
        
        if (sectionPoints.length === 1) {
          // 添加第一个点
          const pointEntity = viewer.entities.add({
            position: Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, cartographic.height),
            point: {
              pixelSize: 10,
              color: Cesium.Color.YELLOW,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2
            }
          })
          sectionTempEntities.push(pointEntity)
        } else if (sectionPoints.length === 2) {
          // 完成剖面分析
          const pipelines = analyzeSectionPipelines(sectionPoints[0], sectionPoints[1])
          showPipelineInfo(pipelines, '剖面分析结果')
          endSectionAnalysis()
        }
      }
    } else if (excavationMode.value) {
      const ray = viewer.camera.getPickRay(movement.position)
      const cartesian = viewer.scene.globe.pick(ray, viewer.scene)
      if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
        excavationPoints.push(cartographic)
        excavationPointsCount.value = excavationPoints.length
        
        // 添加点标记
        const pointEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, cartographic.height),
          point: {
            pixelSize: 8,
            color: Cesium.Color.CYAN,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1
          }
        })
        excavationTempEntities.push(pointEntity)
      }
    }
    
    poke()
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  // 双击完成挖方
  analysisHandler.setInputAction(() => {
    if (excavationMode.value && excavationPoints.length >= 3) {
      completeExcavation()
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

  // 管线图例控制交互在顶层 togglePipelineGroup 中实现，这里仅触发重绘

  // （移除局部重复的 openPanorama/closePanorama 定义，保留顶层版本）

  // ================= 图层面板联动（只改 show/参数，不破坏你的交互） =================
  const applyToggles = () => {
    // 使用数据源管理器控制显示
    if (dataSourceManager) {
  dataSourceManager.toggleDataSource('osgb', ui.osgb)
      dataSourceManager.toggleDataSource(FACTORY_MODEL_CONFIG.baseId, ui.factory)
  // 仅控制基础工厂模型显示
      dataSourceManager.toggleDataSource('warehouse', ui.geo)
      
      // 管线图层显示控制
      const pipelineSources = dataSourceManager.getPipelineDataSources()
      pipelineSources.forEach((value, key) => {
        dataSourceManager.toggleDataSource(key, ui.pipelines)
      })

      // 同步图例各组的数据源显示（当总开关关闭时仅隐藏，不改组可见状态；开启时按组状态恢复）
      const groups = pipelineGroups.value
      if (groups) {
        const setShow = (ds, show) => { if (ds && typeof ds.show !== 'undefined') ds.show = show }
        if (typeof groups.forEach === 'function') {
          groups.forEach((group, name) => {
            const ds = group?.dataSource
            setShow(ds, ui.pipelines && (group.visible !== false))
          })
        } else {
          Object.values(groups).forEach(group => {
            const ds = group?.dataSource
            setShow(ds, ui.pipelines && (group.visible !== false))
          })
        }
      }
    }
    
    panoDS.show = ui.pano
    
    // 楼层和设施图层显示控制
    if (floor1) floor1.show = ui.floors
    if (floor2) floor2.show = ui.floors
    if (facilitiesDS) facilitiesDS.show = ui.facilities
    if (fireExtinguishersDS) fireExtinguishersDS.show = ui.fireExtinguishers
    
    // 天气图层显示控制
    weatherDS.show = ui.weather
    temperatureDS.show = ui.weather && ui.temperature
    precipitationDS.show = ui.weather && ui.precipitation
    windDS.show = ui.weather && ui.wind
    warningsDS.show = ui.weather && ui.warnings

    if (!ui.factory && factoryRoofState) {
      cancelFactoryRoofAnimation()
      applyFactoryRoofProgress(0, { forceRender: true })
    }
    
    // 应用透明度
    const opacity = ui.weatherOpacity / 100
    if (temperatureDS.entities) {
      temperatureDS.entities.values.forEach(entity => {
        if (entity.billboard) entity.billboard.color = Cesium.Color.WHITE.withAlpha(opacity)
        if (entity.label) entity.label.fillColor = Cesium.Color.WHITE.withAlpha(opacity)
      })
    }

    // 地形透视：仅在开启地下管线 + 地形透视时启用
    try {
      const effectiveAlpha = (ui.pipelines && ui.terrainXray) ? ui.terrainAlpha : 1
      viewer.scene.globe.translucency.enabled = !!(ui.pipelines && ui.terrainXray)
      viewer.scene.globe.translucency.frontFaceAlpha = effectiveAlpha
      viewer.scene.globe.translucency.backFaceAlpha = (ui.pipelines && ui.terrainXray) ? 0.05 : 1
    } catch {}
    
    poke()
  }
  applyToggles()

  watch(() => [ui.osgb, ui.factory, ui.geo, ui.floors, ui.facilities, ui.fireExtinguishers, ui.pano, ui.pipelines, ui.terrainXray], applyToggles)

  // 地形透明度监听
  watch(() => ui.terrainAlpha, (alpha) => {
    const effectiveAlpha = (ui.pipelines && ui.terrainXray) ? alpha : 1
    viewer.scene.globe.translucency.frontFaceAlpha = effectiveAlpha
    
    poke()
  })

  watch(() => ui.cluster, (v) => {
    panoDS.clustering.enabled = v
    poke()
  })

  watch(() => ui.clusterRange, (v) => {
    panoDS.clustering.pixelRange = v
    poke()
  })

  watch(() => ui.sse, (v) => {
    if (dataSourceManager) {
      const osgb = dataSourceManager.getDataSource('osgb')
      if (osgb) osgb.maximumScreenSpaceError = v
      
      const factoryBase = dataSourceManager.getDataSource(FACTORY_MODEL_CONFIG.baseId)
      if (factoryBase && typeof factoryBase.maximumScreenSpaceError !== 'undefined') {
        factoryBase.maximumScreenSpaceError = v
      }

      // 已移除 roof/office 的细粒度控制
    }
    poke()
  })

  watch(() => ui.factoryRoofOpen, (open) => {
    factoryRoofDesiredOpen = !!open
    if (!ui.factory) return
    if (!factoryRoofState && factoryRoofTileset) {
      setupFactoryRoofAnimator(factoryRoofTileset, factoryRoofAnimatorOverrides || {})
    }
    if (factoryRoofState) {
      animateFactoryRoof(open)
    }
  })

  watch(() => ui.factory, (visible) => {
    if (!visible) {
      factoryRoofDesiredOpen = false
      if (ui.factoryRoofOpen) ui.factoryRoofOpen = false
      cancelFactoryRoofAnimation()
      if (factoryRoofState) {
        applyFactoryRoofProgress(0, { forceRender: true })
      }
    } else {
      if (!factoryRoofState && factoryRoofTileset) {
        setupFactoryRoofAnimator(factoryRoofTileset, factoryRoofAnimatorOverrides || {})
      }
      if (factoryRoofState) {
        applyFactoryRoofProgress(ui.factoryRoofOpen ? 1 : 0, { forceRender: true })
      }
    }
  })

  // 天气图层监听器
  watch(() => [ui.weather, ui.temperature, ui.precipitation, ui.wind, ui.warnings], applyToggles)
  
  watch(() => ui.weatherOpacity, applyToggles)

  // 仓库标签显示切换
  watch(() => warehousesMeta.showLabels, (v) => {
    if (warehouseDebugDS) warehouseDebugDS.show = v
    poke()
  })

  // 园区 -> 目的地曲线：开关与选中仓库变化时重绘
  watch(() => ui.vendorCurves, (on) => {
    if (on) {
      drawVendorCurvesForSelected()
    } else {
      clearVendorCurves()
    }
  })
  watch(currentWarehouseDetail, () => {
    if (ui.vendorCurves) drawVendorCurvesForSelected()
  })

  // 分组跨度变化 -> 防抖重建
  watch(() => warehousesMeta.fidGroupSize, (val) => {
    clearTimeout(redecorateTimer)
    redecorateTimer = setTimeout(() => {
      redecorateWarehouses()
    }, 400)
  })

  // 天气图层内容更新监听
  watch(() => [ui.temperature, ui.warnings], async () => {
    if (ui.weather) {
      await updateWeatherLayers()
    }
  })

  // 定期更新天气数据（每30分钟）
  weatherUpdateInterval = setInterval(async () => {
    if (ui.weather) {
      await updateWeatherLayers()
    }
  }, 30 * 60 * 1000)
  window.addEventListener('keydown', onKeydown)
  
  // 资源加载完成
  isLoading.value = false
})

// 统一清理（必须在 setup 同步阶段注册，避免生命周期警告）
onUnmounted(() => {
  isDestroying = true
  if (pipelineBlinkInterval) {
    try { clearInterval(pipelineBlinkInterval) } catch {}
    pipelineBlinkInterval = null
  }
  pendingTimeouts.forEach((t) => { try { clearTimeout(t) } catch {} })
  pendingTimeouts.clear()
  if (redecorateTimer) { try { clearTimeout(redecorateTimer) } catch {} redecorateTimer = null }
  if (weatherUpdateInterval) {
    clearInterval(weatherUpdateInterval)
    weatherUpdateInterval = null
  }
  cancelFactoryRoofAnimation()
  factoryRoofState = null
  factoryRoofTileset = null
  
  // 移除全局监听器
  window.removeEventListener('keydown', onKeydown)
  if (onResize) window.removeEventListener('resize', onResize)
  if (onWindowError) window.removeEventListener('error', onWindowError)
  if (onUnhandledRejection) window.removeEventListener('unhandledrejection', onUnhandledRejection)
  window.removeEventListener('mousemove', onVendorFloatMove)
  window.removeEventListener('mouseup', onVendorFloatUp)
  if (removeRenderErrorListener) {
    try { removeRenderErrorListener() } catch {}
    removeRenderErrorListener = null
  }
  if (removeBaseImageryErrorListener) {
    try { removeBaseImageryErrorListener() } catch {}
    removeBaseImageryErrorListener = null
  }
  if (restoreWidgetErrorPanel) {
    try { restoreWidgetErrorPanel() } catch {}
    restoreWidgetErrorPanel = null
  }
  if (removeCanvasWheelListener) {
    try { removeCanvasWheelListener() } catch {}
    removeCanvasWheelListener = null
  }
  if (removeWindowWheelCaptureListener) {
    try { removeWindowWheelCaptureListener() } catch {}
    removeWindowWheelCaptureListener = null
  }
  if (removeWebglContextLostListener) {
    try { removeWebglContextLostListener() } catch {}
    removeWebglContextLostListener = null
  }
  if (removeWebglContextRestoredListener) {
    try { removeWebglContextRestoredListener() } catch {}
    removeWebglContextRestoredListener = null
  }
  
  // 清理分析工具
  if (analysisHandler) {
    try { analysisHandler.destroy() } catch {}
    analysisHandler = null
  }
  if (floorHandler && floorHandler.destroy) {
    try { floorHandler.destroy() } catch {}
    floorHandler = null
  }
  
  // 关键：先清理所有 Cesium 资源，再销毁 viewer
  const viewer = viewerRef.value
  if (viewer && !viewer.isDestroyed()) {
    viewer.useDefaultRenderLoop = false
    try {
      // 移除所有 DataSources
      if (facilitiesDS) {
        viewer.dataSources.remove(facilitiesDS)
        facilitiesDS = null
      }
      if (fireExtinguishersDS) {
        viewer.dataSources.remove(fireExtinguishersDS)
        fireExtinguishersDS = null
      }
      
      // 清理园区曲线数据源
      try { clearVendorCurves() } catch {}
      
      // 移除 Primitives
      if (floor1) {
        viewer.scene.primitives.remove(floor1)
        floor1 = null
      }
      if (floor2) {
        viewer.scene.primitives.remove(floor2)
        floor2 = null
      }
      
      // 最后清理数据源管理器（会清理它管理的所有资源）
      if (dataSourceManager) {
        try { dataSourceManager.destroy() } catch {}
        dataSourceManager = null
      }
      
      // 最后销毁 viewer
      viewer.destroy()
      viewerRef.value = null
    } catch (e) {
      console.error('Cleanup failed:', e)
    }
  }
})

// 飞行到仓库实体（供调试面板调用）
let __currentFlightToken = 0
function flyToWarehouse(w, opts={}) {
  /* opts 可选参数：
     forceTwoStep: 强制两段动画
     topDown: 是否最终垂直俯视（默认 true）
     keepHeading: 是否保持当前 heading（默认 true）
     heading: 指定最终 heading（度，优先级高于 keepHeading=false 情况）
     finalPitchDeg: 自定义最终 pitch（默认 topDown:-88，否则 -35）
     debug: 输出调试信息
  */
  if (isDestroying) return Promise.resolve(false)
  const viewer = viewerRef.value
  if (!viewer || !w) { console.warn('[flyToWarehouse] 缺少 viewer 或 w'); return Promise.resolve(false) }
  const cam = viewer.camera
  let centerCart = null, radius = 200
  if (w.entity) {
    try {
      const bs = viewer.dataSourceDisplay.getBoundingSphere(w.entity)
      if (bs && bs.radius > 1 && Number.isFinite(bs.radius)) { centerCart = bs.center; radius = bs.radius }
    } catch {}
  }
  if (!centerCart && w.lon != null && w.lat != null) {
    centerCart = Cesium.Cartesian3.fromDegrees(w.lon, w.lat, 0)
  }
  if (!centerCart) { console.warn('[flyToWarehouse] 无中心可飞，放弃'); return Promise.resolve(false) }

  const dist = Cesium.Cartesian3.distance(cam.positionWC, centerCart)
  const topDown = opts.topDown !== false // 默认开启顶视
  // 高度策略：顶视模式提高基础高度，避免贴得太近导致透视畸变
  const baseClose = topDown ? radius * 3 : radius * 2
  const closeHeight = Math.min(Math.max(baseClose, topDown ? 200 : 120), topDown ? 2500 : 1500)
  const farHeight = Math.min(Math.max(closeHeight + Math.max(400, closeHeight * 0.8), radius * 6), topDown ? 6000 : 4500)

  const centerCarto = Cesium.Cartographic.fromCartesian(centerCart)
  const lon = Cesium.Math.toDegrees(centerCarto.longitude)
  const lat = Cesium.Math.toDegrees(centerCarto.latitude)
  const token = ++__currentFlightToken
  const twoStep = opts.forceTwoStep || dist < radius * 3
  const finalPitchDeg = typeof opts.finalPitchDeg === 'number' ? opts.finalPitchDeg : (topDown ? -88 : -35)
  const midPitchDeg = topDown ? -55 : -50
  const approachPitchDeg = topDown ? -70 : -35
  const keepHeading = opts.keepHeading !== false
  const targetHeadingRad = (keepHeading ? cam.heading : Cesium.Math.toRadians(typeof opts.heading === 'number' ? opts.heading : 0))

  if (opts.debug) {
    console.debug('[flyToWarehouse] cfg', { fid: w.fid, dist: dist.toFixed(1), radius: radius.toFixed(1), twoStep, closeHeight, farHeight, finalPitchDeg })
  }

  const doFly = (destinationHeight, pitchDeg, duration)=> new Promise(res=>{
    let done = false
    const finish = (ok)=>{ if(done) return; done=true; res(ok); if(!isDestroying) viewer.scene.requestRender?.() }
    try {
      cam.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, destinationHeight),
        orientation: { pitch: Cesium.Math.toRadians(pitchDeg), heading: targetHeadingRad, roll: 0 },
        duration,
        complete: ()=> finish(true),
        cancel: ()=> finish(false)
      })
    } catch(e){
      console.warn('[flyToWarehouse] camera.flyTo 异常 fallback', e)
      cam.setView({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, destinationHeight), orientation:{ heading: targetHeadingRad, pitch: Cesium.Math.toRadians(pitchDeg), roll:0 } })
      finish(false)
    }
    viewer.scene.requestRender?.()
  })

  const run = async ()=>{
    if (twoStep) {
      await doFly(farHeight, midPitchDeg, 0.7)
      if (token !== __currentFlightToken) return false
      await doFly(closeHeight, approachPitchDeg, 0.9)
    } else {
      const dynDur = Math.min(1.6, Math.max(0.85, dist / 4000))
      await doFly(closeHeight, approachPitchDeg, dynDur)
    }
    // 若位移极小执行兜底再靠近一次
    const newDist = Cesium.Cartesian3.distance(cam.positionWC, centerCart)
    if (newDist < 5) {
      if (opts.debug) console.debug('[flyToWarehouse] 位移极小，兜底再飞')
      await doFly(closeHeight + 800, approachPitchDeg - 5, 0.5)
      if (token === __currentFlightToken) await doFly(closeHeight, approachPitchDeg, 0.6)
    }
    // 最终强制顶视垂直矫正（flyTo 有时不会完全到 -90）
    if (token === __currentFlightToken && topDown) {
      try {
        cam.setView({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat, closeHeight),
          orientation: { heading: targetHeadingRad, pitch: Cesium.Math.toRadians(finalPitchDeg), roll: 0 }
        })
      } catch(e){ console.warn('[flyToWarehouse] setView 垂直矫正失败', e) }
    }
    // 高亮闪烁（可选）
    try {
      if (w.entity?.polygon) {
        const orig = w.entity.polygon.material
        w.entity.polygon.material = Cesium.Color.ORANGE.withAlpha(0.85)
        const t = setTimeout(() => {
          pendingTimeouts.delete(t)
          if(token===__currentFlightToken) w.entity.polygon.material = orig
        }, 900)
        pendingTimeouts.add(t)
      }
    } catch {}
    viewer.scene.requestRender?.()
    return true
  }
  return run()
}
function selectWarehouse(w, fly = false) {
  if (!w) return
  warehousesMeta.selectedFid = w.fid
  recomputeWarehouseCentroid(w)
  if (fly) flyToWarehouse(w)
  highlightWarehouseEntity(w.entity)
  scrollSelectedRowLater()
}
function highlightWarehouseEntity(ent) {
  if (isDestroying) return
  if (!ent || !ent.polygon) return
  // 还原上一个
  if (lastWarehouseHighlight && lastWarehouseHighlight !== ent) {
    try {
      lastWarehouseHighlight.polygon.material = Cesium.Color.fromCssColorString('rgba(0,255,255,0.01)')
      lastWarehouseHighlight.polygon.outline = false
    } catch {}
  }
  ent.polygon.material = Cesium.Color.ORANGE.withAlpha(0.55)
  ent.polygon.outline = true
  ent.polygon.outlineColor = Cesium.Color.WHITE
   lastWarehouseHighlight = ent
  requestRender()
}
// 监听推荐侧栏选中的商家
watch(selectedVendor, (v)=>{
  if(!v){ vendorHover.visible=false; vendorHover.vendor=null; return }
  vendorHover.vendor = v
  vendorHover.visible = true
  // 进入时将弹窗放到屏幕中心稍偏左上的位置（例如中心点向左 180px、向上 140px）
  try {
    const w = window.innerWidth
    const h = window.innerHeight
    const offsetX = 180
    const offsetY = 140
    vendorHover.x = Math.max(12, Math.round(w/2 - offsetX))
    vendorHover.y = Math.max(60, Math.round(h/2 - offsetY))
  } catch {}
  // 按 FID 或 centerName 定位仓库
  let target = null
  if(Number.isFinite(v.warehouse?.fid)) target = warehousesMeta.list.find(w=> w.fid === v.warehouse.fid)
  if(!target && v.centerName) target = warehousesMeta.list.find(w=> w.groupName === v.centerName)
  if(target) selectWarehouse(target, true)
})

function onVendorFloatMouseDown(e){
  if(e.button!==0) return
  const target = e.currentTarget
  vendorHover.dragging = true
  vendorHover.offsetX = e.clientX - vendorHover.x
  vendorHover.offsetY = e.clientY - vendorHover.y
  vendorHover.width = target.offsetWidth
  vendorHover.height = target.offsetHeight
  window.addEventListener('mousemove', onVendorFloatMove)
  window.addEventListener('mouseup', onVendorFloatUp, { once: true })
}
function onVendorFloatMove(e){
  if(!vendorHover.dragging) return
  const maxX = (window.innerWidth - vendorHover.width - 8)
  const maxY = (window.innerHeight - vendorHover.height - 8)
  vendorHover.x = Math.min(Math.max(4, e.clientX - vendorHover.offsetX), maxX)
  vendorHover.y = Math.min(Math.max(4, e.clientY - vendorHover.offsetY), maxY)
}
function onVendorFloatUp(){
  vendorHover.dragging = false
  window.removeEventListener('mousemove', onVendorFloatMove)
}
  // 重新计算仓库质心（防止多边形层级或层次变化导致失准）
  function recomputeWarehouseCentroid(w) {
    try {
      const ent = w.entity
      if (!ent?.polygon?.hierarchy) return
      const h = ent.polygon.hierarchy.getValue?.(Cesium.JulianDate.now()) || ent.polygon.hierarchy
      const positions = h.positions || h
      if (!positions || positions.length === 0) return
      let sx=0, sy=0, sz=0
      positions.forEach(p => { sx+=p.x; sy+=p.y; sz+=p.z })
      const c = new Cesium.Cartesian3(sx/positions.length, sy/positions.length, sz/positions.length)
      const carto = Cesium.Cartographic.fromCartesian(c)
      w.lon = Cesium.Math.toDegrees(carto.longitude)
      w.lat = Cesium.Math.toDegrees(carto.latitude)
    } catch {}
  }
  function scrollSelectedRowLater() {
    nextTick(() => {
      const id = 'wh-row-' + warehousesMeta.selectedFid
      const el = document.getElementById(id)
      if (el) {
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch {}
      }
    })
  }
  async function redecorateWarehouses() {
    if (isDestroying) return
    if (!dataSourceManager) return
    const viewer = viewerRef.value
    if (!viewer) return
    const prevSelected = warehousesMeta.selectedFid
    try {
      const meta = await dataSourceManager.decorateWarehousesFromCSV({
        id: 'warehouse',
        csvUrl: '/data/warehouse-centers.csv',
        fidGroupSize: warehousesMeta.fidGroupSize,
        forceReload: true
      })
      if (isDestroying || viewer.isDestroyed?.()) return
  warehousesMeta.list = meta
  warehousesMeta.missFids = meta.filter(m => m.rowCount === 0).map(m => m.fid)
      enrichWarehouseDescriptions()
      // 重建标签
      if (warehouseDebugDS) {
        try { viewer.dataSources.remove(warehouseDebugDS) } catch {}
      }
      warehouseDebugDS = new Cesium.CustomDataSource('warehouse-debug-labels')
      meta.forEach(w => {
        if (w.lon != null && w.lat != null) {
          warehouseDebugDS.entities.add({
            position: Cesium.Cartesian3.fromDegrees(w.lon, w.lat, 12),
            label: {
              text: `${w.fid}\n${w.groupName}`,
              font: '12px sans-serif',
              fillColor: Cesium.Color.YELLOW,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -4),
              scaleByDistance: new Cesium.NearFarScalar(50, 1.0, 5000, 0.3)
            }
          })
        }
      })
      if (isDestroying || viewer.isDestroyed?.()) return
      await viewer.dataSources.add(warehouseDebugDS)
      warehouseDebugDS.show = warehousesMeta.showLabels
      // 恢复选中
      if (prevSelected != null) {
        const found = warehousesMeta.list.find(m => m.fid === prevSelected)
        if (found) selectWarehouse(found, false)
      }
    } catch (e) {
      console.warn('重新分组失败', e)
    }
    poke()
  }
  function exportWarehouseMetaCSV() {
    if (!warehousesMeta.list.length) return
    const header = ['FID','中心名','线路数','经度','纬度']
    const rows = warehousesMeta.list.map(w => [w.fid,w.groupName,w.rowCount,w.lon??'',w.lat??''])
    const csv = [header.join(','), ...rows.map(r=>r.join(','))].join('\r\n')
    downloadText(csv, 'warehouses-meta.csv')
  }
  function exportWarehouseMissCSV() {
    if (!warehousesMeta.missFids.length) return
    const csv = '未匹配FID\r\n' + warehousesMeta.missFids.join('\r\n')
    downloadText(csv, 'warehouses-miss.csv')
  }
  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  return { ui, panelCollapse, panoramaModal, panoramaViewer, pipelineInfo, pipelineGroupEntries, warehousesMeta, currentWarehouseDetail, currentCenterVendors, vendorsByCenter, aggregatedCenterMetrics, flyToWarehouse, selectWarehouse, sectionMode, excavationMode, onPanoramaClosed, startSectionAnalysis, endSectionAnalysis, startExcavationAnalysis, completeExcavation, undoExcavationPoint, clearAllAnalysis, togglePipelineGroup, exportWarehouseMetaCSV, exportWarehouseMissCSV, dataSourcesInfo, vendorHover, isLoading, loadingText }
}
})
</script>

<style>
.map-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.4;

  --mv-accent: #0078d4;
  --mv-accent-2: #4cc2ff;
  --mv-panel-bg: rgba(44, 44, 44, 0.95);
  --mv-panel-border: rgba(255, 255, 255, 0.1);
  --mv-panel-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  --mv-panel-radius: 12px;
}
.map-root,
.map-root * {
  box-sizing: border-box;
}
.map-root button,
.map-root input,
.map-root select {
  font: inherit;
}
.map-root #cesiumContainer {
  width: 100%;
  height: 100%;
}

/* 加载遮罩 */
.map-root .loading-mask {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(circle at center, rgba(0,0,0,0.18), rgba(0,0,0,0.55));
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  backdrop-filter: blur(2px);
}
.map-root .loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid #fff;
  border-radius: 50%;
  animation: mapview-spin 1s linear infinite;
  margin-bottom: 16px;
}
.map-root .loading-text {
  font-size: 16px;
  letter-spacing: 1px;
}
@keyframes mapview-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Fluent 设计风格图层面板（右上角） */
.map-root .layer-panel {
  position: absolute;
  right: 20px;
  top: 20px;
  z-index: 10;
  background: var(--mv-panel-bg);
  color: #fff;
  padding: 16px;
  border-radius: var(--mv-panel-radius);
  min-width: 240px;
  font-size: 13px;
  backdrop-filter: blur(20px);
  border: 1px solid var(--mv-panel-border);
  box-shadow: var(--mv-panel-shadow);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.map-root .layer-panel.collapsed { padding: 12px 16px; }
.map-root .layer-panel.collapsed .panel-body { display: none; }
.map-root .collapse-btn { background:rgba(255,255,255,0.1);border:none;color:#fff;cursor:pointer;padding:2px 8px;font-size:14px;line-height:1;border-radius:6px; }
.map-root .collapse-btn:hover { background:rgba(255,255,255,0.22); }
.map-root .layer-panel .title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 15px;
  color: var(--mv-accent);
  margin-bottom: 4px;
  padding-bottom: 8px;
  border-bottom: 2px solid rgba(0, 120, 212, 0.3);
}
.map-root .layer-panel .row { 
  margin: 8px 0; 
  display: flex; 
  align-items: center; 
  gap: 10px; 
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s ease;
}

.map-root .layer-panel .row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.map-root .layer-panel .small { 
  opacity: 0.85;
  font-size: 12px;
  font-weight: 400;
}

.map-root .layer-panel .sep { 
  height: 1px; 
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent); 
  margin: 12px 0; 
}

.map-root .layer-panel .slider { 
  width: 100%; 
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  outline: none;
  transition: all 0.2s ease;
}

.map-root .layer-panel .slider::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  background: linear-gradient(135deg, var(--mv-accent), #106ebe);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 120, 212, 0.4);
  transition: all 0.2s ease;
}

.map-root .layer-panel .slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 3px 10px rgba(0, 120, 212, 0.6);
}

.map-root .layer-panel input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--mv-accent);
  cursor: pointer;
  transition: all 0.2s ease;
}

.map-root .layer-panel label {
  cursor: pointer;
  font-weight: 500;
  transition: color 0.2s ease;
  flex: 1;
}

.map-root .layer-panel label:hover {
  color: var(--mv-accent-2);
}

/* 天气图层样式增强 */
.map-root .layer-panel .row.small {
  font-size: 11px;
  margin: 3px 0 3px 12px;
}

.map-root .layer-panel .row.small input[type="checkbox"] {
  transform: scale(0.9);
}

.map-root .base-map-label {
  min-width: 48px;
  opacity: 0.9;
}
.map-root .base-map-select {
  flex: 1;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.06);
  color: #fff;
  padding: 0 8px;
}
.map-root .num-input {
  width: 88px;
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.06);
  color: #fff;
}
.map-root .redraw-btn {
  margin-left: 8px;
}

/* 管线分析面板样式 - Fluent 设计风格 */
.map-root .analysis-panel {
  position: absolute;
  top: 20px;
  left: 20px;
  background: var(--mv-panel-bg);
  color: white;
  padding: 16px;
  border-radius: var(--mv-panel-radius);
  min-width: 280px;
  max-height: 60vh;
  overflow-y: auto;
  z-index: 10; /* 让外部“信息栏”展开时可覆盖在此面板之上 */
  backdrop-filter: blur(20px);
  border: 1px solid var(--mv-panel-border);
  box-shadow: var(--mv-panel-shadow);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.map-root .analysis-panel.collapsed { max-height: none; padding: 12px 16px; }
.map-root .analysis-panel.collapsed .panel-collapse-body { display: none; }

.map-root .analysis-panel .panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.2);
}

.map-root .analysis-panel h3 {
  margin: 0;
  font-size: 16px;
  color: #fefefe;
}

.map-root .analysis-panel .close-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.map-root .analysis-panel .close-btn:hover {
  background: rgba(255,255,255,0.1);
  border-radius: 50%;
}

.map-root .control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 15px;
}

.map-root .control-group.with-top {
  margin-top: 8px;
}

.map-root .control-group button {
  background: linear-gradient(135deg, #0078d4, #106ebe);
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0, 120, 212, 0.2);
  position: relative;
  overflow: hidden;
}

.map-root .control-group button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s;
}

.map-root .control-group button:hover {
  background: linear-gradient(135deg, #106ebe, #005a9e);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 120, 212, 0.3);
}

.map-root .control-group button:hover::before {
  left: 100%;
}

.map-root .control-group button.active {
  background: linear-gradient(135deg, #ff6b35, #f7931e);
  box-shadow: 0 4px 16px rgba(255, 107, 53, 0.4);
}

.map-root .control-group button:active {
  transform: translateY(0);
}

.map-root .subsection { margin-bottom: 10px; }
.map-root .sub-title {
  font-size: 13px;
  font-weight: 600;
  color: #a8d8ff;
  margin: 6px 0 6px 2px;
}

.map-root .info-panel {
  background: rgba(32, 32, 32, 0.96);
  border-radius: 10px;
  padding: 16px;
  margin-top: 12px;
  border: 1px solid rgba(0, 120, 212, 0.2);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.map-root .info-content {
  max-height: 320px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--mv-accent) rgba(255, 255, 255, 0.1);
}

.map-root .info-content::-webkit-scrollbar {
  width: 6px;
}

.map-root .info-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.map-root .info-content::-webkit-scrollbar-thumb {
  background: var(--mv-accent);
  border-radius: 3px;
}

.map-root .no-data {
  color: #a0a0a0;
  text-align: center;
  padding: 32px 20px;
  font-style: italic;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
}

.map-root .pipeline-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.map-root .pipeline-item {
  background: linear-gradient(135deg, rgba(0, 120, 212, 0.1), rgba(16, 110, 190, 0.1));
  padding: 16px;
  border-radius: 8px;
  border-left: 4px solid #0078d4;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.map-root .pipeline-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(0, 120, 212, 0.5), transparent);
}

.map-root .pipeline-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 120, 212, 0.2);
  background: linear-gradient(135deg, rgba(0, 120, 212, 0.15), rgba(16, 110, 190, 0.15));
}

.map-root .pipeline-item h4 {
  margin: 0 0 12px 0;
  color: #4cc2ff;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.map-root .pipeline-item h4::before {
  content: '🔧';
  font-size: 12px;
}

.map-root .properties {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.map-root .property {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
}

.map-root .property .label {
  color: #b0b0b0;
  font-weight: 500;
  min-width: 90px;
  font-size: 12px;
}

.map-root .property .value {
  color: #fff;
  text-align: right;
  flex: 1;
  font-weight: 400;
  background: rgba(0, 120, 212, 0.1);
  padding: 2px 8px;
  border-radius: 3px;
  font-family: 'Consolas', monospace;
}

.map-root .legend-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.map-root .legend-item label {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 6px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.map-root .legend-item label:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateX(2px);
}

.map-root .legend-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--mv-accent);
  cursor: pointer;
}

.map-root .legend-item .swatch {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
}

.map-root .legend-item label:hover .swatch {
  transform: scale(1.1);
  border-color: rgba(255, 255, 255, 0.6);
}

.map-root .legend-item .name {
  color: #fff;
  flex: 1;
  font-weight: 500;
}

.map-root .legend-item .count {
  color: #a0a0a0;
  font-size: 12px;
  font-weight: 400;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 12px;
  min-width: 20px;
  text-align: center;
}

/* 内嵌到分析面板中的图例区块（不使用绝对定位） */
.map-root .legend-section {
  background: var(--mv-panel-bg);
  color: white;
  padding: 12px 16px;
  border-radius: var(--mv-panel-radius);
  margin-top: 12px;
  border: 1px solid var(--mv-panel-border);
}
.map-root .legend-section .panel-header h3 {
  margin: 0 0 10px 0;
  font-size: 15px;
  color: #fefefe;
  border-bottom: 1px solid rgba(255,255,255,0.2);
  padding-bottom: 6px;
}

/* 分析模式覆盖层样式 */
.map-root .analysis-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 50;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: clamp(48px, 10vh, 80px);
}

.map-root .analysis-overlay .msg {
  background: rgba(0, 120, 212, 0.95);
  color: white;
  padding: 16px 24px;
  border-radius: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(20px);
  box-shadow: 0 8px 32px rgba(0, 120, 212, 0.4);
  text-align: center;
  max-width: min(400px, calc(100vw - 24px));
  animation: mapview-analysisSlideDown 0.3s ease-out;
}

.map-root .analysis-overlay .msg strong {
  display: block;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #fff;
}

.map-root .analysis-overlay .msg .sub {
  font-size: 13px;
  opacity: 0.9;
  line-height: 1.4;
}

.map-root .indent-2 {
  margin-left: 2px;
}

/* 推荐商家悬浮窗 */
.map-root .vendor-float { position:absolute;z-index:120;width:clamp(220px, 36vw, 300px);max-width:calc(100vw - 24px);background:rgba(15,32,54,0.93);color:#fff;padding:12px 16px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,0.4);backdrop-filter:blur(8px);font-size:12px;line-height:1.4; }
.map-root .vendor-float .vh-name { font-weight:600;font-size:15px;margin-bottom:4px; }
.map-root .vendor-float .vh-metrics { display:flex;gap:12px;margin-top:6px;font-size:11px;flex-wrap:wrap;color:#ffd88a; }
.map-root .vendor-float .vh-tags { margin-top:6px;display:flex;flex-wrap:wrap;gap:4px; }
.map-root .vendor-float .vh-tag { background:#244b7a;padding:2px 6px;border-radius:6px;font-size:11px; }
.map-root .vendor-float .vh-close { position:absolute;right:6px;top:4px;cursor:pointer;font-size:14px;opacity:0.7; }
.map-root .vendor-float .vh-close:hover { opacity:1; }

.map-root .panel-fade-enter-active,
.map-root .panel-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.map-root .panel-fade-enter-from,
.map-root .panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 768px) {
  .map-root .layer-panel {
    top: 12px;
    right: 12px;
    min-width: 0;
    max-width: calc(100vw - 24px);
    padding: 12px;
  }

  .map-root .analysis-panel {
    left: 12px;
    right: 12px;
    top: auto;
    bottom: 12px;
    min-width: 0;
    width: auto;
    max-height: 55vh;
    padding: 12px;
  }
}

@media (max-width: 480px) {
  .map-root {
    font-size: 13px;
  }

  .map-root .layer-panel .row {
    padding: 4px 6px;
    gap: 8px;
  }

  .map-root .analysis-overlay .msg {
    padding: 12px 16px;
  }
}

@keyframes mapview-analysisSlideDown {
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>



```



