<template>
  <div id="cesiumContainer" ref="cesiumContainer"></div>

  <!-- 图层面板（右上角） -->
  <div class="layer-panel">
    <div class="row title">图层</div>
    <label class="row"><input type="checkbox" v-model="ui.osgb"> OSGB 建筑</label>
    <label class="row"><input type="checkbox" v-model="ui.ck"> 分类 CK</label>
    <label class="row"><input type="checkbox" v-model="ui.geo"> 仓库面 (GeoJSON)</label>
    <label class="row"><input type="checkbox" v-model="ui.pano"> 全景红点</label>

    <div class="row sep"></div>

    <!-- 管线图层控制 -->
    <label class="row">
      <input type="checkbox" v-model="ui.pipelines"> 地下管线
    </label>
    <template v-if="ui.pipelines">
      <div class="row small">地形透明度：{{ ui.terrainAlpha }}</div>
      <input class="slider" type="range" min="0" max="1" step="0.05" v-model.number="ui.terrainAlpha" />
    </template>

    <div class="row sep"></div>

    <label class="row">
      <input type="checkbox" v-model="ui.cluster"> 红点聚合
    </label>
    <div class="row small">聚合强度：{{ ui.clusterRange }}</div>
    <input class="slider" type="range" min="20" max="90" step="1" v-model.number="ui.clusterRange" />

    <div class="row sep"></div>

    <!-- 天气图层控制 -->
    <label class="row">
      <input type="checkbox" v-model="ui.weather"> 天气图层
    </label>
    <template v-if="ui.weather">
      <label class="row small"><input type="checkbox" v-model="ui.temperature"> 温度分布</label>
      <label class="row small"><input type="checkbox" v-model="ui.precipitation"> 降水预报</label>
      <label class="row small"><input type="checkbox" v-model="ui.wind"> 风力风向</label>
      <label class="row small"><input type="checkbox" v-model="ui.warnings"> 预警信息</label>
      <div class="row small">透明度：{{ ui.weatherOpacity }}%</div>
      <input class="slider" type="range" min="10" max="100" step="10" v-model.number="ui.weatherOpacity" />
    </template>

    <div class="row sep"></div>

    <div class="row small">Tiles 细节（SSE）：{{ ui.sse }}</div>
    <input class="slider" type="range" min="8" max="24" step="1" v-model.number="ui.sse" />
  </div>

  <!-- 管线分析工具面板（左上角） -->
  <div class="analysis-panel" v-if="ui.pipelines">
    <div class="panel-header">
      <h3>地下管线分析</h3>
    </div>
    <div class="control-group">
      <button @click="startSectionAnalysis" :class="{ active: sectionMode }">
        {{ sectionMode ? '取消剖面' : '剖面分析' }}
      </button>
      <button @click="startExcavationAnalysis" :class="{ active: excavationMode }">
        {{ excavationMode ? '取消挖方' : '挖方分析' }}
      </button>
      <button @click="clearAllAnalysis">清除分析</button>
    </div>
    
    <!-- 管线信息面板 -->
    <div class="info-panel" v-if="pipelineInfo.show">
      <div class="panel-header">
        <h3>{{ pipelineInfo.title }}</h3>
        <button @click="pipelineInfo.show = false" class="close-btn">×</button>
      </div>
      <div class="info-content">
        <div v-if="pipelineInfo.pipelines.length === 0" class="no-data">
          未发现管线
        </div>
        <div v-else class="pipeline-list">
          <div v-for="(pipeline, index) in pipelineInfo.pipelines" :key="index" class="pipeline-item">
            <h4>管线 {{ index + 1 }}: {{ pipeline.name }}</h4>
            <div class="properties">
              <div v-for="(value, key) in pipeline.properties" :key="key" class="property">
                <span class="label">{{ key }}:</span>
                <span class="value">{{ value }}</span>
              </div>
              <div v-if="pipeline.distance !== undefined" class="property">
                <span class="label">距离:</span>
                <span class="value">{{ pipeline.distance.toFixed(1) }}m</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 管线图例面板（左下角） -->
  <div class="legend-panel" v-if="ui.pipelines">
    <div class="panel-header">
      <h3>管线图例</h3>
    </div>
    <div class="legend-content">
      <div v-for="([name, group]) in pipelineGroupEntries" :key="name" class="legend-item">
        <label>
          <input type="checkbox" 
                 :checked="group.visible !== false" 
                 @change="togglePipelineGroup(name, $event.target.checked)" />
          <span class="swatch" :style="{ backgroundColor: group.color }"></span>
          <span class="name">{{ name }}</span>
          <span class="count">({{ Array.isArray(group.entities) ? group.entities.length : 0 }})</span>
        </label>
      </div>
    </div>
  </div>

  <!-- 全景查看器 -->
  <PanoramaViewer 
    ref="panoramaViewer"
    :visible="panoramaModal.show" 
    @close="closePanorama" />
</template>

<script setup>
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { onMounted, onUnmounted, reactive, watch, ref, nextTick, computed } from 'vue'
import { weatherService } from '@/services/weather'
import { disasterService } from '@/services/disaster'
import PanoramaViewer from './PanoramaViewer.vue'
import { DataSourceManager } from '@/utils/DataSourceManager.js'

window.CESIUM_BASE_URL = '/'

const ui = reactive({
  osgb: true,
  ck: true,
  geo: true,
  pano: true,
  pipelines: true,     // 管线图层开关
  terrainAlpha: 0.35,  // 地形透明度
  cluster: true,
  clusterRange: 45, // 像素范围
  sse: 12,          // 屏幕误差（越大越省）
  // 天气图层控制
  weather: true,
  temperature: true,
  precipitation: false,
  wind: false,
  warnings: true,
  weatherOpacity: 70
})

// 管线分析状态
const sectionMode = ref(false)
const excavationMode = ref(false)
const pipelineInfo = reactive({
  show: false,
  title: '',
  pipelines: []
})
const pipelineGroups = ref(new Map())
const pipelineGroupEntries = computed(() => {
  const val = pipelineGroups.value
  if (val && typeof val.entries === 'function') {
    return Array.from(val.entries())
  }
  // 兼容对象
  return Object.entries(val || {})
})

// 暴露给模板的组切换函数（需在顶层定义，避免闭包导致模板取不到）
function togglePipelineGroup(name, visible) {
  const val = pipelineGroups.value
  if (!val) return
  const group = typeof val.get === 'function' ? val.get(name) : val[name]
  if (group) {
    group.visible = visible
    if (group.dataSource && typeof group.dataSource.show !== 'undefined') {
      group.dataSource.show = visible
    }
  }
}

// 全景查看器状态
const panoramaModal = reactive({
  show: false
})
const panoramaViewer = ref(null)

// 管线分析变量
let sectionPoints = []
let excavationPoints = []
let sectionLine = null
let excavationPolygon = null
let sectionPreviewLine = null
let excavationPreviewPolygon = null
let currentMousePosition = null
let sectionClippingPlanes = null
let excavationClippingPlanes = null
let highlightedPipelines = []
let sectionTempEntities = []
let excavationTempEntities = []
let dataSourceManager = null

onMounted(async () => {
  Cesium.Ion.defaultAccessToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyZTFmMDI1YS05MTRkLTRhMzYtYTNiZi0wYmM2YTdlYjU5ODMiLCJpZCI6MjIwNDYzLCJpYXQiOjE3MTc2NTIwMDF9.U1PZjG0GiZdXjIvHRyAGsHRMveUVQdINghXIfF6xJDE'

  // 1) Viewer：按需渲染 + 冻结时钟 + 降后处理
  const viewer = new Cesium.Viewer('cesiumContainer', {
    terrainProvider: await Cesium.createWorldTerrainAsync({
      requestWaterMask: true,
      requestVertexNormals: true
    }),
    animation: false,
    timeline: false,
    infoBox: false,
    selectionIndicator: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    requestRenderMode: true,
    maximumRenderTimeChange: Number.POSITIVE_INFINITY,
    useBrowserRecommendedResolution: true
  })
  viewer.scene.postProcessStages.fxaa.enabled = false
  viewer.shadows = false
  viewer.targetFrameRate = 30

  // —— 关键：不开启时钟动画，否则会持续重绘
  viewer.clock.shouldAnimate = false
  viewer.clock.multiplier = 0
  viewer.scene.globe.enableLighting = false
  viewer.scene.sun.show = false
  viewer.scene.moon.show = false
  viewer.resolutionScale = 0.75 // 视效与负载的折中

  const poke = () => viewer.scene.requestRender()
  viewer.camera.changed.addEventListener(poke)
  window.addEventListener('resize', poke)

  // 2) 创建数据源管理器并加载所有数据
  dataSourceManager = new DataSourceManager(viewer)
  
  // 管线地形透明度设置
  viewer.scene.screenSpaceCameraController.enableCollisionDetection = false
  viewer.scene.globe.translucency.enabled = true
  viewer.scene.globe.translucency.frontFaceAlpha = ui.terrainAlpha
  viewer.scene.globe.translucency.backFaceAlpha = 0.05
  viewer.scene.pickTranslucentDepth = true
  
  // 批量加载所有预定义数据源
  console.log('开始加载数据源...')
  const loadedSources = await dataSourceManager.loadPredefinedDataSources()
  
  // 获取主要建筑数据用于缩放
  const osgb = dataSourceManager.getDataSource('osgb')
  if (osgb) {
    viewer.zoomTo(osgb)
  }
  
  // 设置管线图例
  const pipelineSources = dataSourceManager.getPipelineDataSources()
  const groups = new Map()
  pipelineSources.forEach((value, key) => {
    groups.set(value.config.name, {
      entities: value.entities,
      color: value.config.color,
      visible: true,
      dataSource: value.dataSource
    })
  })
  pipelineGroups.value = groups
  
  console.log(`数据源加载完成: ${loadedSources.size} 个数据源`)
  poke()

  // 4) 点击高亮 + 红点跳转（共用一个 handler）
  let lastSelected = null
  function clearHighlight(entity) {
    if (!entity || !entity.polygon) return
    entity.polygon.material = Cesium.Color.fromCssColorString('rgba(0,255,255,0.01)')
    entity.polygon.outline = false
  }
  function highlightEntity(entity) {
    if (!entity || !entity.polygon) return
    entity.polygon.material = Cesium.Color.RED.withAlpha(0.5)
    entity.polygon.outline = true
    entity.polygon.outlineColor = Cesium.Color.RED
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position)

    // 红点 / 任何带 url 的目标：根据类型处理
    if (picked && picked.id) {
      const ent = picked.id
      const url =
        ent.url ||
        (ent.properties && ent.properties.url && ent.properties.url.getValue && ent.properties.url.getValue())
      const type = 
        ent.type ||
        (ent.properties && ent.properties.type && ent.properties.type.getValue && ent.properties.type.getValue())
      
      if (url) {
        if (type === 'marzipano') {
          // 本地全景：使用全景查看器
          openPanorama(url, {
            name: `360° 全景点位`,
            url: url,
            type: type,
            coordinates: { lon: ent.lon, lat: ent.lat }
          })
        } else {
          // 外部链接：使用全景查看器显示外部内容
          openPanorama(url, {
            name: `全景点位 ${ent.lon?.toFixed(6)}, ${ent.lat?.toFixed(6)}`,
            url: url,
            type: type || 'external',
            coordinates: { lon: ent.lon, lat: ent.lat }
          })
        }
        poke()
        return
      }
    }

    // 多边形高亮
    if (lastSelected && (!picked || picked.id !== lastSelected)) {
      clearHighlight(lastSelected)
      lastSelected = null
    }
    if (picked && picked.id && picked.id.polygon) {
      if (lastSelected !== picked.id) {
        clearHighlight(lastSelected)
        highlightEntity(picked.id)
        lastSelected = picked.id
      }
    }
    poke()
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  // 5) 全景红点（共享纹理 + 距离裁剪 + 聚合）
  function createDot() {
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 16
    const ctx = canvas.getContext('2d')
    ctx.beginPath()
    ctx.arc(8, 8, 6, 0, 2 * Math.PI)
    ctx.fillStyle = 'red'
    ctx.fill()
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 0.3
    ctx.stroke()
    return canvas
  }
  const sharedDot = createDot()

const redPoints = [
    { lon: 118.22840000032071, lat: 35.10694586947898, url: '/Assets/data/project-title/', type: 'marzipano' },
    { lon: 118.22810000032071, lat: 35.10656486947898, url: 'http://172.20.10.2:3002', type: 'external' },
    { lon: 118.227706, lat: 35.10656486947898, url: 'http://172.20.10.2:3096', type: 'external' },
    { lon: 118.227311, lat: 35.10656486947898, url: 'http://192.168.2.9:3003 ' },
    { lon: 118.226933, lat: 35.10656486947898, url: 'http://192.168.2.9:3097 ' },
    { lon: 118.226555, lat: 35.10656486947898, url: 'http://192.168.2.9:3004' },
    { lon: 118.226555, lat: 35.10632486947898, url: 'http://192.168.2.9:3005 ' },
    { lon: 118.226555, lat: 35.10604486947898, url: 'http://192.168.2.9:3006' },
    { lon: 118.226933, lat: 35.10604486947898, url: 'http://192.168.2.9:3098 ' },
    { lon: 118.227311, lat: 35.10604486947898, url: 'http://192.168.2.9:3007 ' },
    { lon: 118.227706, lat: 35.10604486947898, url: 'http://192.168.2.9:3099 ' },
    { lon: 118.22810000032071, lat: 35.10604486947898, url: 'http://192.168.2.9:3008' },
    { lon: 118.22810000032071, lat: 35.10632486947898, url: 'http://192.168.2.9:3009 ' },
    { lon: 118.22810000032071, lat: 35.1057, url: 'http://192.168.2.9:3010' },
    { lon: 118.227706, lat: 35.1057, url: 'http://192.168.2.9:3011 ' },
    { lon: 118.227311, lat: 35.1057, url: 'http://192.168.2.9:3011 ' },
    { lon: 118.226933, lat: 35.1057, url: 'http://192.168.2.9:3012 ' },
    { lon: 118.226555, lat: 35.1057, url: 'http://192.168.2.9:3012' },
    { lon: 118.226555, lat: 35.10544526147898, url: 'http://192.168.2.9:3013 ' },
    { lon: 118.226555, lat: 35.10516526147898, url: 'http://192.168.2.9:3014' },
    { lon: 118.226933, lat: 35.10516526147898, url: 'http://192.168.2.9:3015 ' },
    { lon: 118.227311, lat: 35.10516526147898, url: 'http://192.168.2.9:3015 ' },
    { lon: 118.227706, lat: 35.10516526147898, url: 'http://192.168.2.9:3016 ' },
    { lon: 118.22810000032071, lat: 35.10516526147898, url: 'http://192.168.2.9:3016' },
    { lon: 118.22810000032071, lat: 35.10544526147898, url: 'http://192.168.2.9:3017 ' },
    { lon: 118.22810000032071, lat: 35.10483526147898, url: 'http://192.168.2.9:3018' },
    { lon: 118.227706, lat: 35.10483526147898, url: 'http://192.168.2.9:3019 ' },
    { lon: 118.227311, lat: 35.10483526147898, url: 'http://192.168.2.9:3019 ' },
    { lon: 118.226933, lat: 35.10483526147898, url: 'http://192.168.2.9:3020 ' },
    { lon: 118.226555, lat: 35.10483526147898, url: 'http://192.168.2.9:3020' },
    { lon: 118.226555, lat: 35.10455526147898, url: 'http://192.168.2.9:3021 ' },
    { lon: 118.226555, lat: 35.10427526147898, url: 'http://192.168.2.9:3022' },
    { lon: 118.226933, lat: 35.10427526147898, url: 'http://192.168.2.9:3023 ' },
    { lon: 118.227311, lat: 35.10427526147898, url: 'http://192.168.2.9:3023 ' },
    { lon: 118.227706, lat: 35.10427526147898, url: 'http://192.168.2.9:3024 ' },
    { lon: 118.22810000032071, lat: 35.10427526147898, url: 'http://192.168.2.9:3024' },
    { lon: 118.22810000032071, lat: 35.10455526147898, url: 'http://192.168.2.9:3025 ' },
    { lon: 118.22810000032071, lat: 35.10394526147898, url: 'http://192.168.2.9:3026' },
    { lon: 118.227706, lat: 35.10394526147898, url: 'http://192.168.2.9:3027 ' },
    { lon: 118.227311, lat: 35.10394526147898, url: 'http://192.168.2.9:3027 ' },
    { lon: 118.226933, lat: 35.10394526147898, url: 'http://192.168.2.9:3028 ' },
    { lon: 118.226555, lat: 35.10394526147898, url: 'http://192.168.2.9:3028' },
    { lon: 118.226555, lat: 35.10366526147898, url: 'http://192.168.2.9:3029 ' },
    { lon: 118.226555, lat: 35.10338526147898, url: 'http://192.168.2.9:3030' },
    { lon: 118.226933, lat: 35.10338526147898, url: 'http://192.168.2.9:3031 ' },
    { lon: 118.227311, lat: 35.10338526147898, url: 'http://192.168.2.9:3031 ' },
    { lon: 118.227706, lat: 35.10338526147898, url: 'http://192.168.2.9:3032 ' },
    { lon: 118.22810000032071, lat: 35.10338526147898, url: 'http://192.168.2.9:3032' },
    { lon: 118.22810000032071, lat: 35.10366526147898, url: 'http://192.168.2.9:3033 ' },
    { lon: 118.23060000032071, lat: 35.10656476947898, url: 'http://192.168.2.9:3034' },
    { lon: 118.230125, lat: 35.10656476947898, url: 'http://192.168.2.9:3035 ' },
    { lon: 118.22965000032071, lat: 35.10656476947898, url: 'http://192.168.2.9:3035 ' },
    { lon: 118.22915, lat: 35.10656476947898, url: 'http://192.168.2.9:3036 ' },
    { lon: 118.22865000032071, lat: 35.10656476947898, url: 'http://192.168.2.9:3036' },
    { lon: 118.22865000032071, lat: 35.10632486947898, url: 'http://192.168.2.9:3037 ' },
    { lon: 118.22865000032071, lat: 35.10604486947898, url: 'http://192.168.2.9:3038' },
    { lon: 118.22915, lat: 35.10604486947898, url: 'http://192.168.2.9:3039 ' },
    { lon: 118.22965000032071, lat: 35.10604486947898, url: 'http://192.168.2.9:3039 ' },
    { lon: 118.230125, lat: 35.10604486947898, url: 'http://192.168.2.9:3040 ' },
    { lon: 118.23060000032071, lat: 35.10604486947898, url: 'http://192.168.2.9:3040' },
    { lon: 118.23060000032071, lat: 35.10632486947898, url: 'http://192.168.2.9:3041 ' },
    { lon: 118.23060000032071, lat: 35.1057, url: 'http://192.168.2.9:3042' },
    { lon: 118.230125, lat: 35.1057, url: 'http://192.168.2.9:3043 ' },
    { lon: 118.22965000032071, lat: 35.1057, url: 'http://192.168.2.9:3043 ' },
    { lon: 118.22915, lat: 35.1057, url: 'http://192.168.2.9:3044 ' },
    { lon: 118.22865000032071, lat: 35.1057, url: 'http://192.168.2.9:3044' },
    { lon: 118.22865000032071, lat: 35.10544526147898, url: 'http://192.168.2.9:3045 ' },
    { lon: 118.22865000032071, lat: 35.10516526147898, url: 'http://192.168.2.9:3046' },
    { lon: 118.22915, lat: 35.10516526147898, url: 'http://192.168.2.9:3047 ' },
    { lon: 118.22965000032071, lat: 35.10516526147898, url: 'http://192.168.2.9:3047 ' },
    { lon: 118.230125, lat: 35.10516526147898, url: 'http://192.168.2.9:3048 ' },
    { lon: 118.23060000032071, lat: 35.10516526147898, url: 'http://192.168.2.9:3048' },
    { lon: 118.23060000032071, lat: 35.10544526147898, url: 'http://192.168.2.9:3049 ' },
    { lon: 118.23060000032071, lat: 35.10483526147898, url: 'http://192.168.2.9:3050' },
    { lon: 118.230125, lat: 35.10483526147898, url: 'http://192.168.2.9:3051 ' },
    { lon: 118.22965000032071, lat: 35.10483526147898, url: 'http://192.168.2.9:3051 ' },
    { lon: 118.22915, lat: 35.10483526147898, url: 'http://192.168.2.9:3052 ' },
    { lon: 118.22865000032071, lat: 35.10483526147898, url: 'http://192.168.2.9:3052' },
    { lon: 118.22865000032071, lat: 35.10455526147898, url: 'http://192.168.2.9:3053 ' },
    { lon: 118.22865000032071, lat: 35.10427526147898, url: 'http://192.168.2.9:3054' },
    { lon: 118.22915, lat: 35.10427526147898, url: 'http://192.168.2.9:3055 ' },
    { lon: 118.22965000032071, lat: 35.10427526147898, url: 'http://192.168.2.9:3055 ' },
    { lon: 118.230125, lat: 35.10427526147898, url: 'http://192.168.2.9:3055 ' },
    { lon: 118.23060000032071, lat: 35.10427526147898, url: 'http://192.168.2.9:3056' },
    { lon: 118.23060000032071, lat: 35.10455526147898, url: 'http://192.168.2.9:3057 ' },
    { lon: 118.23010000032071, lat: 35.10394526147898, url: 'http://192.168.2.9:3058' },
    { lon: 118.229725, lat: 35.10394526147898, url: 'http://192.168.2.9:3059' },
    { lon: 118.22935000032071, lat: 35.10394526147898, url: 'http://192.168.2.9:3059 ' },
    { lon: 118.229, lat: 35.10394526147898, url: 'http://192.168.2.9:3060' },
    { lon: 118.22865000032071, lat: 35.10394526147898, url: 'http://192.168.2.9:3060' },
    { lon: 118.22865000032071, lat: 35.10366526147898, url: 'http://192.168.2.9:3061 ' },
    { lon: 118.22865000032071, lat: 35.10338526147898, url: 'http://192.168.2.9:3062' },
    { lon: 118.229, lat: 35.10338526147898, url: 'http://192.168.2.9:3063' },
    { lon: 118.22935000032071, lat: 35.10338526147898, url: 'http://192.168.2.9:3063 ' },
    { lon: 118.229725, lat: 35.10338526147898, url: 'http://192.168.2.9:3064' },
    { lon: 118.23010000032071, lat: 35.10338526147898, url: 'http://192.168.2.9:3064' },
    { lon: 118.23010000032071, lat: 35.10366526147898, url: 'http://192.168.2.9:3065 ' },
    { lon: 118.2277, lat: 35.10308526147898, url: 'http://192.168.2.9:3066' },
    { lon: 118.22648, lat: 35.10308526147898, url: 'http://192.168.2.9:3067 ' },
    { lon: 118.22648, lat: 35.10277526147898, url: 'http://192.168.2.9:3068' },
    { lon: 118.22648, lat: 35.10249526147898, url: 'http://192.168.2.9:3069 ' },
    { lon: 118.2277, lat: 35.10249526147898, url: 'http://192.168.2.9:3070' },
    { lon: 118.2277, lat: 35.10277526147898, url: 'http://192.168.2.9:3071 ' },
    { lon: 118.2277, lat: 35.10217526147898, url: 'http://192.168.2.9:3072' },
    { lon: 118.22648, lat: 35.10217526147898, url: 'http://192.168.2.9:3073 ' },
    { lon: 118.22648, lat: 35.10189526147898, url: 'http://192.168.2.9:3074' },
    { lon: 118.22648, lat: 35.10161526147898, url: 'http://192.168.2.9:3075 ' },
    { lon: 118.22648, lat: 35.10133526147898, url: 'http://192.168.2.9:3076' },
    { lon: 118.2277, lat: 35.10133526147898, url: 'http://192.168.2.9:3077 ' },
    { lon: 118.2277, lat: 35.10161526147898, url: 'http://192.168.2.9:3078' },
    { lon: 118.2277, lat: 35.10189526147898, url: 'http://192.168.2.9:3079 ' },
    { lon: 118.229, lat: 35.10217526147898, url: 'http://192.168.2.9:3080' },
    { lon: 118.22810000032071, lat: 35.10217526147898, url: 'http://192.168.2.9:3081 ' },
    { lon: 118.22810000032071, lat: 35.10189526147898, url: 'http://192.168.2.9:3082' },
    { lon: 118.22810000032071, lat: 35.10161526147898, url: 'http://192.168.2.9:3083 ' },
    { lon: 118.22810000032071, lat: 35.10133526147898, url: 'http://192.168.2.9:3084' },
    { lon: 118.229, lat: 35.10133526147898, url: 'http://192.168.2.9:3085 ' },
    { lon: 118.229, lat: 35.10161526147898, url: 'http://192.168.2.9:3086 ' },
    { lon: 118.229, lat: 35.10189526147898, url: 'http://192.168.2.9:3087 ' },
    { lon: 118.22935000032071, lat: 35.10308526147898, url: 'http://192.168.2.9:3088 ' },
    { lon: 118.22865000032071, lat: 35.10308526147898, url: 'http://192.168.2.9:3089 ' },
    { lon: 118.22810000032071, lat: 35.10308526147898, url: 'http://192.168.2.9:3090 ' },
    { lon: 118.22810000032071, lat: 35.10277526147898, url: 'http://192.168.2.9:3091 ' },
    { lon: 118.22810000032071, lat: 35.10249526147898, url: 'http://192.168.2.9:3092 ' },
    { lon: 118.22865000032071, lat: 35.10249526147898, url: 'http://192.168.2.9:3093 ' },
    { lon: 118.22935000032071, lat: 35.10249526147898, url: 'http://192.168.2.9:3094 ' },
    { lon: 118.22935000032071, lat: 35.10277526147898, url: 'http://192.168.2.9:3095 ' }
  ]

  // 创建不同类型的点标记
  function createPanoDot(type = 'external') {
    const canvas = document.createElement('canvas')
    canvas.width = 20
    canvas.height = 20
    const ctx = canvas.getContext('2d')
    ctx.beginPath()
    ctx.arc(10, 10, 8, 0, 2 * Math.PI)
    
    if (type === 'marzipano') {
      // 本地全景点：蓝色带360°标识
      ctx.fillStyle = '#007acc'
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.stroke()
      // 添加360°标识
      ctx.fillStyle = 'white'
      ctx.font = '8px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('360', 10, 13)
    } else {
      // 外部链接：传统红色
      ctx.fillStyle = 'red'
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.stroke()
    }
    
    return canvas
  }

  const panoDS = new Cesium.CustomDataSource('pano-dots')
  redPoints.forEach((pt) => {
    panoDS.entities.add({
      position: Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, 0),
      billboard: {
        image: createPanoDot(pt.type),
        width: 28,
        height: 28,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance: new Cesium.NearFarScalar(500, 1.0, 6000, 0.3),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6500),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: 1e6
      },
      properties: { 
        url: pt.url,
        type: pt.type || 'external'
      },
      lon: pt.lon,
      lat: pt.lat
    })
  })
  await viewer.dataSources.add(panoDS)
  panoDS.clustering.enabled = ui.cluster
  panoDS.clustering.pixelRange = ui.clusterRange
  panoDS.clustering.minimumClusterSize = 6
  panoDS.clustering.clusterEvent.addEventListener(poke)
  poke()

  // ================= 天气图层初始化 =================
  const weatherDS = new Cesium.CustomDataSource('weather-layer')
  const temperatureDS = new Cesium.CustomDataSource('temperature-layer')
  const precipitationDS = new Cesium.CustomDataSource('precipitation-layer')
  const windDS = new Cesium.CustomDataSource('wind-layer')
  const warningsDS = new Cesium.CustomDataSource('warnings-layer')

  await Promise.all([
    viewer.dataSources.add(weatherDS),
    viewer.dataSources.add(temperatureDS),
    viewer.dataSources.add(precipitationDS),
    viewer.dataSources.add(windDS),
    viewer.dataSources.add(warningsDS)
  ])

  // 天气数据更新函数
  async function updateWeatherLayers() {
    try {
      if (ui.temperature && ui.weather) {
        await loadTemperatureLayer()
      }
      if (ui.warnings && ui.weather) {
        await loadWarningsLayer()
      }
      poke()
    } catch (error) {
      console.warn('天气图层更新失败:', error)
    }
  }

  // 加载温度图层
  async function loadTemperatureLayer() {
    try {
      temperatureDS.entities.removeAll()
      const provinceWeather = await weatherService.getProvinceWeather()
      
      // 基础省会城市坐标（简化版）
      const provinceCenters = {
        '北京': { lat: 39.9042, lng: 116.4074 },
        '上海': { lat: 31.2304, lng: 121.4737 },
        '天津': { lat: 39.3434, lng: 117.3616 },
        '重庆': { lat: 29.4316, lng: 106.9123 },
        '广东': { lat: 23.1291, lng: 113.2644 },
        '江苏': { lat: 32.0603, lng: 118.7969 },
        '山东': { lat: 36.6512, lng: 117.1201 },
        '浙江': { lat: 30.2741, lng: 120.1551 },
        '河南': { lat: 34.7466, lng: 113.6254 },
        '四川': { lat: 30.6171, lng: 104.0668 },
        '湖北': { lat: 30.5928, lng: 114.3055 },
        '湖南': { lat: 28.2282, lng: 112.9388 },
        '河北': { lat: 38.0428, lng: 114.5149 },
        '福建': { lat: 26.0745, lng: 119.3062 }
      }

      Object.entries(provinceWeather).forEach(([province, data]) => {
        const center = provinceCenters[province]
        if (!center) return

        temperatureDS.entities.add({
          position: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, 50000),
          billboard: {
            show: true,
            image: createTemperatureIcon(data.temp, data.color),
            width: 48,
            height: 48,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            scaleByDistance: new Cesium.NearFarScalar(100000, 1.0, 2000000, 0.3)
          },
          label: {
            text: `${province}\n${data.temp}°C\n${data.weather}`,
            font: '12px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -60),
            scaleByDistance: new Cesium.NearFarScalar(100000, 1.0, 2000000, 0.3)
          },
          properties: {
            type: 'temperature',
            province: province,
            temperature: data.temp,
            weather: data.weather
          }
        })
      })
    } catch (error) {
      console.warn('温度图层加载失败:', error)
    }
  }

  // 加载预警图层
  async function loadWarningsLayer() {
    try {
      warningsDS.entities.removeAll()
      
      // 示例：在几个主要城市检查预警
      const majorCities = [
        { name: '北京', lat: 39.9042, lng: 116.4074 },
        { name: '上海', lat: 31.2304, lng: 121.4737 },
        { name: '广州', lat: 23.1291, lng: 113.2644 },
        { name: '深圳', lat: 22.5431, lng: 114.0579 }
      ]

      for (const city of majorCities) {
        const warnings = await weatherService.getDisasterWarning(city)
        
        warnings.forEach(warning => {
          warningsDS.entities.add({
            position: Cesium.Cartesian3.fromDegrees(city.lng, city.lat, 10000),
            billboard: {
              image: getWarningIcon(warning.level),
              width: 32,
              height: 32,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              scaleByDistance: new Cesium.NearFarScalar(10000, 1.0, 500000, 0.2)
            },
            label: {
              text: `⚠️ ${warning.title}`,
              font: '11px sans-serif',
              fillColor: Cesium.Color.YELLOW,
              outlineColor: Cesium.Color.RED,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -40)
            },
            properties: {
              type: 'warning',
              warningData: warning
            }
          })
        })
      }
    } catch (error) {
      console.warn('预警图层加载失败:', error)
    }
  }

  // 创建温度图标
  function createTemperatureIcon(temp, color) {
    const canvas = document.createElement('canvas')
    canvas.width = 48
    canvas.height = 48
    const ctx = canvas.getContext('2d')
    
    // 绘制圆形背景
    ctx.beginPath()
    ctx.arc(24, 24, 20, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 绘制温度文字
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${temp}°`, 24, 24)
    
    return canvas.toDataURL()
  }

  // 获取预警图标
  function getWarningIcon(level) {
    const colors = {
      '蓝色': '#0066FF',
      '黄色': '#FFCC00', 
      '橙色': '#FF6600',
      '红色': '#FF0000'
    }
    
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const ctx = canvas.getContext('2d')
    
    // 绘制警告三角形
    ctx.beginPath()
    ctx.moveTo(16, 4)
    ctx.lineTo(28, 24)
    ctx.lineTo(4, 24)
    ctx.closePath()
    ctx.fillStyle = colors[level] || '#FFCC00'
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 绘制感叹号
    ctx.fillStyle = '#000'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('!', 16, 16)
    
    return canvas.toDataURL()
  }

  // 初始加载天气图层
  await updateWeatherLayers()

  // ================= 管线分析功能 =================

  // 剖面分析
  function startSectionAnalysis() {
    if (sectionMode.value) {
      endSectionAnalysis()
      return
    }
    
    sectionMode.value = true
    excavationMode.value = false
    sectionPoints = []
    clearClipping()
    
    viewer.canvas.style.cursor = 'crosshair'
    
    // 创建预览线
    sectionPreviewLine = viewer.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          if (sectionPoints.length === 0) return []
          if (sectionPoints.length === 1 && currentMousePosition) {
            return [
              Cesium.Cartesian3.fromRadians(sectionPoints[0].longitude, sectionPoints[0].latitude, sectionPoints[0].height),
              Cesium.Cartesian3.fromRadians(currentMousePosition.longitude, currentMousePosition.latitude, currentMousePosition.height)
            ]
          }
          if (sectionPoints.length === 2) {
            return [
              Cesium.Cartesian3.fromRadians(sectionPoints[0].longitude, sectionPoints[0].latitude, sectionPoints[0].height),
              Cesium.Cartesian3.fromRadians(sectionPoints[1].longitude, sectionPoints[1].latitude, sectionPoints[1].height)
            ]
          }
          return []
        }, false),
        width: 4,
        material: Cesium.Color.YELLOW,
        clampToGround: true
      }
    })
  }

  function endSectionAnalysis() {
    sectionMode.value = false
    sectionPoints = []
    viewer.canvas.style.cursor = 'default'
    
    if (sectionPreviewLine) {
      viewer.entities.remove(sectionPreviewLine)
      sectionPreviewLine = null
    }
    
    sectionTempEntities.forEach(entity => viewer.entities.remove(entity))
    sectionTempEntities = []
  }

  // 挖方分析
  function startExcavationAnalysis() {
    if (excavationMode.value) {
      endExcavationAnalysis()
      return
    }
    
    excavationMode.value = true
    sectionMode.value = false
    excavationPoints = []
    clearClipping()
    
    viewer.canvas.style.cursor = 'crosshair'
  }

  function endExcavationAnalysis() {
    excavationMode.value = false
    excavationPoints = []
    viewer.canvas.style.cursor = 'default'
    
    if (excavationPreviewPolygon) {
      viewer.entities.remove(excavationPreviewPolygon)
      excavationPreviewPolygon = null
    }
    
    excavationTempEntities.forEach(entity => viewer.entities.remove(entity))
    excavationTempEntities = []
  }

  // 清除所有分析
  function clearAllAnalysis() {
    endSectionAnalysis()
    endExcavationAnalysis()
    clearClipping()
    pipelineInfo.show = false
  }

  // 清除裁剪
  function clearClipping() {
    viewer.scene.globe.clippingPlanes = undefined
    if (osgb) osgb.clippingPlanes = undefined
    if (ck) ck.clippingPlanes = undefined
  }

  // 分析剖面管线
  function analyzeSectionPipelines(startCart, endCart) {
    const pipelines = []
    const startPos = Cesium.Cartesian3.fromRadians(startCart.longitude, startCart.latitude, startCart.height)
    const endPos = Cesium.Cartesian3.fromRadians(endCart.longitude, endCart.latitude, endCart.height)
    
    if (dataSourceManager) {
      const pipelineSources = dataSourceManager.getPipelineDataSources()
      
      pipelineSources.forEach((sourceData) => {
        sourceData.entities.forEach(entity => {
          if (entity.polylineVolume && entity.polylineVolume.positions) {
            const positions = entity.polylineVolume.positions.getValue(Cesium.JulianDate.now())
            if (positions && positions.length >= 2) {
              for (let i = 0; i < positions.length - 1; i++) {
                const segStart = positions[i]
                const segEnd = positions[i + 1]
                const distance = calculateLineSegmentDistance(startPos, endPos, segStart, segEnd)
                
                if (distance < 50.0) { // 50米缓冲区
                  const properties = {}
                  if (entity.properties) {
                    const propertyNames = entity.properties.propertyNames || []
                    propertyNames.forEach(name => {
                      let value = entity.properties[name]
                      if (value && typeof value.getValue === 'function') {
                        value = value.getValue(Cesium.JulianDate.now())
                      }
                      if (value !== undefined && value !== null) {
                        properties[name] = value
                      }
                    })
                  }
                  
                  pipelines.push({
                    entity: entity,
                    name: entity.name || '未知管线',
                    properties: properties,
                    distance: distance
                  })
                  break
                }
              }
            }
          }
        })
      })
    }
    
    return pipelines
  }

  // 计算线段距离
  function calculateLineSegmentDistance(line1Start, line1End, line2Start, line2End) {
    const d1 = Cesium.Cartesian3.distance(line1Start, line2Start)
    const d2 = Cesium.Cartesian3.distance(line1Start, line2End)
    const d3 = Cesium.Cartesian3.distance(line1End, line2Start)
    const d4 = Cesium.Cartesian3.distance(line1End, line2End)
    return Math.min(d1, d2, d3, d4)
  }

  // 显示管线信息
  function showPipelineInfo(pipelines, title) {
    pipelineInfo.title = title
    pipelineInfo.pipelines = pipelines
    pipelineInfo.show = true
  }

  // 管线分析鼠标事件
  const analysisHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  
  // 鼠标移动
  analysisHandler.setInputAction((movement) => {
    const ray = viewer.camera.getPickRay(movement.endPosition)
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene)
    if (cartesian) {
      currentMousePosition = Cesium.Cartographic.fromCartesian(cartesian)
    } else {
      currentMousePosition = null
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
  
  // 点击事件
  analysisHandler.setInputAction((movement) => {
    if (sectionMode.value) {
      const ray = viewer.camera.getPickRay(movement.position)
      const cartesian = viewer.scene.globe.pick(ray, viewer.scene)
      if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
        sectionPoints.push(cartographic)
        
        if (sectionPoints.length === 1) {
          // 添加第一个点
          const pointEntity = viewer.entities.add({
            position: Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, cartographic.height),
            point: {
              pixelSize: 10,
              color: Cesium.Color.YELLOW,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2
            }
          })
          sectionTempEntities.push(pointEntity)
        } else if (sectionPoints.length === 2) {
          // 完成剖面分析
          const pipelines = analyzeSectionPipelines(sectionPoints[0], sectionPoints[1])
          showPipelineInfo(pipelines, '剖面分析结果')
          endSectionAnalysis()
        }
      }
    } else if (excavationMode.value) {
      const ray = viewer.camera.getPickRay(movement.position)
      const cartesian = viewer.scene.globe.pick(ray, viewer.scene)
      if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
        excavationPoints.push(cartographic)
        
        // 添加点标记
        const pointEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, cartographic.height),
          point: {
            pixelSize: 8,
            color: Cesium.Color.CYAN,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1
          }
        })
        excavationTempEntities.push(pointEntity)
        
        if (excavationPoints.length >= 3) {
          // 可以完成挖方分析
          // 这里可以添加挖方分析逻辑
          endExcavationAnalysis()
        }
      }
    }
    
    poke()
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  // 管线图例控制交互在顶层 togglePipelineGroup 中实现，这里仅触发重绘

  // 全景查看器控制
  function openPanorama(url, info = null) {
    panoramaModal.show = true
    
    // 等待组件挂载后再加载全景
    nextTick(() => {
      if (panoramaViewer.value) {
        panoramaViewer.value.loadPanorama(url, info)
      }
    })
  }

  function closePanorama() {
    panoramaModal.show = false
  }

  // ================= 图层面板联动（只改 show/参数，不破坏你的交互） =================
  const applyToggles = () => {
    // 使用数据源管理器控制显示
    if (dataSourceManager) {
      dataSourceManager.toggleDataSource('osgb', ui.osgb)
      dataSourceManager.toggleDataSource('ck', ui.ck)
      dataSourceManager.toggleDataSource('warehouse', ui.geo)
      
      // 管线图层显示控制
      const pipelineSources = dataSourceManager.getPipelineDataSources()
      pipelineSources.forEach((value, key) => {
        dataSourceManager.toggleDataSource(key, ui.pipelines)
      })
    }
    
    panoDS.show = ui.pano
    
    // 天气图层显示控制
    weatherDS.show = ui.weather
    temperatureDS.show = ui.weather && ui.temperature
    precipitationDS.show = ui.weather && ui.precipitation
    windDS.show = ui.weather && ui.wind
    warningsDS.show = ui.weather && ui.warnings
    
    // 应用透明度
    const opacity = ui.weatherOpacity / 100
    if (temperatureDS.entities) {
      temperatureDS.entities.values.forEach(entity => {
        if (entity.billboard) entity.billboard.color = Cesium.Color.WHITE.withAlpha(opacity)
        if (entity.label) entity.label.fillColor = Cesium.Color.WHITE.withAlpha(opacity)
      })
    }
    
    poke()
  }
  applyToggles()

  watch(() => [ui.osgb, ui.ck, ui.geo, ui.pano, ui.pipelines], applyToggles)

  // 地形透明度监听
  watch(() => ui.terrainAlpha, (alpha) => {
    viewer.scene.globe.translucency.frontFaceAlpha = alpha
    
    // 同步调整建筑透明度
    if (dataSourceManager) {
      const osgb = dataSourceManager.getDataSource('osgb')
      if (osgb) {
        osgb.style = new Cesium.Cesium3DTileStyle({
          color: `rgba(255,255,255, ${alpha})`
        })
      }
      
      const ck = dataSourceManager.getDataSource('ck')
      if (ck) {
        ck.style = new Cesium.Cesium3DTileStyle({
          color: `rgba(255,255,255, ${alpha})`
        })
      }
    }
    
    poke()
  })

  watch(() => ui.cluster, (v) => {
    panoDS.clustering.enabled = v
    poke()
  })

  watch(() => ui.clusterRange, (v) => {
    panoDS.clustering.pixelRange = v
    poke()
  })

  watch(() => ui.sse, (v) => {
    if (dataSourceManager) {
      const osgb = dataSourceManager.getDataSource('osgb')
      if (osgb) osgb.maximumScreenSpaceError = v
      
      const ck = dataSourceManager.getDataSource('ck')
      if (ck) ck.maximumScreenSpaceError = v
    }
    poke()
  })

  // 天气图层监听器
  watch(() => [ui.weather, ui.temperature, ui.precipitation, ui.wind, ui.warnings], applyToggles)
  
  watch(() => ui.weatherOpacity, applyToggles)

  // 天气图层内容更新监听
  watch(() => [ui.temperature, ui.warnings], async () => {
    if (ui.weather) {
      await updateWeatherLayers()
    }
  })

  // 定期更新天气数据（每30分钟）
  const weatherUpdateInterval = setInterval(async () => {
    if (ui.weather) {
      await updateWeatherLayers()
    }
  }, 30 * 60 * 1000)

  // 组件清理
  onUnmounted(() => {
    if (weatherUpdateInterval) {
      clearInterval(weatherUpdateInterval)
    }
    if (analysisHandler) {
      analysisHandler.destroy()
    }
    if (dataSourceManager) {
      dataSourceManager.destroy()
    }
  })
})
</script>

<style>
* { box-sizing: border-box; padding: 0; margin: 0; }
#app { margin: 0; padding: 0; }
#cesiumContainer { width: 100vw; height: 100vh; }

/* Fluent 设计风格图层面板（右上角） */
.layer-panel {
  position: absolute;
  right: 20px;
  top: 20px;
  z-index: 10;
  background: rgba(44, 44, 44, 0.95);
  color: #fff;
  padding: 16px;
  border-radius: 12px;
  min-width: 240px;
  font-size: 13px;
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.layer-panel .row { 
  margin: 8px 0; 
  display: flex; 
  align-items: center; 
  gap: 10px; 
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s ease;
}

.layer-panel .row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.layer-panel .title { 
  font-weight: 600; 
  font-size: 15px; 
  color: #0078d4;
  margin-bottom: 4px;
  padding-bottom: 8px;
  border-bottom: 2px solid rgba(0, 120, 212, 0.3);
}

.layer-panel .small { 
  opacity: 0.85;
  font-size: 12px;
  font-weight: 400;
}

.layer-panel .sep { 
  height: 1px; 
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent); 
  margin: 12px 0; 
}

.layer-panel .slider { 
  width: 100%; 
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  outline: none;
  transition: all 0.2s ease;
}

.layer-panel .slider::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  background: linear-gradient(135deg, #0078d4, #106ebe);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 120, 212, 0.4);
  transition: all 0.2s ease;
}

.layer-panel .slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 3px 10px rgba(0, 120, 212, 0.6);
}

.layer-panel input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #0078d4;
  cursor: pointer;
  transition: all 0.2s ease;
}

.layer-panel label {
  cursor: pointer;
  font-weight: 500;
  transition: color 0.2s ease;
  flex: 1;
}

.layer-panel label:hover {
  color: #4cc2ff;
}

/* 天气图层样式增强 */
.layer-panel .row.small {
  font-size: 11px;
  margin-left: 12px;
  margin: 3px 0 3px 12px;
}

.layer-panel .row.small input[type="checkbox"] {
  transform: scale(0.9);
}

/* 管线分析面板样式 - Fluent 设计风格 */
.analysis-panel {
  position: absolute;
  top: 20px;
  left: 20px;
  background: rgba(44, 44, 44, 0.95);
  color: white;
  padding: 16px;
  border-radius: 12px;
  min-width: 280px;
  max-height: 60vh;
  overflow-y: auto;
  z-index: 1000;
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.analysis-panel .panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.2);
}

.analysis-panel h3 {
  margin: 0;
  font-size: 16px;
  color: #fefefe;
}

.analysis-panel .close-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.analysis-panel .close-btn:hover {
  background: rgba(255,255,255,0.1);
  border-radius: 50%;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 15px;
}

.control-group button {
  background: linear-gradient(135deg, #0078d4, #106ebe);
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0, 120, 212, 0.2);
  position: relative;
  overflow: hidden;
}

.control-group button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s;
}

.control-group button:hover {
  background: linear-gradient(135deg, #106ebe, #005a9e);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 120, 212, 0.3);
}

.control-group button:hover::before {
  left: 100%;
}

.control-group button.active {
  background: linear-gradient(135deg, #ff6b35, #f7931e);
  box-shadow: 0 4px 16px rgba(255, 107, 53, 0.4);
}

.control-group button:active {
  transform: translateY(0);
}

.info-panel {
  background: rgba(32, 32, 32, 0.96);
  border-radius: 10px;
  padding: 16px;
  margin-top: 12px;
  border: 1px solid rgba(0, 120, 212, 0.2);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.info-content {
  max-height: 320px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #0078d4 rgba(255, 255, 255, 0.1);
}

.info-content::-webkit-scrollbar {
  width: 6px;
}

.info-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.info-content::-webkit-scrollbar-thumb {
  background: #0078d4;
  border-radius: 3px;
}

.no-data {
  color: #a0a0a0;
  text-align: center;
  padding: 32px 20px;
  font-style: italic;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
}

.pipeline-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pipeline-item {
  background: linear-gradient(135deg, rgba(0, 120, 212, 0.1), rgba(16, 110, 190, 0.1));
  padding: 16px;
  border-radius: 8px;
  border-left: 4px solid #0078d4;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.pipeline-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(0, 120, 212, 0.5), transparent);
}

.pipeline-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 120, 212, 0.2);
  background: linear-gradient(135deg, rgba(0, 120, 212, 0.15), rgba(16, 110, 190, 0.15));
}

.pipeline-item h4 {
  margin: 0 0 12px 0;
  color: #4cc2ff;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pipeline-item h4::before {
  content: '🔧';
  font-size: 12px;
}

.properties {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.property {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
}

.property .label {
  color: #b0b0b0;
  font-weight: 500;
  min-width: 90px;
  font-size: 12px;
}

.property .value {
  color: #fff;
  text-align: right;
  flex: 1;
  font-weight: 400;
  background: rgba(0, 120, 212, 0.1);
  padding: 2px 8px;
  border-radius: 3px;
  font-family: 'Consolas', monospace;
}

/* 管线图例面板样式 - Fluent 设计风格 */
.legend-panel {
  position: absolute;
  bottom: 80px;
  left: 20px;
  background: rgba(44, 44, 44, 0.95);
  color: white;
  padding: 16px;
  border-radius: 12px;
  min-width: 280px;
  max-height: 40vh;
  overflow-y: auto;
  z-index: 1000;
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.legend-panel .panel-header h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: #fefefe;
  border-bottom: 1px solid rgba(255,255,255,0.2);
  padding-bottom: 6px;
}

.legend-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-item label {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 6px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.legend-item label:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateX(2px);
}

.legend-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #0078d4;
  cursor: pointer;
}

.legend-item .swatch {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
}

.legend-item label:hover .swatch {
  transform: scale(1.1);
  border-color: rgba(255, 255, 255, 0.6);
}

.legend-item .name {
  color: #fff;
  flex: 1;
  font-weight: 500;
}

.legend-item .count {
  color: #a0a0a0;
  font-size: 12px;
  font-weight: 400;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 12px;
  min-width: 20px;
  text-align: center;
}
</style>

