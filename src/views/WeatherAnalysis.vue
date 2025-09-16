<template>
  <div class="weather-page">
    <header class="page-header">
      <h2>🌤️ 天气分析</h2>
      <p class="subtitle">实时天气监控与物流影响分析</p>
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
import { useRoute } from 'vue-router'
import FluentCard from '@/components/FluentCard.vue'
import WeatherTooltip from '@/components/WeatherTooltip.vue'
import { weatherService } from '@/services/weather'
import { disasterService } from '@/services/disaster'
import type { ProvinceWeatherData, RouteWeatherAnalysis, WeatherAlert } from '@/types/weather'

// 全局AMap类型声明
declare global {
  interface Window {
    AMap: any
  }
}

const route = useRoute()

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
const mapFullscreen = ref(false)
let routeMap: any = null
let routePath: any = null
let weatherMarkers: any[] = []

// 悬浮窗状态
const tooltipVisible = ref(false)
const tooltipData = ref({})
const tooltipPosition = ref({ x: 0, y: 0 })

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

// 确保高德地图API已加载
async function ensureAMapLoaded() {
  if (typeof window.AMap !== 'undefined' && window.AMap.Driving) {
    return window.AMap
  }

  const key = (import.meta as any).env.VITE_AMAP_KEY
  const sec = (import.meta as any).env.VITE_AMAP_SECURITY
  
  if (!key) {
    console.error('请在环境变量中设置 VITE_AMAP_KEY')
    return null
  }

  if (sec) {
    (window as any)._AMapSecurityConfig = { securityJsCode: sec }
  }

  console.log('开始加载高德地图API...')
  
  try {
    // 加载基础API
    if (typeof window.AMap === 'undefined') {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}`
        script.async = true
        script.onload = () => {
          console.log('高德地图API加载成功')
          resolve()
        }
        script.onerror = () => {
          reject(new Error('高德地图API加载失败'))
        }
        document.head.appendChild(script)
      })
    }

    // 加载需要的插件
    if (!window.AMap.Driving) {
      console.log('加载高德地图插件...')
      await new Promise<void>((resolve) => {
        window.AMap.plugin([
          'AMap.Driving',
          'AMap.Geocoder',
          'AMap.InfoWindow',
          'AMap.Marker',
          'AMap.Circle'
        ], () => {
          console.log('高德地图插件加载成功')
          resolve()
        })
      })
    }
    
    return window.AMap
  } catch (error) {
    console.error('高德地图API加载失败:', error)
    return null
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
})

// 组件卸载时清理事件监听
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  // 恢复body样式
  document.body.style.overflow = ''
})
</script>

<style scoped>
.weather-page {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0 0 8px 0;
  color: #1f2937;
  font-size: 28px;
  font-weight: 600;
}

.subtitle {
  margin: 0;
  color: #6b7280;
  font-size: 16px;
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
  color: #374151;
  margin-bottom: 4px;
}

.province-temp {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
}

.province-weather {
  font-size: 12px;
  color: #6b7280;
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
  color: #374151;
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
  font-size: 12px;
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
  color: #1f2937;
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
  color: #374151;
}

.section-severity, .section-recommendation, .alt-distance, .alt-risk {
  font-size: 14px;
  color: #6b7280;
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
  color: #1e40af;
}

/* 预警信息 */
.warnings-list {
  max-height: 400px;
  overflow-y: auto;
}

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
  color: #1f2937;
}

.warning-level {
  font-size: 12px;
  padding: 2px 8px;
  background: rgba(0,0,0,0.1);
  border-radius: 12px;
}

.warning-title {
  font-weight: 500;
  margin-bottom: 4px;
  color: #374151;
}

.warning-areas, .warning-logistics {
  font-size: 13px;
  color: #6b7280;
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
  color: #1f2937;
  font-size: 16px;
}

.category ul {
  margin: 0;
  padding: 0 0 0 16px;
  list-style: none;
}

.category li {
  margin: 6px 0;
  color: #4b5563;
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
  color: #6b7280;
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
  font-size: 11px;
  cursor: pointer;
  transition: transform 0.2s;
}

:global(.weather-marker:hover) {
  transform: scale(1.05);
}

:global(.weather-marker .weather-temp) {
  font-weight: bold;
  font-size: 13px;
  color: #1f2937;
  line-height: 1;
}

:global(.weather-marker .weather-desc) {
  font-size: 10px;
  color: #6b7280;
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
  font-size: 10px;
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
  font-size: 11px;
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
  font-size: 10px;
  font-weight: bold;
  color: white;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
  line-height: 1;
  margin-bottom: 1px;
}

:global(.route-weather-marker .weather-icon) {
  font-size: 8px;
  line-height: 1;
}

/* 风险警告信息窗样式 */
:global(.risk-warning) {
  padding: 8px 12px;
  border-radius: 6px;
  background: linear-gradient(135deg, #fee2e2, #fecaca);
  border: 1px solid #f87171;
  color: #dc2626;
  font-size: 12px;
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
  font-size: 10px;
  font-weight: bold;
  white-space: nowrap;
}

:global(.route-point-marker.start-marker .marker-label) {
  background: #10b981;
}

:global(.route-point-marker.end-marker .marker-label) {
  background: #ef4444;
}

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
  color: #374151;
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
  color: #374151;
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
  color: #374151;
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
  color: #1e293b;
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
  color: #64748b;
}

.info-item .value {
  font-weight: 600;
  color: #1e293b;
}

.province-risk-marker {
  background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.9));
  border: 2px solid #1890ff;
  border-radius: 8px;
  padding: 8px 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  font-size: 12px;
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
  font-size: 10px;
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
</style>