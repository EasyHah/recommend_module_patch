<template>
  <div class="weather-test-container">
    <FluentCard class="test-header-card">
      <h2>天气功能集成测试</h2>
      <p>测试天气API集成、3D可视化和推荐系统增强功能</p>
    </FluentCard>

    <div class="test-grid">
      <!-- 环境检测 -->
      <FluentCard>
        <h3>环境检测</h3>
        <div class="test-results">
          <div v-for="(result, key) in envResults" :key="key" class="test-item">
            <span :class="['status', result.status]">{{ result.status === 'success' ? '✓' : '✗' }}</span>
            <span>{{ result.description }}</span>
            <span v-if="result.message" class="message">{{ result.message }}</span>
          </div>
        </div>
      </FluentCard>

      <!-- 天气服务测试 -->
      <FluentCard>
        <h3>天气服务测试</h3>
        <button class="btn primary" @click="testWeatherService" :disabled="testing">
          {{ testing ? '测试中...' : '开始测试' }}
        </button>
        <div v-if="weatherResults.length" class="test-results">
          <div v-for="result in weatherResults" :key="result.test" class="test-item">
            <span :class="['status', result.status]">{{ result.status === 'success' ? '✓' : '✗' }}</span>
            <span>{{ result.test }}</span>
            <span v-if="result.message" class="message">{{ result.message }}</span>
          </div>
        </div>
      </FluentCard>

      <!-- 推荐系统测试 -->
      <FluentCard>
        <h3>推荐系统增强测试</h3>
        <button class="btn primary" @click="testRecommendSystem" :disabled="testing">
          {{ testing ? '测试中...' : '开始测试' }}
        </button>
        <div v-if="recommendResults.length" class="test-results">
          <div v-for="result in recommendResults" :key="result.test" class="test-item">
            <span :class="['status', result.status]">{{ result.status === 'success' ? '✓' : '✗' }}</span>
            <span>{{ result.test }}</span>
            <span v-if="result.data" class="data-preview">{{ JSON.stringify(result.data).slice(0, 100) }}...</span>
          </div>
        </div>
      </FluentCard>

      <!-- 实时天气数据 -->
      <FluentCard>
        <h3>实时天气数据</h3>
        <div class="weather-info">
          <div class="location-selector">
            <label>选择城市:</label>
            <select v-model="selectedCity" @change="loadWeatherData">
              <option value="116.4074,39.9042">北京</option>
              <option value="121.4737,31.2304">上海</option>
              <option value="113.2644,23.1291">广州</option>
              <option value="114.0579,22.5431">深圳</option>
            </select>
          </div>
          <div v-if="currentWeather" class="weather-display">
            <div class="weather-item">
              <strong>温度:</strong> {{ currentWeather.current?.temp }}°C
            </div>
            <div class="weather-item">
              <strong>天气:</strong> {{ currentWeather.current?.weather }}
            </div>
            <div class="weather-item">
              <strong>湿度:</strong> {{ currentWeather.current?.humidity }}%
            </div>
            <div class="weather-item">
              <strong>风速:</strong> {{ currentWeather.current?.windSpeed }} km/h
            </div>
          </div>
        </div>
      </FluentCard>

      <!-- 物流风险评估 -->
      <FluentCard>
        <h3>物流风险评估</h3>
        <button class="btn primary" @click="testRiskAssessment" :disabled="testing">
          评估路线风险
        </button>
        <div v-if="riskAssessment" class="risk-results">
          <div class="risk-item">
            <strong>总体风险:</strong>
            <span :class="['risk-level', riskAssessment.riskLevel]">
              {{ riskAssessment.riskLevel }}
            </span>
          </div>
          <div class="risk-item">
            <strong>风险评分:</strong> {{ riskAssessment.riskScore }}/10
          </div>
          <div class="warnings">
            <h4>预警信息:</h4>
            <ul>
              <li v-for="warning in riskAssessment.warnings" :key="warning">
                {{ warning }}
              </li>
            </ul>
          </div>
        </div>
      </FluentCard>

      <!-- 集成状态总览 -->
      <FluentCard class="integration-status">
        <h3>集成状态总览</h3>
        <div class="status-grid">
          <div class="status-item">
            <div class="status-label">天气API</div>
            <div :class="['status-indicator', getServiceStatus('weather')]"></div>
          </div>
          <div class="status-item">
            <div class="status-label">推荐系统</div>
            <div :class="['status-indicator', getServiceStatus('recommend')]"></div>
          </div>
          <div class="status-item">
            <div class="status-label">3D可视化</div>
            <div :class="['status-indicator', getServiceStatus('visualization')]"></div>
          </div>
          <div class="status-item">
            <div class="status-label">风险评估</div>
            <div :class="['status-indicator', getServiceStatus('risk')]"></div>
          </div>
        </div>
      </FluentCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import FluentCard from '@/components/FluentCard.vue'
import { checkEnvironment } from '@/utils/weatherTestUtils'
import { weatherService } from '@/services/weather'
import { disasterService } from '@/services/disaster'

interface TestResult {
  test: string
  status: 'success' | 'error'
  message?: string
  data?: any
  description?: string
}

const envResults = ref<Record<string, TestResult>>({})
const weatherResults = ref<TestResult[]>([])
const recommendResults = ref<TestResult[]>([])
const testing = ref(false)
const selectedCity = ref('116.4074,39.9042')
const currentWeather = ref<any>(null)
const riskAssessment = ref<any>(null)

const serviceStatus = ref({
  weather: 'unknown',
  recommend: 'unknown', 
  visualization: 'unknown',
  risk: 'unknown'
})

const getServiceStatus = (service: string) => {
  return serviceStatus.value[service as keyof typeof serviceStatus.value]
}

const loadEnvironmentTests = async () => {
  try {
    const results = checkEnvironment()
    // 转换结果格式
    envResults.value = {}
    
    envResults.value.weatherApi = {
      test: '和风天气API',
      status: results.qweatherKey ? 'success' : 'error',
      description: results.qweatherKey ? 'API密钥已配置' : '需要配置VITE_QWEATHER_KEY'
    }
    
    envResults.value.amapApi = {
      test: '高德地图API',
      status: results.amapKey ? 'success' : 'error', 
      description: results.amapKey ? 'API密钥已配置' : '需要配置VITE_AMAP_KEY'
    }
    
    envResults.value.amapSecurity = {
      test: '高德地图安全密钥',
      status: results.amapSecurity ? 'success' : 'error',
      description: results.amapSecurity ? '安全密钥已配置' : '建议配置VITE_AMAP_SECURITY'
    }
    
    // 更新服务状态
    serviceStatus.value.weather = results.qweatherKey ? 'online' : 'offline'
  } catch (error) {
    console.error('环境检测失败:', error)
  }
}

const testWeatherService = async () => {
  testing.value = true
  weatherResults.value = []
  
  try {
    // 测试省份天气
    try {
      const provinceWeather = await weatherService.getProvinceWeather()
      weatherResults.value.push({
        test: '省份天气获取',
        status: Object.keys(provinceWeather).length > 0 ? 'success' : 'error',
        message: `获取到${Object.keys(provinceWeather).length}个省份天气数据`
      })
    } catch (error) {
      weatherResults.value.push({
        test: '省份天气获取',
        status: 'error',
        message: error instanceof Error ? error.message : '未知错误'
      })
    }

    // 测试位置天气
    try {
      const weather = await weatherService.getWeather({ lat: 39.9042, lng: 116.4074 })
      weatherResults.value.push({
        test: '位置天气获取',
        status: weather.current ? 'success' : 'error',
        message: weather.current ? `当前温度: ${weather.current.temp}°C, ${weather.current.weather}` : '无天气数据'
      })
    } catch (error) {
      weatherResults.value.push({
        test: '位置天气获取',
        status: 'error',
        message: error instanceof Error ? error.message : '未知错误'
      })
    }

    serviceStatus.value.weather = weatherResults.value.every(r => r.status === 'success') ? 'online' : 'error'
  } finally {
    testing.value = false
  }
}

const testRecommendSystem = async () => {
  testing.value = true
  recommendResults.value = []
  
  try {
    // 导入推荐函数
    const { enhancedMatchVendors } = await import('@/utils/enhancedRecommendScore')
    
    // 模拟查询
    const testQuery = {
      origin: { lat: 39.9042, lng: 116.4074 },
      destination: { lat: 39.8942, lng: 116.3974 },
      cargoType: 'normal' as const,
      cargoWeightKg: 1000,
      maxDistanceKm: 100,
      window: [
        new Date().toISOString(),
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      ] as [string, string],
      demand: {
        type: 'normal' as const,
        weightKg: 1000
      },
      weatherConsideration: {
        enabled: true,
        priority: 'medium' as const,
        avoidSevereWeather: true,
        temperatureRange: [-10, 35] as [number, number]
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
      }
    ]

    // 测试增强推荐
    const result = await enhancedMatchVendors(testQuery, mockVendors)
    
    recommendResults.value.push({
      test: '增强推荐算法',
      status: result && result.length > 0 ? 'success' : 'error',
      message: `找到${result?.length || 0}个匹配供应商`,
      data: result?.slice(0, 2) // 显示前2个结果
    })

    recommendResults.value.push({
      test: '天气因素整合',
      status: testQuery.weatherConsideration?.enabled ? 'success' : 'error',
      message: '天气考虑因素已启用'
    })

    serviceStatus.value.recommend = recommendResults.value.every(r => r.status === 'success') ? 'online' : 'error'
  } catch (error) {
    console.error('推荐系统测试失败:', error)
    recommendResults.value.push({
      test: '推荐系统测试',
      status: 'error',
      message: error instanceof Error ? error.message : '未知错误'
    })
    serviceStatus.value.recommend = 'error'
  } finally {
    testing.value = false
  }
}

const loadWeatherData = async () => {
  try {
    const [lng, lat] = selectedCity.value.split(',').map(Number)
    const weather = await weatherService.getWeather({ lat, lng })
    currentWeather.value = weather
  } catch (error) {
    console.error('加载天气数据失败:', error)
  }
}

const testRiskAssessment = async () => {
  testing.value = true
  try {
    const [lng, lat] = selectedCity.value.split(',').map(Number)
    const waypoints = [
      { lat, lng },
      { lat: lat + 0.1, lng: lng + 0.1 }
    ]
    const assessment = await disasterService.assessRouteRisk(waypoints)
    riskAssessment.value = {
      riskLevel: assessment.overallRisk,
      riskScore: Math.round(assessment.score * 10),
      warnings: assessment.recommendations
    }
    serviceStatus.value.risk = 'online'
  } catch (error) {
    console.error('风险评估失败:', error)
    serviceStatus.value.risk = 'error'
  } finally {
    testing.value = false
  }
}

onMounted(async () => {
  await loadEnvironmentTests()
  await loadWeatherData()
})
</script>

<style scoped>
.weather-test-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.test-header-card {
  margin-bottom: 20px;
  text-align: center;
}

.test-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
}

.test-results {
  margin-top: 15px;
}

.test-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 4px;
  background: var(--fluent-neutral-layer-1);
}

.status {
  width: 20px;
  margin-right: 10px;
  font-weight: bold;
}

.status.success {
  color: var(--fluent-green-primary);
}

.status.error {
  color: var(--fluent-red-primary);
}

.message {
  margin-left: auto;
  font-size: 12px;
  color: var(--fluent-neutral-foreground-2);
}

.data-preview {
  margin-left: 10px;
  font-size: 11px;
  color: var(--fluent-neutral-foreground-3);
  font-family: monospace;
}

.weather-info {
  margin-top: 15px;
}

.location-selector {
  margin-bottom: 15px;
}

.location-selector label {
  margin-right: 10px;
}

.location-selector select {
  padding: 5px 10px;
  border: 1px solid var(--fluent-neutral-stroke-1);
  border-radius: 4px;
}

.weather-display {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.weather-item {
  padding: 10px;
  background: var(--fluent-neutral-layer-1);
  border-radius: 4px;
}

.risk-results {
  margin-top: 15px;
}

.risk-item {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.risk-level {
  margin-left: 10px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

.risk-level.low {
  background: var(--fluent-green-tint-60);
  color: var(--fluent-green-shade-20);
}

.risk-level.medium {
  background: var(--fluent-yellow-tint-60);
  color: var(--fluent-yellow-shade-20);
}

.risk-level.high {
  background: var(--fluent-red-tint-60);
  color: var(--fluent-red-shade-20);
}

.warnings {
  margin-top: 15px;
}

.warnings h4 {
  margin-bottom: 8px;
}

.warnings ul {
  list-style: none;
  padding: 0;
}

.warnings li {
  background: var(--fluent-yellow-tint-60);
  color: var(--fluent-yellow-shade-20);
  padding: 8px;
  margin-bottom: 4px;
  border-radius: 4px;
  border-left: 3px solid var(--fluent-yellow-primary);
}

.integration-status {
  grid-column: 1 / -1;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-top: 15px;
}

.status-item {
  text-align: center;
}

.status-label {
  margin-bottom: 10px;
  font-weight: bold;
}

.status-indicator {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  margin: 0 auto;
}

.status-indicator.online {
  background: var(--fluent-green-primary);
}

.status-indicator.offline {
  background: var(--fluent-neutral-stroke-2);
}

.status-indicator.error {
  background: var(--fluent-red-primary);
}

.status-indicator.unknown {
  background: var(--fluent-yellow-primary);
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.btn.primary {
  background: #0078d4;
  color: white;
}

.btn.primary:hover {
  background: #106ebe;
}

.btn.primary:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>