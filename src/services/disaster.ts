import type { LatLng } from '@/types/recommend'
import { weatherService, type DisasterData } from './weather'

// 扩展的灾害类型
export interface ExtendedDisasterData extends DisasterData {
  severity: 1 | 2 | 3 | 4 // 严重程度：1-轻微, 2-一般, 3-严重, 4-特别严重
  category: 'weather' | 'geological' | 'traffic' | 'other'
  affectedArea: {
    center: LatLng
    radius: number // 影响半径(km)
  }
  logisticsImpact: {
    roadClosure: boolean
    speedLimit: number | null // km/h
    vehicleRestriction: string[] // 限制车辆类型
    alternativeRoute: string | null // 建议绕行路线
  }
}

// 物流风险评估结果
export interface LogisticsRiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'extreme'
  score: number // 0-1，越低风险越大
  factors: Array<{
    type: string
    severity: string
    impact: string
    mitigation: string
  }>
  recommendations: string[]
  blockedAreas: LatLng[]
}

class DisasterService {
  // 获取指定区域的灾害预警
  async getDisastersInArea(center: LatLng, radiusKm: number = 50): Promise<ExtendedDisasterData[]> {
    try {
      // 获取基础灾害数据
      const basicDisasters = await weatherService.getDisasterWarning(center)
      
      // 扩展灾害数据，添加物流相关信息
      const extendedDisasters: ExtendedDisasterData[] = basicDisasters.map(disaster => 
        this.enhanceDisasterData(disaster, center)
      )

      // 过滤距离范围内的灾害
      return extendedDisasters.filter(disaster => 
        this.calculateDistance(center, disaster.affectedArea.center) <= radiusKm
      )
    } catch (error) {
      console.error('获取灾害数据失败:', error)
      return []
    }
  }

  // 评估路径物流风险
  async assessRouteRisk(waypoints: LatLng[]): Promise<LogisticsRiskAssessment> {
    const allDisasters: ExtendedDisasterData[] = []
    const factors: Array<{type: string; severity: string; impact: string; mitigation: string}> = []
    const recommendations: string[] = []
    const blockedAreas: LatLng[] = []

    try {
      // 为路径上每个点获取灾害信息
      for (const point of waypoints) {
        const disasters = await this.getDisastersInArea(point, 30) // 30km搜索半径
        allDisasters.push(...disasters)
      }

      // 去重
      const uniqueDisasters = allDisasters.filter((disaster, index, self) => 
        index === self.findIndex(d => d.id === disaster.id)
      )

      let riskScore = 1.0

      // 分析每个灾害的影响
      for (const disaster of uniqueDisasters) {
        const impact = this.analyzeLogisticsImpact(disaster)
        
        factors.push({
          type: disaster.type,
          severity: this.getSeverityText(disaster.severity),
          impact: impact.description,
          mitigation: impact.mitigation
        })

        riskScore *= impact.scoreMultiplier
        recommendations.push(...impact.recommendations)

        // 记录被阻断的区域
        if (disaster.logisticsImpact.roadClosure) {
          blockedAreas.push(disaster.affectedArea.center)
        }
      }

      // 确定整体风险等级
      let overallRisk: 'low' | 'medium' | 'high' | 'extreme'
      if (riskScore >= 0.9) overallRisk = 'low'
      else if (riskScore >= 0.75) overallRisk = 'medium'
      else if (riskScore >= 0.5) overallRisk = 'high'
      else overallRisk = 'extreme'

      // 添加通用建议
      if (overallRisk !== 'low') {
        recommendations.unshift('建议提前规划备用路线')
        recommendations.push('密切关注天气和路况更新')
      }

      return {
        overallRisk,
        score: riskScore,
        factors,
        recommendations: [...new Set(recommendations)], // 去重
        blockedAreas
      }
    } catch (error) {
      console.error('路径风险评估失败:', error)
      return {
        overallRisk: 'medium',
        score: 0.8,
        factors: [],
        recommendations: ['无法获取完整风险信息，建议谨慎行驶'],
        blockedAreas: []
      }
    }
  }

  // 获取物流友好的替代路径建议
  async getSafeRouteAlternatives(origin: LatLng, destination: LatLng): Promise<{
    alternatives: Array<{
      description: string
      riskLevel: 'low' | 'medium' | 'high'
      additionalDistance: number
      estimatedDelay: number // 分钟
    }>
    emergencyContacts: Array<{
      name: string
      phone: string
      service: string
    }>
  }> {
    // 评估主要路径风险
    const mainRouteRisk = await this.assessRouteRisk([origin, destination])
    
    const alternatives = []
    const emergencyContacts = [
      { name: '交通救援', phone: '12122', service: '道路救援' },
      { name: '气象服务', phone: '12121', service: '天气咨询' },
      { name: '物流调度', phone: '95338', service: '货运协调' }
    ]

    if (mainRouteRisk.overallRisk !== 'low') {
      // 提供替代路线建议
      alternatives.push(
        {
          description: '国道绕行，避开高风险区域',
          riskLevel: 'low' as const,
          additionalDistance: 50,
          estimatedDelay: 60
        },
        {
          description: '选择高速公路主干道',
          riskLevel: 'medium' as const,
          additionalDistance: 20,
          estimatedDelay: 30
        }
      )

      if (mainRouteRisk.overallRisk === 'extreme') {
        alternatives.push({
          description: '建议延迟出发，等待天气好转',
          riskLevel: 'low' as const,
          additionalDistance: 0,
          estimatedDelay: 240 // 4小时延迟
        })
      }
    }

    return {
      alternatives,
      emergencyContacts
    }
  }

  // 增强灾害数据
  private enhanceDisasterData(disaster: DisasterData, referencePoint: LatLng): ExtendedDisasterData {
    // 解析严重程度
    const severity = this.parseSeverity(disaster.level)
    
    // 确定分类
    const category = this.categorizeDisaster(disaster.type)
    
    // 估算影响区域（基于灾害类型和等级）
    const affectedArea = {
      center: referencePoint, // 简化处理，实际应该从灾害数据中解析
      radius: this.estimateAffectedRadius(disaster.type, severity)
    }

    // 分析物流影响
    const logisticsImpact = this.assessLogisticsImpact(disaster, severity)

    return {
      ...disaster,
      severity,
      category,
      affectedArea,
      logisticsImpact
    }
  }

  // 解析严重程度
  private parseSeverity(level: string): 1 | 2 | 3 | 4 {
    const levelLower = level.toLowerCase()
    if (levelLower.includes('蓝') || levelLower.includes('四级')) return 1
    if (levelLower.includes('黄') || levelLower.includes('三级')) return 2
    if (levelLower.includes('橙') || levelLower.includes('二级')) return 3
    if (levelLower.includes('红') || levelLower.includes('一级')) return 4
    return 2 // 默认值
  }

  // 分类灾害
  private categorizeDisaster(type: string): 'weather' | 'geological' | 'traffic' | 'other' {
    const weatherTypes = ['暴雨', '台风', '雷电', '大风', '雾', '霾', '高温', '寒潮', '雪']
    const geologicalTypes = ['地震', '滑坡', '泥石流']
    const trafficTypes = ['交通']

    if (weatherTypes.some(t => type.includes(t))) return 'weather'
    if (geologicalTypes.some(t => type.includes(t))) return 'geological'
    if (trafficTypes.some(t => type.includes(t))) return 'traffic'
    return 'other'
  }

  // 估算影响半径
  private estimateAffectedRadius(type: string, severity: number): number {
    const baseRadius = type.includes('台风') ? 200 : 
                      type.includes('暴雨') ? 100 :
                      type.includes('大风') ? 150 :
                      type.includes('雾') ? 80 : 50

    return baseRadius * (severity / 2) // 根据严重程度调整
  }

  // 评估物流影响
  private assessLogisticsImpact(disaster: DisasterData, severity: number) {
    const type = disaster.type
    
    let roadClosure = false
    let speedLimit: number | null = null
    const vehicleRestriction: string[] = []
    let alternativeRoute: string | null = null

    // 根据灾害类型和严重程度确定影响
    if (type.includes('暴雨') || type.includes('台风')) {
      if (severity >= 3) {
        roadClosure = true
        alternativeRoute = '建议选择地势较高的道路'
      } else {
        speedLimit = 60
        vehicleRestriction.push('危化品运输车')
      }
    }

    if (type.includes('大风')) {
      if (severity >= 2) {
        vehicleRestriction.push('高架车', '空载货车')
        speedLimit = 40
      }
    }

    if (type.includes('雾') || type.includes('霾')) {
      if (severity >= 2) {
        speedLimit = 40
        alternativeRoute = '建议等待能见度改善'
      }
    }

    if (type.includes('雪') || type.includes('道路结冰')) {
      vehicleRestriction.push('未安装防滑链车辆')
      speedLimit = 30
    }

    return {
      roadClosure,
      speedLimit,
      vehicleRestriction,
      alternativeRoute
    }
  }

  // 分析物流影响详情
  private analyzeLogisticsImpact(disaster: ExtendedDisasterData) {
    const type = disaster.type
    const severity = disaster.severity
    
    let scoreMultiplier = 1.0
    let description = ''
    let mitigation = ''
    const recommendations: string[] = []

    if (type.includes('暴雨') || type.includes('台风')) {
      scoreMultiplier = severity >= 3 ? 0.3 : 0.7
      description = '可能导致道路积水，影响通行'
      mitigation = '选择排水良好的道路，准备防水措施'
      recommendations.push('携带防水布', '关注积水路段信息')
    }

    if (type.includes('大风')) {
      scoreMultiplier = severity >= 3 ? 0.4 : 0.8
      description = '强风可能影响高档车辆行驶安全'
      mitigation = '降低车速，避免高架桥梁'
      recommendations.push('加强货物捆绑', '避免侧风路段')
    }

    if (type.includes('雾') || type.includes('霾')) {
      scoreMultiplier = severity >= 2 ? 0.5 : 0.8
      description = '低能见度影响驾驶安全'
      mitigation = '开启雾灯，保持安全距离'
      recommendations.push('降低车速', '使用GPS导航')
    }

    return {
      scoreMultiplier,
      description,
      mitigation,
      recommendations
    }
  }

  // 获取严重程度描述
  private getSeverityText(severity: number): string {
    switch (severity) {
      case 1: return '轻微'
      case 2: return '一般'
      case 3: return '严重'
      case 4: return '特别严重'
      default: return '未知'
    }
  }

  // 计算两点距离
  private calculateDistance(point1: LatLng, point2: LatLng): number {
    const R = 6371 // 地球半径
    const dLat = (point2.lat - point1.lat) * Math.PI / 180
    const dLon = (point2.lng - point1.lng) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }
}

// 导出单例实例
export const disasterService = new DisasterService()

// 默认导出服务类
export default DisasterService