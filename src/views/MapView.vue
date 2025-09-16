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

    <div class="row small">Tiles 细节（SSE）：{{ ui.sse }}</div>
    <input class="slider" type="range" min="8" max="24" step="1" v-model.number="ui.sse" />
  </div>
</template>

<script setup>
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { onMounted, onBeforeUnmount, reactive, watch } from 'vue'
import { subscribeBridge } from '@/bridge/routeBridge'

window.CESIUM_BASE_URL = '/'

const ui = reactive({
  osgb: true,
  ck: true,
  geo: true,
  pano: true,
  cluster: true,
  clusterRange: 45, // 像素范围
  sse: 12           // 屏幕误差（越大越省）
})

onMounted(async () => {
  Cesium.Ion.defaultAccessToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyZTFmMDI1YS05MTRkLTRhMzYtYTNiZi0wYmM2YTdlYjU5ODMiLCJpZCI6MjIwNDYzLCJpYXQiOjE3MTc2NTIwMDF9.U1PZjG0GiZdXjIvHRyAGsHRMveUVQdINghXIfF6xJDE'

  // 1) Viewer
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

  viewer.clock.shouldAnimate = false
  viewer.clock.multiplier = 0
  viewer.scene.globe.enableLighting = false
  viewer.scene.sun.show = false
  viewer.scene.moon.show = false
  viewer.resolutionScale = 0.75

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

  // 3) GeoJSON
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

  // 4) 点击高亮 + 红点跳转
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

  // 5) 全景红点
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

  const redPoints = [{ lon: 118.22840000032071, lat: 35.10694586947898, url: 'http://192.168.2.9:3001 ' }]
  const panoDS = new Cesium.CustomDataSource('pano-dots')
  redPoints.forEach((pt) => {
    panoDS.entities.add({
      position: Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, 0),
      billboard: {
        image: sharedDot, width: 24, height: 24,
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

  const applyToggles = () => {
    osgb.show = ui.osgb
    ck.show = ui.ck
    geoDS.show = ui.geo
    panoDS.show = ui.pano
    poke()
  }
  applyToggles()

  watch(() => [ui.osgb, ui.ck, ui.geo, ui.pano], applyToggles)
  watch(() => ui.cluster, (v) => { panoDS.clustering.enabled = v; poke() })
  watch(() => ui.clusterRange, (v) => { panoDS.clustering.pixelRange = v; poke() })
  watch(() => ui.sse, (v) => { osgb.maximumScreenSpaceError = v; ck.maximumScreenSpaceError = v; poke() })

  // ============== 路线图层与绘制 ==============
  const routeDS = new Cesium.CustomDataSource('route-layer')
  await viewer.dataSources.add(routeDS)

  function clearRoute() { routeDS.entities.removeAll() }

  function drawMarkers(origin, destination) {
    const mkStyle = {
      pixelSize: 10, color: Cesium.Color.fromCssColorString('#00d8ff'),
      outlineColor: Cesium.Color.WHITE, outlineWidth: 2,
      disableDepthTestDistance: 1e9
    }
    routeDS.entities.add({
      position: Cesium.Cartesian3.fromDegrees(origin[0], origin[1], 0),
      point: mkStyle,
      label: { text: '起', font: 'bold 12px sans-serif', pixelOffset: new Cesium.Cartesian2(0,-16),
               fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
               style: Cesium.LabelStyle.FILL_AND_OUTLINE, distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8000) }
    })
    routeDS.entities.add({
      position: Cesium.Cartesian3.fromDegrees(destination[0], destination[1], 0),
      point: mkStyle,
      label: { text: '终', font: 'bold 12px sans-serif', pixelOffset: new Cesium.Cartesian2(0,-16),
               fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
               style: Cesium.LabelStyle.FILL_AND_OUTLINE, distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8000) }
    })
  }

  function drawPolylineWGS84(wgsPoints) {
    clearRoute()
    if (!wgsPoints.length) return
    const positions = wgsPoints.map(([lng,lat]) => Cesium.Cartesian3.fromDegrees(lng, lat, 0))
    routeDS.entities.add({
      polyline: {
        positions, width: 5,
        material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.2, taperPower: 0.5, color: Cesium.Color.CYAN }),
        clampToGround: true
      }
    })
    drawMarkers(wgsPoints[0], wgsPoints[wgsPoints.length-1])
    viewer.flyTo(routeDS.entities, { duration: 0.8 })
    poke()
  }

  // --- GCJ-02 -> WGS84 ---
  const PI = 3.1415926535897932384626, a = 6378245.0, ee = 0.00669342162296594323
  function outOfChina(lng, lat){ return (lng<72.004 || lng>137.8347 || lat<0.8293 || lat>55.8271) }
  function transformLat(lng, lat) {
    let ret = -100.0 + 2.0*lng + 3.0*lat + 0.2*lat*lat + 0.1*lng*lat + 0.2*Math.sqrt(Math.abs(lng))
    ret += (20.0*Math.sin(6.0*lng*PI) + 20.0*Math.sin(2.0*lng*PI))*2.0/3.0
    ret += (20.0*Math.sin(lat*PI) + 40.0*Math.sin(lat/3.0*PI))*2.0/3.0
    ret += (160.0*Math.sin(lat/12.0*PI) + 320*Math.sin(lat*PI/30.0))*2.0/3.0
    return ret
  }
  function transformLon(lng, lat) {
    let ret = 300.0 + lng + 2.0*lat + 0.1*lng*lng + 0.1*lng*lat + 0.1*Math.sqrt(Math.abs(lng))
    ret += (20.0*Math.sin(6.0*lng*PI) + 20.0*Math.sin(2.0*lng*PI))*2.0/3.0
    ret += (20.0*Math.sin(lng*PI) + 40.0*Math.sin(lng/3.0*PI))*2.0/3.0
    ret += (150.0*Math.sin(lng/12.0*PI) + 300.0*Math.sin(lng/30.0*PI))*2.0/3.0
    return ret
  }
  function gcj02_to_wgs84(lng, lat){
    if (outOfChina(lng, lat)) return [lng, lat]
    let dLat = transformLat(lng - 105.0, lat - 35.0)
    let dLng = transformLon(lng - 105.0, lat - 35.0)
    const radLat = lat / 180.0 * PI
    let magic = Math.sin(radLat)
    magic = 1 - ee * magic * magic
    const sqrtMagic = Math.sqrt(magic)
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * PI)
    dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * PI)
    const mgLat = lat + dLat
    const mgLng = lng + dLng
    return [lng * 1 - mgLng + lng, lat * 1 - mgLat + lat]
  }

  async function fetchAmapPolylineGCJ(origin, dest, mode='driving'){
    const key = (import.meta && import.meta.env && (import.meta.env.VITE_AMAP_REST_KEY || import.meta.env.VITE_AMAP_KEY))
    if (!key) throw new Error('缺少 VITE_AMAP_REST_KEY（或 VITE_AMAP_KEY）')
    const o = `${origin.lng},${origin.lat}`
    const d = `${dest.lng},${dest.lat}`
    let url = `https://restapi.amap.com/v5/direction/driving?origin=${o}&destination=${d}&key=${key}&show_fields=polyline`
    if (mode === 'walking') url = `https://restapi.amap.com/v5/direction/walking?origin=${o}&destination=${d}&key=${key}&show_fields=polyline`
    else if (mode === 'riding') url = `https://restapi.amap.com/v5/direction/bicycling?origin=${o}&destination=${d}&key=${key}&show_fields=polyline`
    else if (mode === 'transit') url = `https://restapi.amap.com/v5/direction/transit/integrated?origin=${o}&destination=${d}&key=${key}&show_fields=polyline`
    const r = await fetch(url)
    const j = await r.json()
    if (j.status !== '1') throw new Error(`AMap direction error: ${j.info || 'unknown'}`)
    const steps = j?.route?.paths?.[0]?.steps
    if (!steps?.length) throw new Error('no route steps')
    const gcjPairs = []
    for (const s of steps) {
      const seg = String(s.polyline).split(';').map(p => p.split(',').map(Number))
      for (const [lng,lat] of seg) gcjPairs.push([lng,lat])
    }
    return gcjPairs
  }

  subscribeBridge(async (data) => {
    try {
      const gcj = await fetchAmapPolylineGCJ(data.origin, data.destination, data.mode || 'driving')
      const wgs = gcj.map(([lng,lat]) => gcj02_to_wgs84(lng, lat))
      drawPolylineWGS84(wgs)
    } catch (e) {
      console.warn('[route] fallback straight line', e)
      const from = gcj02_to_wgs84(data.origin.lng, data.origin.lat)
      const to   = gcj02_to_wgs84(data.destination.lng, data.destination.lat)
      drawPolylineWGS84([from, to])
    }
  })
})

// 可选：onBeforeUnmount 里清理订阅（这里省略）
</script>

<style>
* { box-sizing: border-box; padding: 0; margin: 0; }
#app { margin: 0; padding: 0; }
#cesiumContainer { width: 100vw; height: 100vh; }

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
</style>
