import type { LatLng } from '@/types/recommend'

// 天气数据类型定义
export interface WeatherData {
  location: {
    name: string
    lat: number
    lon: number
  }
  current: {
    temp: number
    feelsLike: number
    humidity: number
    pressure: number
    visibility: number
    windSpeed: number
    windDir: number
    weather: string
    icon: string
    updateTime: string
  }
  forecast: Array<{
    date: string
    tempMax: number
    tempMin: number
    weather: string
    icon: string
    windSpeed: number
    windDir: number
    humidity: number
    pressure: number
    precipitation: number
  }>
}

// 灾害预警数据
export interface DisasterData {
  id: string
  title: string
  type: string
  level: string
  status: string
  text: string
  startTime: string
  endTime?: string
  areas: string[]
}

// 省份天气数据
export interface ProvinceWeatherData {
  [province: string]: {
    temp: number
    weather: string
    color: string
  }
}

class WeatherService {
  private baseUrl = 'https://n84nmt9v5f.re.qweatherapi.com/v7'
  private apiKey: string = ''

  constructor() {
    // 获取和风天气API密钥
    this.apiKey = import.meta.env.VITE_QWEATHER_KEY || ''
  }

  // 设置API密钥
  setApiKey(key: string) {
    this.apiKey = key
  }

  // 获取当前天气和预报
  async getWeather(location: LatLng | string): Promise<WeatherData> {
    if (!this.apiKey) {
      throw new Error('请设置VITE_QWEATHER_KEY环境变量')
    }

    try {
      let locationStr: string
      if (typeof location === 'string') {
        locationStr = location
      } else {
        locationStr = `${location.lng},${location.lat}`
      }

      // 并行获取当前天气和预报
      const [currentRes, forecastRes] = await Promise.all([
        fetch(`${this.baseUrl}/weather/now?location=${locationStr}&key=${this.apiKey}`),
        fetch(`${this.baseUrl}/weather/7d?location=${locationStr}&key=${this.apiKey}`)
      ])

      if (!currentRes.ok || !forecastRes.ok) {
        throw new Error('天气数据获取失败')
      }

      const currentData = await currentRes.json()
      const forecastData = await forecastRes.json()

      if (currentData.code !== '200' || forecastData.code !== '200') {
        throw new Error(`天气API错误: ${currentData.code} ${forecastData.code}`)
      }

      return this.formatWeatherData(currentData, forecastData)
    } catch (error) {
      console.error('获取天气数据失败:', error)
      throw error
    }
  }

  // 获取路径沿途天气
  async getRouteWeather(waypoints: LatLng[]): Promise<WeatherData[]> {
    const weatherPromises = waypoints.map(point => this.getWeather(point))
    return Promise.all(weatherPromises)
  }

  // 获取灾害预警
  async getDisasterWarning(location: LatLng | string): Promise<DisasterData[]> {
    if (!this.apiKey) {
      throw new Error('请设置VITE_QWEATHER_KEY环境变量')
    }

    try {
      let locationStr: string
      if (typeof location === 'string') {
        locationStr = location
      } else {
        locationStr = `${location.lng},${location.lat}`
      }

      const response = await fetch(
        `${this.baseUrl}/warning/now?location=${locationStr}&key=${this.apiKey}`
      )

      if (!response.ok) {
        throw new Error('灾害预警数据获取失败')
      }

      const data = await response.json()
      if (data.code !== '200') {
        throw new Error(`预警API错误: ${data.code}`)
      }

      // 处理和规范化预警数据
      const warnings = (data.warning || []).map((w: any) => ({
        id: w.id || Math.random().toString(36).substr(2, 9),
        title: w.title || '预警信息',
        type: w.type || '未知类型',
        level: w.level || 'blue',
        status: w.status || 'active',
        text: w.text || '',
        startTime: w.startTime || new Date().toISOString(),
        endTime: w.endTime,
        areas: w.areas && Array.isArray(w.areas) ? w.areas : 
               w.area && Array.isArray(w.area) ? w.area :
               w.locationName ? [w.locationName] : ['未指定区域']
      }))

      return warnings
    } catch (error) {
      console.error('获取灾害预警失败:', error)
      return []
    }
  }

  // 获取全国省份天气概况
  async getProvinceWeather(): Promise<ProvinceWeatherData> {
    // 主要省份城市代码映射
    const provinceCities = {
      '北京': '101010100',
      '天津': '101030100', 
      '河北': '101090101',
      '山西': '101100101',
      '内蒙古': '101080101',
      '辽宁': '101070101',
      '吉林': '101060101',
      '黑龙江': '101050101',
      '上海': '101020100',
      '江苏': '101190101',
      '浙江': '101210101',
      '安徽': '101220101',
      '福建': '101230101',
      '江西': '101240101',
      '山东': '101120101',
      '河南': '101180101',
      '湖北': '101200101',
      '湖南': '101250101',
      '广东': '101280101',
      '广西': '101300101',
      '海南': '101310101',
      '重庆': '101040100',
      '四川': '101270101',
      '贵州': '101260101',
      '云南': '101290101',
      '西藏': '101140101',
      '陕西': '101110101',
      '甘肃': '101160101',
      '青海': '101150101',
      '宁夏': '101170101',
      '新疆': '101130101'
    }

    const result: ProvinceWeatherData = {}

    try {
      // 批量获取各省天气
      const weatherPromises = Object.entries(provinceCities).map(
        async ([province, cityCode]) => {
          try {
            const response = await fetch(
              `${this.baseUrl}/weather/now?location=${cityCode}&key=${this.apiKey}`
            )
            const data = await response.json()
            if (data.code === '200' && data.now) {
              result[province] = {
                temp: parseInt(data.now.temp),
                weather: data.now.text,
                color: this.getTempColor(parseInt(data.now.temp))
              }
            }
          } catch (error) {
            console.warn(`获取${province}天气失败:`, error)
          }
        }
      )

      await Promise.allSettled(weatherPromises)
      return result
    } catch (error) {
      console.error('获取省份天气失败:', error)
      return {}
    }
  }

  // 根据温度获取颜色
  private getTempColor(temp: number): string {
    if (temp >= 35) return '#8B0000'      // 深红色 - 高温
    if (temp >= 30) return '#FF4500'      // 橙红色
    if (temp >= 25) return '#FF8C00'      // 深橙色
    if (temp >= 20) return '#FFD700'      // 金黄色
    if (temp >= 15) return '#ADFF2F'      // 绿黄色
    if (temp >= 10) return '#00FF7F'      // 春绿色
    if (temp >= 5) return '#00BFFF'       // 深天蓝色
    if (temp >= 0) return '#4169E1'       // 皇室蓝
    if (temp >= -10) return '#8A2BE2'     // 蓝紫色
    return '#4B0082'                      // 靛青色 - 极低温
  }

  // 格式化天气数据
  private formatWeatherData(currentData: any, forecastData: any): WeatherData {
    const current = currentData.now
    const location = currentData.location || forecastData.location

    return {
      location: {
        name: location?.name || '未知',
        lat: parseFloat(location?.lat || '0'),
        lon: parseFloat(location?.lon || '0')
      },
      current: {
        temp: parseInt(current.temp),
        feelsLike: parseInt(current.feelsLike),
        humidity: parseInt(current.humidity),
        pressure: parseInt(current.pressure),
        visibility: parseInt(current.vis),
        windSpeed: parseInt(current.windSpeed),
        windDir: parseInt(current.wind360),
        weather: current.text,
        icon: current.icon,
        updateTime: current.obsTime
      },
      forecast: forecastData.daily?.map((day: any) => ({
        date: day.fxDate,
        tempMax: parseInt(day.tempMax),
        tempMin: parseInt(day.tempMin),
        weather: day.textDay,
        icon: day.iconDay,
        windSpeed: parseInt(day.windSpeedDay),
        windDir: parseInt(day.wind360Day),
        humidity: parseInt(day.humidity),
        pressure: parseInt(day.pressure),
        precipitation: parseFloat(day.precip)
      })) || []
    }
  }

  // 判断天气对物流的影响等级
  getWeatherImpact(weather: WeatherData): {
    level: 'low' | 'medium' | 'high' | 'extreme'
    factors: string[]
    score: number
  } {
    const factors: string[] = []
    let score = 1.0 // 基准分数

    // 温度影响
    if (weather.current.temp > 35 || weather.current.temp < -10) {
      factors.push('极端温度')
      score *= 0.7
    } else if (weather.current.temp > 30 || weather.current.temp < 0) {
      factors.push('不适宜温度')
      score *= 0.85
    }

    // 风速影响
    if (weather.current.windSpeed > 20) {
      factors.push('强风')
      score *= 0.8
    } else if (weather.current.windSpeed > 15) {
      factors.push('中等风力')
      score *= 0.9
    }

    // 降水影响
    const hasRain = weather.current.weather.includes('雨') || 
                    weather.current.weather.includes('雪') ||
                    weather.current.weather.includes('雾')
    if (hasRain) {
      factors.push('降水天气')
      score *= 0.8
    }

    // 能见度影响
    if (weather.current.visibility < 5) {
      factors.push('低能见度')
      score *= 0.7
    } else if (weather.current.visibility < 10) {
      factors.push('能见度一般')
      score *= 0.9
    }

    // 确定影响等级
    let level: 'low' | 'medium' | 'high' | 'extreme'
    if (score >= 0.9) level = 'low'
    else if (score >= 0.8) level = 'medium'
    else if (score >= 0.7) level = 'high'
    else level = 'extreme'

    return { level, factors, score }
  }
}

// 导出单例实例
export const weatherService = new WeatherService()

// 默认导出服务类
export default WeatherService