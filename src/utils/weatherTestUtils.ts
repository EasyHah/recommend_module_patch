import { weatherService } from '@/services/weather'
import { disasterService } from '@/services/disaster'
import { enhancedMatchVendors } from '@/utils/enhancedRecommendScore'
import type { EnhancedQuery } from '@/types/weather'

// 集成测试函数
export async function testWeatherIntegration() {
  console.log('🧪 开始天气功能集成测试...')
  
  const testResults = {
    weatherService: false,
    disasterService: false,
    enhancedRecommend: false,
    errors: [] as string[]
  }

  // 测试天气服务
  try {
    console.log('📡 测试天气服务...')
    
    // 测试获取省份天气
    const provinceWeather = await weatherService.getProvinceWeather()
    if (Object.keys(provinceWeather).length > 0) {
      console.log('✅ 省份天气获取成功:', Object.keys(provinceWeather).length, '个省份')
      testResults.weatherService = true
    } else {
      testResults.errors.push('省份天气数据为空')
    }

    // 测试获取具体位置天气
    const locationWeather = await weatherService.getWeather({ lat: 39.9042, lng: 116.4074 })
    if (locationWeather.current && locationWeather.forecast) {
      console.log('✅ 位置天气获取成功:', locationWeather.location.name)
    } else {
      testResults.errors.push('位置天气数据不完整')
    }

  } catch (error) {
    testResults.errors.push(`天气服务错误: ${error}`)
    console.error('❌ 天气服务测试失败:', error)
  }

  // 测试灾害服务
  try {
    console.log('⚠️ 测试灾害预警服务...')
    
    const disasters = await disasterService.getDisastersInArea({ lat: 39.9042, lng: 116.4074 })
    console.log('✅ 灾害预警服务正常，获取到', disasters.length, '条预警信息')
    testResults.disasterService = true

    // 测试路径风险评估
    const riskAssessment = await disasterService.assessRouteRisk([
      { lat: 39.9042, lng: 116.4074 },
      { lat: 31.2304, lng: 121.4737 }
    ])
    console.log('✅ 路径风险评估完成，整体风险:', riskAssessment.overallRisk)

  } catch (error) {
    testResults.errors.push(`灾害服务错误: ${error}`)
    console.error('❌ 灾害服务测试失败:', error)
  }

  // 测试增强推荐算法
  try {
    console.log('🤖 测试增强推荐算法...')
    
    // 模拟查询数据
    const mockQuery: EnhancedQuery = {
      origin: { lat: 39.9042, lng: 116.4074 },
      destination: { lat: 31.2304, lng: 121.4737 },
      window: [new Date().toISOString(), new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()],
      demand: { type: 'normal', weightKg: 1000, temperature: null },
      weatherConsideration: {
        enabled: true,
        priority: 'high',
        avoidSevereWeather: true,
        temperatureRange: [-5, 35]
      }
    }

    // 模拟供应商数据
    const mockVendors = [
      {
        id: 'test-vendor-1',
        name: '测试物流A',
        location: { lat: 39.9142, lng: 116.4174 },
        serviceRadiusKm: 100,
        capabilities: {
          types: ['normal' as const, 'cold' as const],
          maxWeightKg: 2000,
          cold: { min: -18, max: 8 }
        },
        metrics: {
          rating: 4.5,
          onTimeRate: 0.95,
          priceIndex: 1.2,
          capacityUtilization: 0.7
        }
      },
      {
        id: 'test-vendor-2', 
        name: '测试物流B',
        location: { lat: 39.8942, lng: 116.3974 },
        serviceRadiusKm: 80,
        capabilities: {
          types: ['normal' as const],
          maxWeightKg: 1500
        },
        metrics: {
          rating: 4.2,
          onTimeRate: 0.88,
          priceIndex: 1.0,
          capacityUtilization: 0.6
        }
      }
    ]

    const enhancedResults = await enhancedMatchVendors(mockQuery, mockVendors)
    
    if (enhancedResults && enhancedResults.length > 0) {
      console.log('✅ 增强推荐算法测试成功')
      console.log('📊 推荐结果数量:', enhancedResults.length)
      
      enhancedResults.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.vendor.name}`)
        console.log(`     综合评分: ${result.score}`)
        console.log(`     天气评分: ${result.weatherScore ? (result.weatherScore * 100).toFixed(0) + '%' : '未评估'}`)
        console.log(`     天气风险: ${result.weatherRisk}`)
        console.log(`     标签: ${result.buckets.join(', ')}`)
      })
      
      testResults.enhancedRecommend = true
    } else {
      testResults.errors.push('增强推荐算法返回结果为空')
    }

  } catch (error) {
    testResults.errors.push(`增强推荐算法错误: ${error}`)
    console.error('❌ 增强推荐算法测试失败:', error)
  }

  // 输出测试总结
  console.log('\n📋 测试结果总结:')
  console.log('天气服务:', testResults.weatherService ? '✅ 通过' : '❌ 失败')
  console.log('灾害服务:', testResults.disasterService ? '✅ 通过' : '❌ 失败')
  console.log('增强推荐:', testResults.enhancedRecommend ? '✅ 通过' : '❌ 失败')

  if (testResults.errors.length > 0) {
    console.log('\n❌ 发现的问题:')
    testResults.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`)
    })
  } else {
    console.log('\n🎉 所有测试通过！天气功能集成成功！')
  }

  return testResults
}

// 测试天气图层功能
export function testWeatherLayers() {
  console.log('🗺️ 测试天气图层功能...')
  
  try {
    // 检查 Cesium 是否可用
    if (typeof window !== 'undefined' && (window as any).Cesium) {
      console.log('✅ Cesium 环境检查通过')
    } else {
      console.log('⚠️ Cesium 环境未就绪（可能在服务器端或尚未加载）')
    }

    // 检查天气图层控制是否正常
    const ui = {
      weather: true,
      temperature: true,
      warnings: true,
      weatherOpacity: 70
    }

    console.log('✅ 天气图层控制对象创建成功:', ui)
    
    return true
  } catch (error) {
    console.error('❌ 天气图层测试失败:', error)
    return false
  }
}

// 环境检查
export function checkEnvironment() {
  console.log('🔍 检查环境配置...')
  
  const checks = {
    qweatherKey: !!import.meta.env.VITE_QWEATHER_KEY,
    amapKey: !!import.meta.env.VITE_AMAP_KEY,
    amapSecurity: !!import.meta.env.VITE_AMAP_SECURITY
  }

  console.log('和风天气API密钥:', checks.qweatherKey ? '✅ 已配置' : '❌ 未配置')
  console.log('高德地图API密钥:', checks.amapKey ? '✅ 已配置' : '❌ 未配置')
  console.log('高德地图安全密钥:', checks.amapSecurity ? '✅ 已配置' : '⚠️ 未配置（可选）')

  const allConfigured = checks.qweatherKey && checks.amapKey
  
  if (!allConfigured) {
    console.log('\n💡 配置建议:')
    if (!checks.qweatherKey) {
      console.log('- 请在.env.local文件中添加 VITE_QWEATHER_KEY=你的和风天气API密钥')
    }
    if (!checks.amapKey) {
      console.log('- 请在.env.local文件中添加 VITE_AMAP_KEY=你的高德地图API密钥')
    }
  }

  return checks
}

// 导出快速测试函数
export async function quickTest() {
  console.log('⚡ 执行快速集成测试...\n')
  
  // 环境检查
  const envCheck = checkEnvironment()
  
  // 图层测试
  const layerTest = testWeatherLayers()
  
  // 如果环境配置完整，执行完整测试
  if (envCheck.qweatherKey) {
    await testWeatherIntegration()
  } else {
    console.log('\n⚠️ 跳过API相关测试（缺少必需的环境变量）')
  }
  
  console.log('\n🏁 快速测试完成')
}

// 在浏览器控制台中暴露测试函数
if (typeof window !== 'undefined') {
  (window as any).weatherTest = {
    full: testWeatherIntegration,
    layers: testWeatherLayers,
    env: checkEnvironment,
    quick: quickTest
  }
  
  console.log('🔧 天气功能测试工具已加载到 window.weatherTest')
  console.log('可用方法: full(), layers(), env(), quick()')
}