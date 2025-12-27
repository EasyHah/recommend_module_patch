<template>
  <aside class='side'>
    <!-- 置信度趋势图 -->
    <FluentCard title='置信度趋势' strong>
      <div ref="confidenceChartRef" class='chart-container'></div>
    </FluentCard>

    <!-- 检测区域热力分布 -->
    <FluentCard title='检测区域分布' strong>
      <div ref="heatmapChartRef" class='chart-container'></div>
    </FluentCard>

    <!-- 实时检测详情 -->
    <FluentCard title='当前检测详情' strong :scrollable='true'>
      <div class='detection-details'>
        <div 
          v-for='detection in detections' 
          :key='detection.id'
          class='detail-item'
        >
          <div class='detail-header'>
            <span class='detail-type' :class='detection.label'>{{ detection.label }}</span>
            <span class='detail-id'>#{{ detection.id }}</span>
          </div>
          <div class='detail-info'>
            <div class='info-row'>
              <span class='info-label'>置信度:</span>
              <span class='info-value confidence'>{{ detection.confidence }}%</span>
            </div>
            <div class='info-row'>
              <span class='info-label'>位置:</span>
              <span class='info-value'>
                ({{ Math.round(detection.x) }}, {{ Math.round(detection.y) }})
              </span>
            </div>
            <div class='info-row'>
              <span class='info-label'>尺寸:</span>
              <span class='info-value'>
                {{ Math.round(detection.width) }}×{{ Math.round(detection.height) }}
              </span>
            </div>
          </div>
          <div class='confidence-bar'>
            <div 
              class='confidence-fill' 
              :style="{ width: detection.confidence + '%' }"
              :class='getConfidenceLevel(detection.confidence)'
            ></div>
          </div>
        </div>
        
        <div v-if='detections.length === 0' class='no-detections'>
          <div class='no-detections-icon'>🔍</div>
          <div class='no-detections-text'>暂无检测目标</div>
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
  id: string
  label: string
  confidence: number
  x: number
  y: number
  width: number
  height: number
}

interface ConfidenceData {
  time: string
  confidence: number
}

const props = defineProps<{
  detections: Detection[]
  confidenceData: ConfidenceData[]
}>()

const confidenceChartRef = ref<HTMLElement>()
const heatmapChartRef = ref<HTMLElement>()
let confidenceChart: echarts.ECharts | null = null
let heatmapChart: echarts.ECharts | null = null

// 计算检测区域热力数据
const heatmapData = computed(() => {
  const data: [number, number, number][] = []
  
  props.detections.forEach(detection => {
    // 将检测框转换为热力点，权重基于置信度
    const centerX = detection.x + detection.width / 2
    const centerY = detection.y + detection.height / 2
    const weight = detection.confidence / 100
    
    data.push([Math.round(centerX), Math.round(centerY), weight])
  })
  
  return data
})

const initConfidenceChart = () => {
  if (!confidenceChartRef.value) return
  
  confidenceChart = echarts.init(confidenceChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        label: {
          backgroundColor: '#6a7985'
        }
      }
    },
    xAxis: {
      type: 'category',
      data: props.confidenceData.map(item => item.time),
      axisLabel: {
        color: '#fff',
        fontSize: 10
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.3)'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: {
        color: '#fff',
        fontSize: 10,
        formatter: '{value}%'
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.3)'
        }
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      }
    },
    series: [
      {
        name: '置信度',
        type: 'line',
        data: props.confidenceData.map(item => item.confidence),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: '#4C8BF5',
          width: 3
        },
        itemStyle: {
          color: '#4C8BF5'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(76, 139, 245, 0.4)' },
              { offset: 1, color: 'rgba(76, 139, 245, 0.1)' }
            ]
          }
        }
      }
    ],
    grid: {
      left: '10%',
      right: '10%',
      top: '15%',
      bottom: '15%'
    }
  }
  
  confidenceChart.setOption(option)
}

const initHeatmapChart = () => {
  if (!heatmapChartRef.value) return
  
  heatmapChart = echarts.init(heatmapChartRef.value)
  
  const option = {
    tooltip: {
      position: 'top',
      formatter: function (params: any) {
        return `位置: (${params.data[0]}, ${params.data[1]})<br/>权重: ${(params.data[2] * 100).toFixed(1)}%`
      }
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 100,
      show: false
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      show: false
    },
    visualMap: {
      min: 0,
      max: 1,
      show: false,
      inRange: {
        color: ['rgba(76, 139, 245, 0.1)', 'rgba(76, 139, 245, 0.8)']
      }
    },
    series: [
      {
        name: '检测热力',
        type: 'scatter',
        data: heatmapData.value,
        symbolSize: function (data: number[]) {
          return Math.max(data[2] * 30, 5)
        },
        itemStyle: {
          opacity: 0.8
        }
      }
    ],
    grid: {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0
    }
  }
  
  heatmapChart.setOption(option)
}

const updateCharts = () => {
  if (confidenceChart) {
    confidenceChart.setOption({
      xAxis: {
        data: props.confidenceData.map(item => item.time)
      },
      series: [
        {
          data: props.confidenceData.map(item => item.confidence)
        }
      ]
    })
  }
  
  if (heatmapChart) {
    heatmapChart.setOption({
      series: [
        {
          data: heatmapData.value
        }
      ]
    })
  }
}

const getConfidenceLevel = (confidence: number) => {
  if (confidence >= 90) return 'high'
  if (confidence >= 70) return 'medium'
  return 'low'
}

// 监听数据变化
watch(() => [props.detections, props.confidenceData], () => {
  updateCharts()
}, { deep: true })

onMounted(() => {
  setTimeout(() => {
    initConfidenceChart()
    initHeatmapChart()
  }, 100)
})

onUnmounted(() => {
  if (confidenceChart) {
    confidenceChart.dispose()
  }
  if (heatmapChart) {
    heatmapChart.dispose()
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

.chart-container {
  height: 160px;
  width: 100%;
}

.detection-details {
  height: 100%;
  overflow-y: auto;
}

.detail-item {
  padding: 12px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.detail-item:last-child {
  margin-bottom: 0;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.detail-type {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
}

.detail-type.人员 {
  background: rgba(0, 191, 165, 0.2);
  color: #00BFA5;
}

.detail-type.车辆 {
  background: rgba(233, 30, 99, 0.2);
  color: #E91E63;
}

.detail-type.设备 {
  background: rgba(255, 195, 7, 0.2);
  color: #FFC107;
}

.detail-type.异常物体 {
  background: rgba(255, 87, 34, 0.2);
  color: #FF5722;
}

.detail-id {
  font-size: 13px;
  opacity: 0.6;
  font-family: monospace;
}

.detail-info {
  margin-bottom: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-size: 13px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  opacity: 0.7;
}

.info-value {
  font-weight: 500;
}

.info-value.confidence {
  color: #4C8BF5;
  font-weight: bold;
}

.confidence-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.confidence-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.confidence-fill.high {
  background: linear-gradient(90deg, #00BFA5, #4CAF50);
}

.confidence-fill.medium {
  background: linear-gradient(90deg, #FFC107, #FF9800);
}

.confidence-fill.low {
  background: linear-gradient(90deg, #FF5722, #F44336);
}

.no-detections {
  text-align: center;
  padding: 40px 20px;
  opacity: 0.6;
}

.no-detections-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.no-detections-text {
  font-size: 14px;
}
</style>
