import type { Query, Vendor, MatchItem, LatLng } from '@/types/recommend'
import type { EnhancedQuery, EnhancedMatchItem } from '@/types/weather'
import { weatherService } from '@/services/weather'
import { disasterService } from '@/services/disaster'

// 导入原始的推荐算法函数
import { haversine, hardCheck as originalHardCheck, softScore as originalSoftScore, bucketize as originalBucketize } from '@/utils/recommendScore'

const toRad = (d: number) => d * Math.PI / 180
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x))

// 增强的硬性检查（包含天气因素）
export function enhancedHardCheck(q: EnhancedQuery, v: Vendor, d: number, weatherScore?: number): { ok: boolean; reasons: string[] } {
  // 先执行原始硬性检查
  const originalResult = originalHardCheck(q, v, d)
  const reasons = [...originalResult.reasons]
  
  // 添加天气相关硬性限制
  if (q.weatherConsideration?.enabled && q.weatherConsideration.avoidSevereWeather) {
    if (weatherScore !== undefined && weatherScore < 0.3) {
      reasons.push('天气条件过于恶劣，建议延后或改路线')
    }
    
    if (q.routeWeather?.risks?.some(risk => risk.level === 'extreme')) {
      reasons.push('路径存在极端天气风险')
    }
  }
  
  return {
    ok: originalResult.ok && reasons.length === originalResult.reasons.length,
    reasons
  }
}

// 增强的软性评分（包含天气因素）
export function enhancedSoftScore(q: EnhancedQuery, v: Vendor, d: number, weatherData?: any): number {
  // 获取原始评分
  const baseScore = originalSoftScore(q, v, d)
  
  // 如果没有开启天气考虑，直接返回原始评分
  if (!q.weatherConsideration?.enabled) {
    return baseScore
  }
  
  // 计算天气影响分数
  let weatherScore = 1.0
  
  if (weatherData) {
    const impact = weatherService.getWeatherImpact(weatherData)
    weatherScore = impact.score
    
    // 根据天气优先级调整权重
    const priority = q.weatherConsideration?.priority || 'medium'
    let weatherWeight = 0.15 // 默认权重
    
    switch (priority) {
      case 'low':
        weatherWeight = 0.08
        break
      case 'high':
        weatherWeight = 0.25
        break
      default: // medium
        weatherWeight = 0.15
        break
    }
    
    // 应用天气权重到总分
    const finalScore = baseScore * (1 - weatherWeight) + (baseScore * weatherScore * weatherWeight)
    return Math.round(finalScore)
  }
  
  return baseScore
}

// 增强的分类标签（包含天气相关标签）
export function enhancedBucketize(q: EnhancedQuery, v: Vendor, d: number, weatherData?: any): string[] {
  // 获取原始标签
  const baseBuckets = originalBucketize(q, v, d)
  const weatherBuckets: string[] = []
  
  if (q.weatherConsideration?.enabled && weatherData) {
    const impact = weatherService.getWeatherImpact(weatherData)
    
    switch (impact.level) {
      case 'low':
        weatherBuckets.push('天气适宜')
        break
      case 'medium':
        weatherBuckets.push('天气一般')
        break
      case 'high':
        weatherBuckets.push('天气影响')
        break
      case 'extreme':
        weatherBuckets.push('恶劣天气')
        break
    }
    
    // 特殊天气条件标签
    if (impact.factors.includes('极端温度')) {
      weatherBuckets.push('注意温控')
    }
    if (impact.factors.includes('强风')) {
      weatherBuckets.push('防风加固')
    }
    if (impact.factors.includes('降水天气')) {
      weatherBuckets.push('防水防湿')
    }
    if (impact.factors.includes('低能见度')) {
      weatherBuckets.push('谨慎驾驶')
    }
  }
  
  return [...baseBuckets, ...weatherBuckets]
}

// 增强的供应商匹配算法
export async function enhancedMatchVendors(q: EnhancedQuery, vs: Vendor[]): Promise<EnhancedMatchItem[]> {
  const results: EnhancedMatchItem[] = []
  
  // 获取路径天气数据（如果需要）
  let routeWeatherData = q.routeWeather
  if (q.weatherConsideration?.enabled && !routeWeatherData) {
    try {
      const originWeather = await weatherService.getWeather(q.origin)
      const destinationWeather = await weatherService.getWeather(q.destination)
      
      routeWeatherData = {
        origin: {
          temperature: originWeather.current.temp,
          humidity: originWeather.current.humidity,
          windSpeed: originWeather.current.windSpeed,
          windDirection: originWeather.current.windDir,
          weather: originWeather.current.weather,
          visibility: originWeather.current.visibility,
          pressure: originWeather.current.pressure,
          icon: originWeather.current.icon
        },
        destination: {
          temperature: destinationWeather.current.temp,
          humidity: destinationWeather.current.humidity,
          windSpeed: destinationWeather.current.windSpeed,
          windDirection: destinationWeather.current.windDir,
          weather: destinationWeather.current.weather,
          visibility: destinationWeather.current.visibility,
          pressure: destinationWeather.current.pressure,
          icon: destinationWeather.current.icon
        },
        risks: []
      }
      
      // 评估路径风险
      const riskAssessment = await disasterService.assessRouteRisk([q.origin, q.destination])
      routeWeatherData.risks = riskAssessment.factors.map(factor => ({
        type: factor.type,
        level: factor.severity as 'low' | 'medium' | 'high' | 'extreme',
        description: factor.impact
      }))
      
      // 更新查询对象
      q.routeWeather = routeWeatherData
    } catch (error) {
      console.warn('获取天气数据失败，使用基础推荐算法:', error)
    }
  }
  
  // 处理每个供应商
  for (const vendor of vs) {
    const distance = haversine(q.origin, vendor.location)
    
    // 获取供应商位置的天气数据
    let vendorWeatherData
    let weatherScore = 1.0
    let weatherFactors: string[] = []
    let weatherRisk: 'low' | 'medium' | 'high' | 'extreme' = 'low'
    
    if (q.weatherConsideration?.enabled) {
      try {
        vendorWeatherData = await weatherService.getWeather(vendor.location)
        const impact = weatherService.getWeatherImpact(vendorWeatherData)
        weatherScore = impact.score
        weatherFactors = impact.factors
        weatherRisk = impact.level
      } catch (error) {
        console.warn(`获取供应商 ${vendor.name} 位置天气失败:`, error)
      }
    }
    
    // 执行增强的硬性检查
    const hardCheckResult = enhancedHardCheck(q, vendor, distance, weatherScore)
    
    // 计算增强的软性评分
    const score = hardCheckResult.ok ? 
      enhancedSoftScore(q, vendor, distance, vendorWeatherData) : 0
    
    // 获取增强的分类标签
    const buckets = enhancedBucketize(q, vendor, distance, vendorWeatherData)
    
    // 构建增强的匹配结果
    const matchItem: EnhancedMatchItem = {
      vendor,
      distanceKm: Math.round(distance * 10) / 10,
      feasible: hardCheckResult.ok,
      reasons: hardCheckResult.reasons,
      buckets,
      score,
      weatherScore,
      weatherFactors,
      weatherRisk
    }
    
    results.push(matchItem)
  }
  
  // 按评分排序
  return results.sort((a, b) => b.score - a.score)
}

// 获取天气建议
export function getWeatherRecommendations(q: EnhancedQuery, matches: EnhancedMatchItem[]): {
  summary: string
  recommendations: string[]
  optimalTiming?: {
    bestTime: string
    avoidTime: string
  }
  riskAlerts: string[]
} {
  const recommendations: string[] = []
  const riskAlerts: string[] = []
  let summary = '天气条件良好，适宜物流配送'
  
  if (!q.weatherConsideration?.enabled || !q.routeWeather) {
    return {
      summary: '未启用天气分析',
      recommendations: ['建议开启天气分析以获得更准确的推荐'],
      riskAlerts: []
    }
  }
  
  // 分析整体天气风险
  const risks = q.routeWeather.risks
  const highRiskCount = risks.filter(r => r.level === 'high' || r.level === 'extreme').length
  
  if (highRiskCount > 0) {
    summary = `检测到 ${highRiskCount} 个高风险天气因素`
    riskAlerts.push(`路径存在${highRiskCount}个天气风险点`)
  }
  
  // 生成具体建议
  risks.forEach(risk => {
    switch (risk.level) {
      case 'extreme':
        recommendations.push(`极端${risk.type}：建议延后出发或选择替代路线`)
        riskAlerts.push(`极端天气警告：${risk.description}`)
        break
      case 'high':
        recommendations.push(`${risk.type}影响较大：${risk.description}`)
        break
      case 'medium':
        recommendations.push(`注意${risk.type}：采取预防措施`)
        break
    }
  })
  
  // 分析供应商天气适应性
  const weatherFriendlyVendors = matches.filter(m => m.weatherRisk === 'low' || m.weatherRisk === 'medium').length
  if (weatherFriendlyVendors < matches.length / 2) {
    recommendations.push('当前天气对多数供应商有影响，建议延后或加强防护')
  }
  
  // 温度相关建议
  const originTemp = q.routeWeather.origin.temperature
  const destTemp = q.routeWeather.destination.temperature
  
  if (Math.abs(originTemp - destTemp) > 10) {
    recommendations.push(`起终点温差较大(${Math.abs(originTemp - destTemp)}°C)，注意货物温控`)
  }
  
  if (originTemp > 35 || destTemp > 35) {
    recommendations.push('高温天气，避免午间配送，注意冷链运输')
  }
  
  if (originTemp < 0 || destTemp < 0) {
    recommendations.push('低温天气，注意防冻措施和车辆预热')
  }
  
  // 如果没有具体建议，提供默认建议
  if (recommendations.length === 0) {
    recommendations.push('天气条件适宜，可正常安排物流配送')
  }
  
  return {
    summary,
    recommendations: [...new Set(recommendations)], // 去重
    riskAlerts
  }
}

// 导出原始函数以保持兼容性
export { haversine, originalHardCheck as hardCheck, originalSoftScore as softScore, originalBucketize as bucketize }

// 主匹配函数保持向后兼容
export function matchVendors(q: Query, vs: Vendor[]): MatchItem[] {
  return vs.map(v => {
    const d = haversine(q.origin, v.location)
    const { ok, reasons } = originalHardCheck(q, v, d)
    const score = ok ? originalSoftScore(q, v, d) : 0
    const buckets = originalBucketize(q, v, d)
    return {
      vendor: v,
      distanceKm: Math.round(d * 10) / 10,
      feasible: ok,
      reasons,
      buckets,
      score
    }
  }).sort((a, b) => b.score - a.score)
}