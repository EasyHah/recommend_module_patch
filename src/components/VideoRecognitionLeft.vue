<template>
  <aside class='side'>
    <!-- 识别统计卡片 -->
    <FluentCard title='实时识别统计' strong>
      <div class='stats'>
        <div class='stat'>
          <div class='dot total'>{{ stats.totalDetections }}</div>
          <div class='lab'>总检测数</div>
        </div>
        <div class='stat'>
          <div class='dot people'>{{ stats.peopleCount }}</div>
          <div class='lab'>人员</div>
        </div>
        <div class='stat'>
          <div class='dot vehicle'>{{ stats.vehicleCount }}</div>
          <div class='lab'>车辆</div>
        </div>
        <div class='stat'>
          <div class='dot object'>{{ stats.objectCount }}</div>
          <div class='lab'>物体</div>
        </div>
        <div class='stat'>
          <div class='dot enter'>{{ stats.entered ?? 0 }}</div>
          <div class='lab'>进入</div>
        </div>
        <div class='stat'>
          <div class='dot exit'>{{ stats.exited ?? 0 }}</div>
          <div class='lab'>离开</div>
        </div>
      </div>
      <div class='confidence-display'>
        <div class='confidence-label'>平均置信度</div>
        <div class='confidence-value'>{{ stats.averageConfidence }}%</div>
      </div>
    </FluentCard>

    <!-- 检测类型分布饼图（仅显示人员） -->
    <FluentCard title='检测类型分布（人员）' strong>
      <div ref="pieChartRef" class='chart-container'></div>
    </FluentCard>

    <!-- 检测历史列表 -->
    <FluentCard title='检测历史' strong :scrollable='true'>
      <div class='detection-list'>
        <div 
          v-for='detection in recentDetections' 
          :key='detection.id'
          class='detection-item'
        >
          <div class='detection-time'>{{ formatTime(detection.timestamp) }}</div>
          <div class='detection-info'>
            <span class='detection-type' :class='detection.label'>{{ detection.label }}</span>
            <span class='detection-confidence'>{{ detection.confidence }}%</span>
          </div>
        </div>
      </div>
    </FluentCard>
  </aside>
</template>

<script setup lang='ts'>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import FluentCard from '@/components/FluentCard.vue'
import * as echarts from 'echarts'

interface Detection {
  id: number
  label: string
  confidence: number
  x: number
  y: number
  width: number
  height: number
  timestamp?: number
}

interface Stats {
  totalDetections: number
  peopleCount: number
  vehicleCount: number
  objectCount: number
  averageConfidence: number
  entered?: number
  exited?: number
}

const props = defineProps<{
  detections: Detection[]
  stats: Stats
}>()

const pieChartRef = ref<HTMLElement>()
let pieChart: echarts.ECharts | null = null
let pieInitTime = 0
let pieUpdateTimer: number | null = null
const PIE_INIT_BLOCK_MS = 800
const PIE_UPDATE_THROTTLE_MS = 300

// 最近检测记录（保留最近20条）
const recentDetections = ref<(Detection & { timestamp: number })[]>([])

// 计算检测类型分布数据（仅统计“人员”）
const typeDistribution = computed(() => {
  const people = props.detections.reduce((acc, d) => acc + (d.label === '人员' ? 1 : 0), 0)
  return people > 0
    ? [{ name: '人员', value: people, itemStyle: { color: '#4C8BF5' } }]
    : []
})

// 监听检测结果变化，更新历史记录
watch(() => props.detections, (newDetections) => {
  // 为新检测添加时间戳并加入历史记录
  const timestampedDetections = newDetections.map(detection => ({
    ...detection,
    timestamp: Date.now()
  }))
  
  // 更新历史记录，保留最近20条
  recentDetections.value = [
    ...timestampedDetections,
    ...recentDetections.value
  ].slice(0, 20)
  
  // 节流更新饼图，避免初始动画期间频繁刷新
  schedulePieUpdate()
}, { deep: true })

const initPieChart = () => {
  if (!pieChartRef.value) return
  
  pieChart = echarts.init(pieChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)'
    },
    animation: true,
    animationDuration: 600,
    animationDurationUpdate: 300,
    series: [
      {
        name: '检测类型',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '50%'],
        data: typeDistribution.value,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        },
        label: {
          show: false
        },
        labelLine: {
          show: false
        }
      }
    ]
  }
  
  pieChart.setOption(option)
  pieInitTime = Date.now()
}

const updatePieChart = () => {
  if (!pieChart) return
  
  pieChart.setOption({
    series: [
      {
        data: typeDistribution.value
      }
    ]
  }, false, true)
}

function schedulePieUpdate() {
  if (!pieChart) return
  const elapsed = Date.now() - pieInitTime
  const delay = Math.max(PIE_UPDATE_THROTTLE_MS, Math.max(0, PIE_INIT_BLOCK_MS - elapsed))
  if (pieUpdateTimer) {
    clearTimeout(pieUpdateTimer)
    pieUpdateTimer = null
  }
  pieUpdateTimer = window.setTimeout(() => {
    updatePieChart()
  }, delay)
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  })
}

onMounted(() => {
  initPieChart()
})

onUnmounted(() => {
  if (pieChart) {
    pieChart.dispose()
  }
})
</script>

<style scoped>
.side {
  height: 100%;
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 12px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  align-content: start;
  margin-bottom: 16px;
}

.stat {
  text-align: center;
}

.dot {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  margin: 0 auto 6px;
  font-weight: 700;
  font-size: 14px;
}

.dot.total {
  background: #4C8BF5;
}

.dot.people {
  background: #00BFA5;
}

.dot.vehicle {
  background: #E91E63;
}

.dot.object {
  background: #FFC107;
}

.dot.enter {
  background: #8BC34A;
}

.dot.exit {
  background: #9E9E9E;
}

.lab {
  font-size: 12px;
  opacity: .9;
}

.confidence-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  margin-top: 8px;
}

.confidence-label {
  font-size: 14px;
  opacity: 0.8;
}

.confidence-value {
  font-size: 18px;
  font-weight: bold;
  color: #4C8BF5;
}

.chart-container {
  height: 160px;
  width: 100%;
}

.detection-list {
  height: 100%;
  overflow-y: auto;
}

.detection-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
}

.detection-item:last-child {
  border-bottom: none;
}

.detection-time {
  font-size: 12px;
  opacity: 0.7;
  min-width: 80px;
}

.detection-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detection-type {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.detection-type.人员 {
  background: rgba(0, 191, 165, 0.2);
  color: #00BFA5;
}

.detection-type.车辆 {
  background: rgba(233, 30, 99, 0.2);
  color: #E91E63;
}

.detection-type.设备 {
  background: rgba(255, 195, 7, 0.2);
  color: #FFC107;
}

.detection-type.异常物体 {
  background: rgba(255, 87, 34, 0.2);
  color: #FF5722;
}

.detection-confidence {
  font-size: 12px;
  font-weight: bold;
  color: #4C8BF5;
}
</style>