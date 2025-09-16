<template>
  <div id="cesiumContainer" ref="cesiumContainer"></div>

  <!-- 图层面板（极简，不改变你整体风格） -->
  <div class="layer-panel">
    <div class="row title">图层</div>
    <label class="row"><input type="checkbox" v-model="ui.osgb"> OSGB 建筑</label>
    <label class="row"><input type="checkbox" v-model="ui.ck"> 分类 CK</label>
    <label class="row"><input type="checkbox" v-model="ui.geo"> 仓库面 (GeoJSON)</label>
    <label class="row"><input type="checkbox" v-model="ui.pano"> 全景红点</label>

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
</template>

<script setup>
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { onMounted, onUnmounted, reactive, watch, ref } from 'vue'
import { weatherService } from '@/services/weather'
import { disasterService } from '@/services/disaster'

window.CESIUM_BASE_URL = '/'

const ui = reactive({
  osgb: true,
  ck: true,
  geo: true,
  pano: true,
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

  // 2) 3D Tiles
  const osgbUrl = '/Assets/data/osgb/tileset.json'
  const osgb = await Cesium.Cesium3DTileset.fromUrl(osgbUrl)
  osgb.maximumScreenSpaceError = ui.sse
  viewer.scene.primitives.add(osgb)

  const ckUrl = '/Assets/data/ck/tileset.json'
  const ck = await Cesium.Cesium3DTileset.fromUrl(ckUrl, {
    classificationType: Cesium.ClassificationType.CESIUM_3D_TILE
  })
  ck.maximumScreenSpaceError = ui.sse
  ck.modelMatrix = Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, 135))
  viewer.scene.primitives.add(ck)

  viewer.zoomTo(osgb)
  poke()

  // 3) GeoJSON（只对 Tiles 分类，避免 BOTH 带来的额外管线）
  const geoDS = await Cesium.GeoJsonDataSource.load('/Assets/data/geojson/仓库.json', {
    clampToGround: true
  })
  geoDS.entities.values.forEach((e) => {
    if (e.polygon) {
      e.polygon.classificationType = Cesium.ClassificationType.CESIUM_3D_TILE
      e.polygon.material = Cesium.Color.fromCssColorString('rgba(0,255,255,0.01)')
      e.polygon.outline = false
    }
  })
  await viewer.dataSources.add(geoDS)
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

    // 红点 / 任何带 url 的目标：打开页面
    if (picked && picked.id) {
      const ent = picked.id
      const url =
        ent.url ||
        (ent.properties && ent.properties.url && ent.properties.url.getValue && ent.properties.url.getValue())
      if (url) {
        window.open(url, '_blank')
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
    { lon: 118.22840000032071, lat: 35.10694586947898, url: 'http://192.168.2.9:3001 ' },
    { lon: 118.22810000032071, lat: 35.10656486947898, url: 'http://172.20.10.2:3002 ' },
    { lon: 118.227706, lat: 35.10656486947898, url: 'http://172.20.10.2:3096 ' },
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

  const panoDS = new Cesium.CustomDataSource('pano-dots')
  redPoints.forEach((pt) => {
    panoDS.entities.add({
      position: Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, 0),
      billboard: {
        image: sharedDot,
        width: 24,
        height: 24,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance: new Cesium.NearFarScalar(500, 1.0, 6000, 0.3),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6500),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: 1e6
      },
      properties: { url: pt.url }
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

  // ================= 图层面板联动（只改 show/参数，不破坏你的交互） =================
  const applyToggles = () => {
    osgb.show = ui.osgb
    ck.show = ui.ck
    geoDS.show = ui.geo
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

  watch(() => [ui.osgb, ui.ck, ui.geo, ui.pano], applyToggles)

  watch(() => ui.cluster, (v) => {
    panoDS.clustering.enabled = v
    poke()
  })

  watch(() => ui.clusterRange, (v) => {
    panoDS.clustering.pixelRange = v
    poke()
  })

  watch(() => ui.sse, (v) => {
    osgb.maximumScreenSpaceError = v
    ck.maximumScreenSpaceError = v
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
  })
})
</script>

<style>
* { box-sizing: border-box; padding: 0; margin: 0; }
#app { margin: 0; padding: 0; }
#cesiumContainer { width: 100vw; height: 100vh; }

/* 极简图层面板（右上角） */
.layer-panel {
  position: absolute;
  right: 12px;
  top: 12px;
  z-index: 10;
  background: rgba(0,0,0,0.55);
  color: #fff;
  padding: 10px 12px;
  border-radius: 10px;
  min-width: 200px;
  font-size: 12px;
  backdrop-filter: blur(4px);
}
.layer-panel .row { margin: 6px 0; display: flex; align-items: center; gap: 6px; }
.layer-panel .title { font-weight: 600; font-size: 13px; }
.layer-panel .small { opacity: 0.9; }
.layer-panel .sep { height: 1px; background: rgba(255,255,255,0.25); margin: 6px 0; }
.layer-panel .slider { width: 100%; }

/* 天气图层样式增强 */
.layer-panel .row.small {
  font-size: 11px;
  margin-left: 12px;
  margin: 3px 0 3px 12px;
}

.layer-panel .row.small input[type="checkbox"] {
  transform: scale(0.9);
}
</style>

