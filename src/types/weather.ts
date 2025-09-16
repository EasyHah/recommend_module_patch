import type { Query, MatchItem, LatLng } from './recommend'

// 扩展现有类型以支持天气功能
export * from './recommend'

// 天气相关的数据类型
export interface WeatherCondition {
  temperature: number
  humidity: number
  windSpeed: number
  windDirection: number
  weather: string
  visibility: number
  pressure: number
  icon: string
}

// 路径天气信息
export interface RouteWeatherInfo {
  origin: WeatherCondition
  destination: WeatherCondition
  waypoints?: WeatherCondition[]
  forecast?: Array<{
    time: string
    weather: WeatherCondition
  }>
  risks: Array<{
    type: string
    level: 'low' | 'medium' | 'high' | 'extreme'
    description: string
  }>
}

// 增强的查询类型（包含天气考虑）
export interface EnhancedQuery extends Query {
  weatherConsideration?: {
    enabled: boolean
    priority: 'low' | 'medium' | 'high' // 天气因素优先级
    avoidSevereWeather: boolean // 是否避开恶劣天气
    temperatureRange?: [number, number] // 适宜温度范围
  }
  routeWeather?: RouteWeatherInfo
}

// 增强的推荐结果
export interface EnhancedMatchItem extends MatchItem {
  weatherScore?: number // 天气适应性评分
  weatherFactors?: string[] // 影响天气因素
  weatherRisk?: 'low' | 'medium' | 'high' | 'extreme'
}

// 天气图层配置
export interface WeatherLayerConfig {
  temperature: {
    enabled: boolean
    opacity: number
    colorScheme: 'blue-red' | 'rainbow' | 'thermal'
  }
  precipitation: {
    enabled: boolean
    opacity: number
    showForecast: boolean
  }
  wind: {
    enabled: boolean
    opacity: number
    showDirection: boolean
    showSpeed: boolean
  }
  pressure: {
    enabled: boolean
    opacity: number
  }
  warnings: {
    enabled: boolean
    showDisasters: boolean
    alertLevel: 'all' | 'major' | 'severe'
  }
}

// Cesium天气可视化选项
export interface CesiumWeatherVisualization {
  type: 'heatmap' | 'particle' | 'model' | 'primitive'
  data: any[]
  style: {
    colorScale?: string[]
    opacity?: number
    size?: number
    animation?: boolean
  }
  updateInterval?: number // 更新间隔（毫秒）
}

// 天气服务配置
export interface WeatherServiceConfig {
  apiKey: string
  baseUrl: string
  timeout: number
  cacheDuration: number // 缓存持续时间（秒）
  updateInterval: number // 自动更新间隔（秒）
}

// 省份天气数据（用于宏观视图）
export interface ProvinceWeatherData {
  [province: string]: {
    temperature: number
    weather: string
    color: string
    riskLevel: 'low' | 'medium' | 'high' | 'extreme'
  }
}

// 3D场景中的天气实体
export interface WeatherEntity {
  id: string
  type: 'temperature' | 'precipitation' | 'wind' | 'warning'
  position: LatLng
  properties: Record<string, any>
  style: {
    color?: string
    size?: number
    opacity?: number
    model?: string
    billboard?: string
  }
  animation?: {
    enabled: boolean
    duration: number
    repeat: boolean
  }
}

// 天气数据缓存项
export interface WeatherCacheItem {
  data: any
  timestamp: number
  location: string
  expiresAt: number
}

// 天气预警信息
export interface WeatherAlert {
  id: string
  type: string
  level: 'blue' | 'yellow' | 'orange' | 'red'
  title: string
  description: string
  startTime: string
  endTime?: string
  areas: string[]
  logisticsImpact: {
    roadClosure: boolean
    speedReduction: number
    vehicleRestrictions: string[]
  }
}

// 路径天气分析结果
export interface RouteWeatherAnalysis {
  overallRisk: 'low' | 'medium' | 'high' | 'extreme'
  riskScore: number // 0-1
  criticalSections: Array<{
    startPoint: LatLng
    endPoint: LatLng
    riskType: string
    severity: number
    recommendation: string
  }>
  alternativeRoutes?: Array<{
    description: string
    additionalDistance: number
    reducedRisk: number
  }>
  timing: {
    bestDepartureTime?: string
    worstConditions?: string
    optimalWindow?: [string, string]
  }
}

// 天气影响的物流指标
export interface WeatherLogisticsMetrics {
  delayProbability: number // 延误概率 0-1
  fuelConsumptionMultiplier: number // 油耗倍数
  safetyRisk: number // 安全风险 0-1
  costImpact: number // 成本影响倍数
  serviceQualityImpact: number // 服务质量影响 0-1
}