<template>
  <div v-if="visible" class="weather-tooltip" :style="tooltipStyle">
    <div class="weather-tooltip-header">
      <h4>{{ data.location || '天气信息' }}</h4>
      <button class="close-btn" @click="close">×</button>
    </div>
    
    <div class="weather-tooltip-content">
      <div class="weather-main">
        <div class="weather-icon">
          <img :src="weatherIcon" :alt="data.weather || '未知'" />
        </div>
        <div class="weather-info">
          <div class="temperature">{{ data.temperature }}°C</div>
          <div class="weather-desc">{{ data.weather }}</div>
        </div>
      </div>
      
      <div class="weather-details">
        <div class="detail-item">
          <span class="label">体感温度</span>
          <span class="value">{{ data.feelsLike }}°C</span>
        </div>
        <div class="detail-item">
          <span class="label">湿度</span>
          <span class="value">{{ data.humidity }}%</span>
        </div>
        <div class="detail-item">
          <span class="label">风速</span>
          <span class="value">{{ data.windSpeed }} km/h</span>
        </div>
        <div class="detail-item">
          <span class="label">能见度</span>
          <span class="value">{{ data.visibility }} km</span>
        </div>
      </div>
      
      <div v-if="data.riskLevel" class="risk-info" :class="`risk-${data.riskLevel}`">
        <div class="risk-label">物流风险</div>
        <div class="risk-level">{{ getRiskText(data.riskLevel) }}</div>
        <div v-if="data.riskFactors?.length" class="risk-factors">
          <div v-for="factor in data.riskFactors" :key="factor" class="risk-factor">
            • {{ factor }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface WeatherTooltipData {
  location?: string
  temperature?: number
  feelsLike?: number
  humidity?: number
  windSpeed?: number
  visibility?: number
  weather?: string
  icon?: string
  riskLevel?: 'low' | 'medium' | 'high' | 'extreme'
  riskFactors?: string[]
}

interface Props {
  visible: boolean
  data: WeatherTooltipData
  x: number
  y: number
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  data: () => ({}),
  x: 0,
  y: 0
})

const emit = defineEmits<{
  close: []
}>()

const tooltipStyle = computed(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
  transform: `translate(-50%, -100%)`,
  zIndex: 1000000  // 确保在全屏地图上方显示
}))

const weatherIcon = computed(() => {
  if (props.data.icon) {
    return `https://a.hecdn.net/img/common/icon/202106d/${props.data.icon}.png`
  }
  return '/src/assets/weather-default.svg'
})

function getRiskText(risk: string) {
  const riskMap = {
    low: '低风险',
    medium: '中等风险', 
    high: '高风险',
    extreme: '极高风险'
  }
  return riskMap[risk as keyof typeof riskMap] || '未知'
}

function close() {
  emit('close')
}
</script>

<style scoped>
.weather-tooltip {
  position: fixed;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(0, 0, 0, 0.1);
  min-width: 280px;
  max-width: 320px;
  font-size: 14px;
  backdrop-filter: blur(8px);
  animation: fadeInUp 0.2s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translate(-50%, -90%);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -100%);
  }
}

.weather-tooltip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: white;
  border-radius: 12px 12px 0 0;
}

.weather-tooltip-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.weather-tooltip-content {
  padding: 16px;
}

.weather-main {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.weather-icon img {
  width: 48px;
  height: 48px;
}

.weather-info .temperature {
  font-size: 24px;
  font-weight: bold;
  color: #1f2937;
  line-height: 1;
}

.weather-info .weather-desc {
  font-size: 13px;
  color: #6b7280;
  margin-top: 2px;
}

.weather-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  margin-bottom: 16px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-item .label {
  font-size: 12px;
  color: #6b7280;
}

.detail-item .value {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.risk-info {
  padding: 12px;
  border-radius: 8px;
  border-left: 4px solid;
}

.risk-info.risk-low {
  background: #f0f9ff;
  border-left-color: #0ea5e9;
  color: #0c4a6e;
}

.risk-info.risk-medium {
  background: #fffbeb;
  border-left-color: #f59e0b;
  color: #92400e;
}

.risk-info.risk-high {
  background: #fef2f2;
  border-left-color: #ef4444;
  color: #991b1b;
}

.risk-info.risk-extreme {
  background: #fdf2f8;
  border-left-color: #ec4899;
  color: #831843;
}

.risk-label {
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 4px;
}

.risk-level {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.risk-factors {
  font-size: 12px;
}

.risk-factor {
  margin-bottom: 2px;
  opacity: 0.8;
}
</style>