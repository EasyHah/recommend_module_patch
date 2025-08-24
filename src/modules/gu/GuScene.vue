<template>
  <div class="gu-scene">
    <!-- 顶栏（与首页一致） -->
    <TopBar />

    <!-- 顶部模式切换条（与首页色调一致） -->
    <div class="gu-toolbar fluent-acrylic-strong">
      <div class="mode-tabs">
        <button class="tab" :class="{ active: mode==='surface' }" @click="setMode('surface')">地上</button>
        <button class="tab" :class="{ active: mode==='underground' }" @click="setMode('underground')">地下</button>
        <button class="tab" :class="{ active: mode==='both' }" @click="setMode('both')">同时</button>
      </div>
    </div>

    <!-- Cesium 画布 -->
    <div ref="cesiumRef" class="scene-canvas"></div>

    <!-- ================= 左抽屉：主页同款框架（上：图层 / 下：图例） ================= -->
    <div
      class="drawer left"
      :class="{ open: ui.drawer.leftOpen || ui.drawer.leftPinned, pinned: ui.drawer.leftPinned }"
      @mouseenter="ui.hover('left', true)" @mouseleave="ui.hover('left', false)"
    >
      <div class="drawer-inner fluent-acrylic-strong">
        <header class="drawer-header">
          <div class="title">图层与图例（{{ modeLabel }}）</div>
          <div class="actions">
            <button class="pin" @click="ui.togglePin('left')">
              {{ ui.drawer.leftPinned ? '取消固定' : '固定' }}
            </button>
          </div>
        </header>

        <!-- 抽屉主体：两张 FluentCard 卡片 -->
        <div class="drawer-body card-stack">
          <!-- 图层 -->
          <FluentCard strong title="图层" scrollable>
            <div class="pane-scroll">
              <div v-for="layer in visibleLayerList" :key="layer.id" class="layer-item">
                <label class="layer-row">
                  <input
                    type="checkbox"
                    :checked="(localVisible[layer.id] ?? layer.visible)"
                    @change="toggleLayer(layer)"
                  />
                  <span class="name">{{ layer.name }}</span>
                  <span class="badge" :style="{ background: layer.legendColor || '#aaa' }"></span>
                </label>
              </div>
            </div>
          </FluentCard>

          <!-- 图例 -->
          <FluentCard strong title="图例" scrollable>
            <div class="pane-scroll">
              <div class="legend-grid">
                <div v-for="l in legendList" :key="l.id" class="legend-item">
                  <span class="swatch" :style="{ background: l.legendColor || '#aaa' }"></span>
                  <span class="legend-name">{{ l.name }}</span>
                </div>
              </div>
            </div>
          </FluentCard>
        </div>
      </div>

      <!-- 把手（与首页一致） -->
      <button class="handle" @click="ui.toggleOpen('left')"><span>≡</span></button>
    </div>

    <!-- ================= 右抽屉：主页同款框架（上：筛选 / 下：属性） ================= -->
    <div
      class="drawer right"
      :class="{ open: ui.drawer.rightOpen || ui.drawer.rightPinned, pinned: ui.drawer.rightPinned }"
      @mouseenter="ui.hover('right', true)" @mouseleave="ui.hover('right', false)"
    >
      <div class="drawer-inner fluent-acrylic-strong">
        <header class="drawer-header">
          <div class="title">筛选与属性</div>
          <div class="actions">
            <button class="pin" @click="ui.togglePin('right')">
              {{ ui.drawer.rightPinned ? '取消固定' : '固定' }}
            </button>
          </div>
        </header>

        <!-- 抽屉主体：两张 FluentCard 卡片 -->
        <div class="drawer-body card-stack">
          <!-- 筛选 -->
          <FluentCard strong title="筛选">
            <div class="form-row">
              <label>类型</label>
              <select v-model="filter.type">
                <option value="">全部</option>
                <option v-for="v in typeOptions" :key="'t-'+v" :value="v">{{ v }}</option>
              </select>
            </div>
            <div class="form-row">
              <label>状态</label>
              <select v-model="filter.status">
                <option value="">全部</option>
                <option v-for="v in statusOptions" :key="'s-'+v" :value="v">{{ v }}</option>
              </select>
            </div>
            <div class="form-row">
              <label>时间</label>
              <select v-model="filter.time">
                <option value="">全部</option>
                <option v-for="v in timeOptions" :key="'tm-'+v" :value="v">{{ v }}</option>
              </select>
            </div>
            <div class="actions-row">
              <button class="btn primary" @click="applyFilters()">应用</button>
              <button class="btn" @click="resetFilters()">重置</button>
            </div>
          </FluentCard>

          <!-- 属性 -->
          <FluentCard strong title="属性" scrollable>
            <div v-if="attrCard" class="gu-card">
              <div class="attr-header">来源：{{ attrCard.source }}</div>
              <div class="attr-body">
                <div v-for="(v,k) in attrCard.props" :key="k" class="kv">
                  <span class="k">{{ k }}</span>
                  <span class="v">{{ v }}</span>
                </div>
              </div>
            </div>
            <div v-else class="text-muted">点击地图要素查看属性。</div>
          </FluentCard>
        </div>
      </div>

      <!-- 把手（与首页一致） -->
      <button class="handle" @click="ui.toggleOpen('right')"><span>≡</span></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import TopBar from '@/components/TopBar.vue'
import FluentCard from '@/components/FluentCard.vue'
import { onMounted, onBeforeUnmount, ref, reactive, computed } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './gu.css'
import { useUIStore } from '@/stores/ui'
import { layersByMode, type LayerDef, type Mode } from './layers'

const ui = useUIStore()

const cesiumRef = ref<HTMLDivElement | null>(null)
const viewer = ref<Cesium.Viewer | null>(null)

const mode = ref<Mode>('surface')
const modeLabel = computed(() =>
  mode.value === 'surface' ? '地上' : (mode.value === 'underground' ? '地下' : '同时')
)

// 图层实例 & 可见性
const currentLayers = reactive<{ [id: string]: Cesium.GeoJsonDataSource | undefined }>({})
const localVisible = reactive<{ [id: string]: boolean }>({})

// 筛选
const filter = reactive<{ type: string; status: string; time: string }>({ type: '', status: '', time: '' })
const typeOptions = ref<string[]>([])
const statusOptions = ref<string[]>([])
const timeOptions = ref<string[]>([])

// 选中的图层列表 & 图例
const visibleLayerList = computed<LayerDef[]>(() => layersByMode(mode.value))
const legendList = computed(() => visibleLayerList.value.filter(l => (localVisible[l.id] ?? l.visible)))

// 拾取与属性
let clickHandler: Cesium.ScreenSpaceEventHandler | null = null
let lastHighlight: { kind: 'entity'; target: any } | null = null
const attrCard = ref<{ source: string; props: Record<string, any> } | null>(null)

onMounted(async () => {
  if (!cesiumRef.value) return

  viewer.value = new Cesium.Viewer(cesiumRef.value, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: true,
    fullscreenButton: true,
    sceneModePicker: true,
    navigationHelpButton: false,
    selectionIndicator: false,
    infoBox: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider()
  })

  // 更稳的底图（避免 Bing/ION 网络问题）
  try {
    const osm = new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    })
    viewer.value.imageryLayers.removeAll()
    viewer.value.imageryLayers.addImageryProvider(osm)
  } catch {}

  viewer.value.scene.globe.showGroundAtmosphere = false
  viewer.value.scene.fog.enabled = false

  // 进入场景自动固定并展开左右抽屉（与首页体验一致）
  ui.drawer.leftPinned = ui.drawer.rightPinned = true
  ui.drawer.leftOpen = ui.drawer.rightOpen = true

  await refreshLayers()

  const h = new Cesium.ScreenSpaceEventHandler(viewer.value.scene.canvas)
  clickHandler = h
  h.setInputAction(handlePick, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  viewer.value.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(116.39, 39.90, 1200),
    duration: 0.8
  })
})

onBeforeUnmount(() => {
  if (clickHandler) { clickHandler.destroy(); clickHandler = null }
  if (viewer.value) { viewer.value.destroy(); /* @ts-ignore */ viewer.value = null }
})

async function setMode(m: Mode) {
  mode.value = m
  if (!viewer.value) return
  try {
    const scene = viewer.value.scene
    scene.globe.depthTestAgainstTerrain = true
    scene.screenSpaceCameraController.enableCollisionDetection = (m !== 'underground')

    // 透明设置（不能用可选链赋值）
    const translucency: any = (scene.globe as any).translucency
    if (translucency) {
      translucency.enabled = (m !== 'surface')
      translucency.frontFaceAlpha = (m === 'surface' ? 1.0 : 0.35)
    }
  } catch (e) {
    console.warn('setMode translucent config failed:', e)
  }

  await refreshLayers()

  // 切换模式后自动固定并展开
  ui.drawer.leftPinned = ui.drawer.rightPinned = true
  ui.drawer.leftOpen = ui.drawer.rightOpen = true
}

// -------- 图层加载 --------
async function refreshLayers() {
  clearAllLayers()
  for (const l of visibleLayerList.value) await addLayer(l)
  buildFilterOptions()
}
function clearAllLayers() {
  Object.keys(currentLayers).forEach(id => {
    const ds = currentLayers[id]
    if (ds && viewer.value) viewer.value.dataSources.remove(ds, true)
    delete currentLayers[id]
  })
}
async function addLayer(layer: LayerDef) {
  if (layer.type === 'geojson') await createGeoJSON(layer)
  // TODO: tileset 类型可在此扩展
}
async function createGeoJSON(layer: LayerDef) {
  const l = layer as any
  const ds = await Cesium.GeoJsonDataSource.load(l.url, {
    clampToGround: (mode.value !== 'underground')
  })
  await viewer.value!.dataSources.add(ds)
  ds.show = (localVisible[layer.id] ?? layer.visible)

  ds.entities.values.forEach((ent: any) => {
    if (ent.polyline) {
      ent.polyline.width = 2
      ent.polyline.material = Cesium.Color.fromCssColorString(l.legendColor || '#00aaff')
    }
    if (ent.polygon) {
      ent.polygon.material = Cesium.Color.fromCssColorString(l.legendColor || '#00aaff').withAlpha(0.5)
      ent.polygon.outline = true
      ent.polygon.outlineColor = Cesium.Color.fromCssColorString('#777')
    }
    if (ent.point) {
      ent.point.pixelSize = 8
      ent.point.color = Cesium.Color.fromCssColorString(l.legendColor || '#00aaff')
      ent.point.outlineWidth = 1
      ent.point.outlineColor = Cesium.Color.fromCssColorString('#333')
    }
  })

  currentLayers[layer.id] = ds
}
function toggleLayer(layer: LayerDef) {
  const inst = currentLayers[layer.id]
  const cur = (localVisible[layer.id] ?? layer.visible)
  const next = !cur
  localVisible[layer.id] = next
  if (inst) inst.show = next
}

// -------- 筛选 --------
function buildFilterOptions() {
  const types = new Set<string>(), statuses = new Set<string>(), times = new Set<string>()
  Object.values(currentLayers).forEach((ds: any) => {
    ds?.entities?.values?.forEach((ent: any) => {
      const props = ent?.properties; if (!props) return
      const gv = (k: string) => (props?.[k]?.getValue?.(new Date()) ?? props?.[k])
      visibleLayerList.value.forEach(l => {
        if (l.filters?.typeField)   { const v = gv(l.filters.typeField);   if (v!=null) types.add(String(v)) }
        if (l.filters?.statusField) { const v = gv(l.filters.statusField); if (v!=null) statuses.add(String(v)) }
        if (l.filters?.timeField)   { const v = gv(l.filters.timeField);   if (v!=null) times.add(String(v)) }
      })
    })
  })
  typeOptions.value = Array.from(types)
  statusOptions.value = Array.from(statuses)
  timeOptions.value = Array.from(times)
}
function applyFilters() {
  Object.entries(currentLayers).forEach(([id, inst]) => {
    const l = visibleLayerList.value.find(x => x.id === id); if (!l || !inst) return
    inst.entities.values.forEach((ent: any) => {
      const props = ent?.properties
      const get = (k?: string) => k ? (props?.[k]?.getValue?.(new Date()) ?? props?.[k]) : undefined
      let ok = true
      if (filter.type   && l.filters?.typeField)   ok &&= (get(l.filters.typeField)   == filter.type)
      if (filter.status && l.filters?.statusField) ok &&= (get(l.filters.statusField) == filter.status)
      if (filter.time   && l.filters?.timeField)   ok &&= (String(get(l.filters.timeField)) == filter.time)
      ent.show = ok
    })
  })
}
function resetFilters() { filter.type = ''; filter.status = ''; filter.time = ''; applyFilters() }

// -------- 拾取与属性 --------
function clearHighlight() {
  if (!lastHighlight) return
  const ent = lastHighlight.target
  if (ent?.polygon)  ent.polygon.material  = Cesium.Color.YELLOW.withAlpha(0.6)
  if (ent?.polyline) ent.polyline.material = Cesium.Color.YELLOW
  if (ent?.point)    ent.point.color       = Cesium.Color.YELLOW
  lastHighlight = null
}
function handlePick(mv: any){
  if (!viewer.value) return
  clearHighlight(); attrCard.value = null

  const picked = viewer.value.scene.pick(mv.position)
  const ent = picked?.id
  if (!ent) return

  // -------- 友好地取值（不要用 ent.properties.getValue(k)！）--------
  const t = viewer.value.clock.currentTime
  const props: Record<string, any> = {}
  const bag: any = ent.properties

  // 先做一个“偏好字段”的白名单，命中就优先显示
  const preferred = ['name','名称','type','类型','status','状态','gid','id','area','area_m2','length','year','time','date']
  const keys: string[] =
    (bag?.propertyNames as string[] | undefined)
      ?? Object.keys(bag ?? {})

  // 将值取出来并过滤到“可读的原始类型”
  const raw: Record<string, any> = {}
  for (const k of keys) {
    const p = bag?.[k]
    let v = p?.getValue ? p.getValue(t) : p
    // 常见对象做格式化；复杂对象直接跳过，避免冗余
    if (v && typeof v === 'object') {
      if ('x' in v && 'y' in v && 'z' in v) {
        const xyz = v as {x:number;y:number;z:number}
        v = `(${xyz.x.toFixed(2)}, ${xyz.y.toFixed(2)}, ${xyz.z.toFixed(2)})`
      } else if ('red' in v && 'green' in v && 'blue' in v) {
        v = '颜色'
      } else {
        continue  // 跳过嵌套对象，避免你看到的整段 JSON 重复
      }
    }
    raw[k] = v
  }

  // 先放“偏好字段”，再补齐少量其它字段（最多 10 个）
  const result: Record<string, any> = {}
  preferred.forEach(k => { if (k in raw) result[k] = raw[k] })
  for (const k of keys) {
    if (k in result) continue
    if (Object.keys(result).length >= 10) break
    if (k in raw) result[k] = raw[k]
  }

  attrCard.value = { source: 'GeoJSON', props: result }

  // 高亮
  if (ent.polygon)  ent.polygon.material  = Cesium.Color.CYAN.withAlpha(0.6)
  if (ent.polyline) ent.polyline.material = Cesium.Color.CYAN
  if (ent.point)    ent.point.color       = Cesium.Color.CYAN
  lastHighlight = { kind: 'entity', target: ent }
}

</script>

<style scoped>
/* 页面容器：自给高度，不依赖父元素 */
.gu-scene { position: relative; width: 100%; height: 100vh; }
@supports (height: 100dvh) { .gu-scene { height: 100dvh; } }

/* Cesium 画布在底层，避免挡住 TopBar/抽屉 */
.scene-canvas { position: absolute; inset: 0; z-index: 0; }

/* 顶部模式切换条（TopBar 下方） */
.gu-toolbar {
  position: absolute; top: 68px; left: 50%; transform: translateX(-50%);
  z-index: 200; padding: 8px 12px; border-radius: 14px;
  border: 1px solid var(--panel-border, rgba(0,0,0,.08));
  box-shadow: var(--panel-shadow, 0 6px 24px rgba(0,0,0,.12));
  background: var(--panel-bg-strong, rgba(255,255,255,.72));
  backdrop-filter: saturate(1.1) blur(10px);
}
.mode-tabs { display: flex; gap: 8px; }
.tab {
  padding: 6px 12px; font-size: 13px; border-radius: 10px;
  border: 1px solid var(--panel-border, rgba(0,0,0,.08));
  background: var(--panel-bg, rgba(255,255,255,.6)); cursor: pointer;
}
.tab.active {
  background: var(--brand-weak, rgba(0,120,255,.1));
  border-color: var(--brand, #2f7cf6); color: var(--brand, #2f7cf6);
}

/* 抽屉框架：与首页一致的类名与结构 */
.drawer {
  position: absolute; top: 64px; bottom: 16px; width: 320px; max-width: 90vw;
  pointer-events: none; transition: transform .2s ease, opacity .2s ease;
}
.drawer.left  { left: 16px;  transform: translateX(-12px); }
.drawer.right { right: 16px; transform: translateX( 12px); }
.drawer.open  { transform: translateX(0); }
.drawer .drawer-inner {
  height: 100%; display: flex; flex-direction: column; pointer-events: auto;
  border: 1px solid var(--panel-border, rgba(0,0,0,.08));
  border-radius: 16px; box-shadow: var(--panel-shadow, 0 8px 28px rgba(0,0,0,.16));
  background: var(--panel-bg-strong, rgba(255,255,255,.72));
  backdrop-filter: saturate(1.1) blur(10px);
}
.drawer .drawer-header {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 10px 12px; border-bottom: 1px dashed rgba(0,0,0,.08); font-weight: 600;
}
.drawer .drawer-body { flex: 1; min-height: 0; display: flex; }

/* 把手 */
.drawer .handle {
  position: absolute; top: 50%; transform: translateY(-50%);
  border-radius: 12px; border: 1px solid var(--panel-border, rgba(0,0,0,.08));
  box-shadow: var(--panel-shadow, 0 6px 24px rgba(0,0,0,.12));
  background: var(--panel-bg, rgba(255,255,255,.85));
  padding: 6px 8px; cursor: pointer; pointer-events: auto;
}
.drawer.left .handle  { right: -12px; }
.drawer.right .handle { left:  -12px; }

/* 卡片栈：与首页侧栏观感一致 */
.card-stack {
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

/* 内容风格（延续你之前的） */
.pane-scroll { max-height: none; overflow: auto; }

.layer-item + .layer-item { margin-top: 8px; }
.layer-row {
  display: grid; grid-template-columns: 20px 1fr 14px;
  align-items: center; gap: 8px; padding: 6px 4px; border-radius: 8px;
}
.layer-row:hover { background: rgba(0,0,0,.04); }
.layer-row .name { font-size: 13px; }
.badge, .swatch {
  width: 14px; height: 14px; border-radius: 4px; border: 1px solid rgba(0,0,0,.1);
}

.legend-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px 12px; }
.legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: rgba(0,0,0,.7); }

.form-row { display: grid; grid-template-columns: 64px 1fr; gap: 8px; align-items: center; margin-bottom: 10px; }
.form-row label { font-size: 12px; color: rgba(0,0,0,.7); }
.form-row select { padding: 6px 8px; border-radius: 8px; border: 1px solid var(--panel-border, rgba(0,0,0,.12)); background: #fff; }

.actions-row { display: flex; gap: 8px; margin-top: 4px; }
.btn { padding: 6px 12px; border-radius: 10px; border: 1px solid var(--panel-border, rgba(0,0,0,.12)); background: var(--panel-bg, rgba(255,255,255,.8)); cursor: pointer; }
.btn.primary { background: var(--brand, #2f7cf6); border-color: var(--brand, #2f7cf6); color: #fff; }

.gu-card { border: 1px solid var(--panel-border, rgba(0,0,0,.08)); border-radius: 12px; padding: 8px; background: var(--panel-bg, rgba(255,255,255,.85)); box-shadow: var(--panel-shadow, 0 6px 24px rgba(0,0,0,.12)); }
.attr-header { font-weight: 600; margin-bottom: 8px; }
.kv { display: grid; grid-template-columns: 120px 1fr; gap: 8px; padding: 4px 0; }
.k { color: rgba(0,0,0,.65); font-size: 12px; }
.v { color: rgba(0,0,0,.9);  font-size: 12px; }
.text-muted { color: rgba(0,0,0,.6); font-size: 12px; padding: 8px; }
/* ======= 场景页的“可读性加强” ======= */

/* 抽屉正文字号统一放大，行距更松 */
.drawer .drawer-body { font-size: 14px; line-height: 1.6; }

/* 卡片标题/正文的文字颜色更亮 */
.fluent-acrylic-strong,
.fluent-acrylic-strong * {
  color: var(--text-1);
}

/* 次要文字（说明/图例项）稍弱，但仍可读 */
.legend-item, .layer-row .name, label, .text-muted {
  color: var(--text-2);
}

/* 选择框与输入的前景/背景，避免黑字 */
select, input, textarea {
  color: var(--text-1);
  background: rgba(0,0,0,.24);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
}
select:focus, input:focus, textarea:focus {
  outline: none;
  border-color: var(--brand);
}

/* 一些浏览器里 <option> 默认黑字，这里强制一下 */
select option { color: var(--text-1); background: #0A1624; }

/* 属性卡的键/值字号 & 颜色 */
.k { color: var(--text-2); font-size: 13px; }
.v { color: var(--text-1); font-size: 13px; }

/* 顶部模式切换按钮在暗底上更显眼 */
.tab { color: var(--text-1); }
.tab.active {
  background: var(--brand-weak);
  border-color: var(--brand);
  color: var(--brand);
}

</style>
