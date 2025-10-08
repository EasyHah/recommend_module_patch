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
  const t0 = (typeof performance!=='undefined'? performance.now(): Date.now())
  const results: EnhancedMatchItem[] = []

  // 1. 路径天气（一次性）
  let routeWeatherData = q.routeWeather
  if (q.weatherConsideration?.enabled && !routeWeatherData) {
    try {
      const [originWeather, destinationWeather] = await Promise.all([
        weatherService.getWeather(q.origin),
        weatherService.getWeather(q.destination)
      ])
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
      const riskAssessment = await disasterService.assessRouteRisk([q.origin, q.destination])
      routeWeatherData.risks = riskAssessment.factors.map(factor => ({
        type: factor.type,
        level: factor.severity as 'low' | 'medium' | 'high' | 'extreme',
        description: factor.impact
      }))
      q.routeWeather = routeWeatherData
    } catch (err) {
      console.warn('[enhancedMatchVendors] 路径天气获取失败: ', err)
    }
  }

  // 2. 分组获取供应商天气 (核心性能优化)
  const useWeather = !!q.weatherConsideration?.enabled
  interface Group { key:string; vendors: Vendor[]; rep: Vendor }
  const groupsMap = new Map<string, Group>()
  const mkKey = (v:Vendor)=> v.centerName || (v.location.lat.toFixed(2)+','+v.location.lng.toFixed(2))
  vs.forEach(v=>{
    const k = mkKey(v)
    let g = groupsMap.get(k)
    if(!g){ g = { key:k, vendors:[], rep:v }; groupsMap.set(k, g) }
    g.vendors.push(v)
  })

  const weatherCache: Map<string, any> = new Map()
  if(useWeather){
    const groupList = [...groupsMap.values()]
    const CONCURRENCY = 6
    let idx = 0
    async function worker(){
      while(idx < groupList.length){
        const my = groupList[idx++]
        if(weatherCache.has(my.key)) continue
        try {
          const data = await weatherService.getWeather(my.rep.location)
          weatherCache.set(my.key, data)
        } catch(e){
          console.warn('[enhancedMatchVendors] 组天气获取失败 key=', my.key, e)
          weatherCache.set(my.key, null)
        }
      }
    }
    const workers = Array(Math.min(CONCURRENCY, groupList.length)).fill(0).map(()=>worker())
    await Promise.all(workers)
  }

  // 3. 构建结果
  for(const vendor of vs){
    const distance = haversine(q.origin, vendor.location)
    let vendorWeatherData: any = undefined
    let weatherScore = 1.0
    let weatherFactors: string[] = []
    let weatherRisk: 'low'|'medium'|'high'|'extreme' = 'low'
    if(useWeather){
      const k = mkKey(vendor)
      vendorWeatherData = weatherCache.get(k)
      if(vendorWeatherData){
        try {
          const impact = weatherService.getWeatherImpact(vendorWeatherData)
          weatherScore = impact.score
          weatherFactors = impact.factors
          weatherRisk = impact.level
        } catch(e){
          console.warn('[enhancedMatchVendors] impact 计算失败', e)
        }
      }
    }
    const hardCheckResult = enhancedHardCheck(q, vendor, distance, weatherScore)
    const score = hardCheckResult.ok ? enhancedSoftScore(q, vendor, distance, vendorWeatherData) : 0
    const buckets = enhancedBucketize(q, vendor, distance, vendorWeatherData)
    results.push({
      vendor,
      distanceKm: Math.round(distance*10)/10,
      feasible: hardCheckResult.ok,
      reasons: hardCheckResult.reasons,
      buckets,
      score,
      weatherScore,
      weatherFactors,
      weatherRisk
    })
  }

  const t1 = (typeof performance!=='undefined'? performance.now(): Date.now())
  if(useWeather) console.debug(`[enhancedMatchVendors] 供应商: ${vs.length} 组: ${groupsMap.size} 总耗时: ${(t1-t0).toFixed(0)}ms`)
  return results.sort((a,b)=> b.score - a.score)
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