import * as Cesium from 'cesium'
// 复用已有的数值/管径/埋深解析函数，删除本文件重复实现
import { parseDiameterMeters, parseDepthMeters } from './NumberUtils.js'

/**
 * 统一的 3D 数据源管理器
 * 负责管理 3D Tileset、GeoJSON、管线数据等各种数据源
 */

export class DataSourceManager {
  constructor(viewer) {
    this.viewer = viewer
    this.dataSources = new Map()
    this.tilesets = new Map()
    this.models = new Map()
    this.loading = new Set()
  }

  /**
   * 加载 3D Tileset
   * @param {string} id - 数据源唯一标识
   * @param {string} url - Tileset URL
   * @param {Object} options - 选项
   */
  async load3DTileset(id, url, options = {}) {
    if (this.loading.has(id)) {
      console.warn(`数据源 ${id} 正在加载中`)
      return null
    }

    if (this.tilesets.has(id)) {
      console.warn(`数据源 ${id} 已存在`)
      return this.tilesets.get(id)
    }

    try {
      this.loading.add(id)
      console.log(`开始加载 3D Tileset: ${id}`)

      const tileset = await Cesium.Cesium3DTileset.fromUrl(url, options)
      
      // 应用选项
      if (options.modelMatrix) {
        tileset.modelMatrix = options.modelMatrix
      }
      
      if (options.maximumScreenSpaceError) {
        tileset.maximumScreenSpaceError = options.maximumScreenSpaceError
      }

      if (options.style) {
        tileset.style = options.style
      }

      if (options.show !== undefined) {
        tileset.show = options.show
      }

      this.viewer.scene.primitives.add(tileset)
      this.tilesets.set(id, tileset)
      
      console.log(`3D Tileset ${id} 加载完成`)
      return tileset
      
    } catch (error) {
      console.error(`加载 3D Tileset ${id} 失败:`, error)
      throw error
    } finally {
      this.loading.delete(id)
    }
  }

  /**
   * 加载 glTF/GLB 模型（由 OBJ 转换而来）
   * @param {string} id 模型唯一标识
   * @param {string} url glTF/GLB 资源 URL（需位于 public/ 下）
   * @param {object} options 额外选项：scale、modelMatrix、position、hpr、color 等
   */
  async loadModel(id, url, options = {}) {
    if (this.loading.has(id)) {
      console.warn(`模型 ${id} 正在加载中`)
      return null
    }

    if (this.models.has(id)) {
      console.warn(`模型 ${id} 已存在`)
      return this.models.get(id)
    }

    const buildModelMatrix = () => {
      if (options.modelMatrix) return options.modelMatrix
      if (options.position) {
        const [lon, lat, height = 0] = options.position
        const hprDegrees = options.headingPitchRollDegrees || [0, 0, 0]
        const hpr = new Cesium.HeadingPitchRoll(
          Cesium.Math.toRadians(hprDegrees[0] || 0),
          Cesium.Math.toRadians(hprDegrees[1] || 0),
          Cesium.Math.toRadians(hprDegrees[2] || 0)
        )
        return Cesium.Transforms.headingPitchRollToFixedFrame(
          Cesium.Cartesian3.fromDegrees(lon, lat, height),
          hpr
        )
      }
      return Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY, new Cesium.Matrix4())
    }

    try {
      this.loading.add(id)
      console.log(`开始加载模型: ${id}`)

      const modelOptions = {
        url,
        modelMatrix: buildModelMatrix(),
        scale: options.scale ?? 1,
        minimumPixelSize: options.minimumPixelSize,
        maximumScale: options.maximumScale,
        allowPicking: options.allowPicking !== false,
        color: options.color ? Cesium.Color.fromCssColorString(options.color) : undefined
      }

      let model
      if (typeof Cesium.Model.fromGltfAsync === 'function') {
        model = await Cesium.Model.fromGltfAsync(modelOptions)
      } else if (typeof Cesium.Model.fromGltf === 'function') {
        model = Cesium.Model.fromGltf(modelOptions)
        await model.readyPromise
      } else {
        throw new Error('当前 Cesium 版本不支持 Model.fromGltf / Model.fromGltfAsync API')
      }

      this.viewer.scene.primitives.add(model)
      if (typeof model.readyPromise?.then === 'function') {
        await model.readyPromise
      }

      this.models.set(id, model)
      console.log(`模型 ${id} 加载完成`)
      return model

    } catch (error) {
      console.error(`加载模型 ${id} 失败:`, error)
      throw error
    } finally {
      this.loading.delete(id)
    }
  }

  /**
   * 加载 GeoJSON 数据源
   * @param {string} id - 数据源唯一标识
   * @param {string} url - GeoJSON URL
   * @param {Object} options - 选项
   */
  async loadGeoJSON(id, url, options = {}) {
    if (this.loading.has(id)) {
      console.warn(`数据源 ${id} 正在加载中`)
      return null
    }

    if (this.dataSources.has(id)) {
      console.warn(`数据源 ${id} 已存在`)
      return this.dataSources.get(id)
    }

    try {
      this.loading.add(id)
      console.log(`开始加载 GeoJSON: ${id}`)

      const dataSource = await Cesium.GeoJsonDataSource.load(url, {
        clampToGround: options.clampToGround !== false,
        ...options
      })

      // 应用样式
      if (options.styleFunction) {
        dataSource.entities.values.forEach(options.styleFunction)
      }

      await this.viewer.dataSources.add(dataSource)
      this.dataSources.set(id, dataSource)
      
      console.log(`GeoJSON ${id} 加载完成`)
      return dataSource
      
    } catch (error) {
      console.error(`加载 GeoJSON ${id} 失败:`, error)
      throw error
    } finally {
      this.loading.delete(id)
    }
  }

  /**
   * 加载管线数据
   * @param {string} id - 数据源唯一标识
   * @param {string} url - 管线数据 URL
   * @param {Object} config - 管线配置
   */
  async loadPipelineData(id, url, config = {}) {
    if (this.loading.has(id)) {
      console.warn(`管线数据源 ${id} 正在加载中`)
      return null
    }

    if (this.dataSources.has(id)) {
      console.warn(`管线数据源 ${id} 已存在`)
      return this.dataSources.get(id)
    }

    try {
      this.loading.add(id)
      console.log(`开始加载管线数据: ${id}`)

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // 使用 TextDecoder 提升中文与 BOM 兼容性
      const arrayBuffer = await response.arrayBuffer()
      const text = new TextDecoder('utf-8').decode(arrayBuffer)
      const geojson = JSON.parse(text)
      const dataSource = new Cesium.CustomDataSource(config.name || id)
      const entities = []

      if (geojson.features) {
        geojson.features.forEach((feature) => {
          if (feature.geometry && feature.geometry.type === 'LineString') {
            const coords = feature.geometry.coordinates
            if (coords.length >= 2) {
              const positions = coords.map(coord => 
                Cesium.Cartesian3.fromDegrees(coord[0], coord[1], -config.depth || 0)
              )
              
              // 提取与规范化属性，用于后续显示与图例
              const properties = {}
              const propertiesRaw = feature.properties || {}
              Object.keys(propertiesRaw).forEach((k) => {
                const v = propertiesRaw[k]
                properties[k] = v != null ? String(v) : '(无数据)'
              })

              // 解析直径与起/终埋深（单位尽量转为米），提供合理兜底
              const diameterMeters = parseDiameterMeters(properties, propertiesRaw, config.diameter)
              const startDepth = parseDepthMeters(properties, ['起点埋', '起点埋深', 'startDepth', 'StartDepth'], config.depth)
              const endDepth = parseDepthMeters(properties, ['终点埋', '终点埋深', 'endDepth', 'EndDepth'], config.depth)

              // 依据起终埋深对沿线位置进行线性插值，得到地下位置序列
              const undergroundPositions = computeUndergroundPositions(
                positions,
                startDepth,
                endDepth
              )

              const entity = dataSource.entities.add({
                name: properties['设施名'] || config.name || id,
                polylineVolume: {
                  positions: undergroundPositions,
                  shape: this.createPipeShape(diameterMeters),
                  material: Cesium.Color.fromCssColorString(config.color || '#00ffff').withAlpha(0.8),
                  outline: true,
                  outlineColor: Cesium.Color.fromCssColorString(config.color || '#00ffff')
                },
                // 存储规范化属性，便于 InfoBox 与后续分析使用
                properties,
                description: createPropertyDescription(properties)
              })
              
              entities.push(entity)
            }
          }
        })
      }

      await this.viewer.dataSources.add(dataSource)
      this.dataSources.set(id, { dataSource, entities, config })
      
      console.log(`管线数据 ${id} 加载完成，共 ${entities.length} 个实体`)
      return { dataSource, entities, config }
      
    } catch (error) {
      console.error(`加载管线数据 ${id} 失败:`, error)
      throw error
    } finally {
      this.loading.delete(id)
    }
  }

  /**
   * 创建管线截面形状
   */
  createPipeShape(diameter) {
    const radius = diameter / 2
    const positions = []
    const numPoints = 12
    
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI
      positions.push(new Cesium.Cartesian2(radius * Math.cos(angle), radius * Math.sin(angle)))
    }
    
    return positions
  }

  // 注意：以下辅助函数为文件内使用的纯函数实现，放置在类外更合适；
  // 但为避免改动导出结构，这里内联定义为文件级函数（见文末）。

  /**
   * 批量加载预定义数据源
   */
  async loadPredefinedDataSources() {
    // 优先尝试使用增强后的仓库 GeoJSON (包含 vendors ID 列表)
    let warehouseUrl = '/Assets/data/geojson/仓库.json'
    try {
      // 运行时探测 public/data/warehouse-with-vendors.geojson 是否存在
      const resp = await fetch('/data/warehouse-with-vendors.geojson', { method: 'HEAD' })
      if (resp.ok) {
        warehouseUrl = '/data/warehouse-with-vendors.geojson'
        console.info('[DataSourceManager] 使用增强仓库数据源:', warehouseUrl)
      } else {
        console.info('[DataSourceManager] 增强仓库数据不存在，使用默认:', warehouseUrl)
      }
    } catch { /* 忽略，使用默认 */ }

    const configs = [
      // 基础 3D Tileset
      {
        type: '3dtileset',
        id: 'osgb',
        url: '/Assets/data/osgb/tileset.json',
        options: {
          maximumScreenSpaceError: 12
        }
      },
      {
        type: 'model',
        id: 'factory-base',
        url: '/Assets/data/factoryOBJ/factory.glb',
        options: {
          position: [118.229307, 35.106653, 0],
          headingPitchRollDegrees: [180, 0, 0],
          scale: 1
        }
      },
      // 注：移除 factory-roof 与 office-building 加载，统一采用 factory-base 模型进行平移动画降级
      // GeoJSON 数据
      {
        type: 'geojson',
        id: 'warehouse',
        url: warehouseUrl,
        options: {
          styleFunction: (entity) => {
            if (entity.polygon) {
              entity.polygon.classificationType = Cesium.ClassificationType.CESIUM_3D_TILE
              entity.polygon.material = Cesium.Color.fromCssColorString('rgba(0,255,255,0.01)')
              entity.polygon.outline = false
            }
          }
        }
      },
      // 管线数据
      {
        type: 'pipeline',
        id: 'water-pipe',
        url: '/Assets/data/json/JPLN_Project_FeaturesToJSON.json',
        config: {
          name: '配水管线',
          color: '#00ffff',
          depth: 5,
          diameter: 20
        }
      },
      {
        type: 'pipeline',
        id: 'tv-cable',
        url: '/Assets/data/json/DSLN_Project_FeaturesToJSON.json',
        config: {
          name: '电视管线',
          color: '#00ff00',
          depth: 10,
          diameter: 10
        }
      },
      {
        type: 'pipeline',
        id: 'gas',
        url: '/Assets/data/json/TRLN_Project_FeaturesToJSON.json',
        config: {
          name: '天然气管线',
          color: '#ff00ff',
          depth: 25,
          diameter: 15
        }
      },
      {
        type: 'pipeline',
        id: 'sewage',
        url: '/Assets/data/json/WSLN_Project_FeaturesToJSON.json',
        config: {
          name: '污水管线',
          color: '#4c3926',
          depth: 8,
          diameter: 18
        }
      },
      {
        type: 'pipeline',
        id: 'rainwater',
        url: '/Assets/data/json/YSLN_Project1_FeaturesToJSON.json',
        config: {
          name: '雨水管线',
          color: '#4c3926',
          depth: 6,
          diameter: 16
        }
      },
      {
        type: 'pipeline',
        id: 'heating',
        url: '/Assets/data/json/RSLN_Project1_FeaturesToJSON1.json',
        config: {
          name: '热水管线',
          color: '#ff8000',
          depth: 12,
          diameter: 14
        }
      },
      {
        type: 'pipeline',
        id: 'power',
        url: '/Assets/data/json/GDLN_Project1_FeaturesToJSON.json',
        config: {
          name: '供电管线',
          color: '#ff0000',
          depth: 15,
          diameter: 12
        }
      },
      {
        type: 'pipeline',
        id: 'street-light',
        url: '/Assets/data/json/LDLN_Project_FeaturesToJSON.json',
        config: {
          name: '路灯管线',
          color: '#ff0000',
          depth: 18,
          diameter: 10
        }
      }
    ]

    const results = new Map()

    // 并发加载所有数据源
    const loadPromises = configs.map(async (config) => {
      try {
        let result = null
        
        switch (config.type) {
          case '3dtileset':
            result = await this.load3DTileset(config.id, config.url, config.options)
            break
          case 'model':
            result = await this.loadModel(config.id, config.url, config.options)
            break
          case 'geojson':
            result = await this.loadGeoJSON(config.id, config.url, config.options)
            break
          case 'pipeline':
            result = await this.loadPipelineData(config.id, config.url, config.config)
            break
        }
        
        if (result) {
          results.set(config.id, { type: config.type, data: result, config })
        }
        
      } catch (error) {
        console.warn(`加载数据源 ${config.id} 失败:`, error.message)
      }
    })

    await Promise.all(loadPromises)
    console.log(`数据源加载完成，成功加载 ${results.size}/${configs.length} 个数据源`)
    
    return results
  }

  /**
   * 装饰仓库(分拣中心)多边形：
   *  1. 解析 CSV (按“分拣中心”分组)
   *  2. 根据 FID 分组推测分拣中心名称 (fidGroupSize)
   *  3. 为每个 polygon 设置 description (即便无匹配也写入“暂无数据”)
   *  4. 返回元数据数组，包含 fid / 组名 / 行数 / 经纬度 / entity 引用
   * @param {Object} opt
   * @param {string} opt.id GeoJSON 数据源 id (默认 warehouse)
   * @param {string} opt.csvUrl CSV 地址
   * @param {number} opt.fidGroupSize FID 分组跨度，用来推测 “X号 分拣”
   * @param {boolean} opt.forceReload 是否强制重新解析 CSV
   */
  async decorateWarehousesFromCSV(opt = {}) {
    const { id = 'warehouse', csvUrl = '/data/warehouse-centers.csv', fidGroupSize = 120, forceReload = false } = opt
    const ds = this.getDataSource(id)
    if (!ds) {
      console.warn('[decorateWarehousesFromCSV] 数据源未找到:', id)
      return []
    }
    // 兼容 dataSources.get(id) 返回对象结构 {dataSource,...}
    const dataSource = ds.dataSource || ds
    const entities = dataSource.entities?.values || []

    // 简单缓存
    if (!forceReload && this.__warehouseMetaCache) return this.__warehouseMetaCache

    let groupMap = new Map()
    try {
      const text = await (await fetch(csvUrl)).text()
      groupMap = parseWarehouseCSV(text)
    } catch (e) {
      console.warn('[decorateWarehousesFromCSV] CSV 加载失败, 仅生成基础信息', e)
    }

  const meta = []
  const miss = []
    entities.forEach(ent => {
      if (!ent.polygon) return
      const fid = ent.properties?.FID?.getValue?.(Cesium.JulianDate.now()) ?? ent.properties?.FID ?? null
      if (fid == null) return
      const groupName = buildGroupNameByFid(fid, fidGroupSize)
      const normalizedGroupName = (function norm(n){
        if (!n) return n
        let k = n.replace(/\s+/g,'')
        k = k.replace(/分拣中心|分拣|中心/g,'中心')
        const m = /^(\d+)号?/.exec(k)
        if (m && !k.includes('中心')) k = m[1] + '号中心'
        return k
      })(groupName)
      let rows = groupMap.get(normalizedGroupName)
      if (!rows) {
        const m = /^(\d+)/.exec(groupName)
        if (m) {
          const num = m[1]
          for (const key of groupMap.keys()) {
            if (key.startsWith(num)) { rows = groupMap.get(key); break }
          }
          if (!rows) {
            for (const key of groupMap.keys()) {
              if (key.includes(num + '号')) { rows = groupMap.get(key); break }
            }
          }
        }
      }
      // 计算简单质心
      const centroid = computeEntityCentroid(ent)
      const html = buildWarehouseDescription(groupName, rows)
      ent.description = html
      const item = {
        fid,
        groupName,
        rowCount: rows ? rows.length : 0,
        lon: centroid?.lon,
        lat: centroid?.lat,
        entity: ent,
        routes: rows || []
      }
      if (!rows || rows.length === 0) miss.push(fid)
      meta.push(item)
    })
    console.info('[decorateWarehousesFromCSV] 完成, 数量:', meta.length, '未匹配:', miss.length)
    if (miss.length) {
      console.info('[decorateWarehousesFromCSV] 未匹配FID列表(前50):', miss.slice(0,50).join(','))
    }
    this.__warehouseMetaCache = meta
    return meta
  }

  /**
   * 获取数据源
   */
  getDataSource(id) {
    return this.models.get(id) || this.tilesets.get(id) || this.dataSources.get(id)
  }

  /**
   * 获取所有管线数据源
   */
  getPipelineDataSources() {
    const pipelines = new Map()
    this.dataSources.forEach((value, key) => {
      if (value.config && value.config.name) {
        pipelines.set(key, value)
      }
    })
    return pipelines
  }

  /**
   * 切换数据源显示状态
   */
  toggleDataSource(id, visible) {
    const dataSource = this.getDataSource(id)
    if (dataSource) {
      if (dataSource.show !== undefined) {
        dataSource.show = visible
      } else if (dataSource.dataSource) {
        dataSource.dataSource.show = visible
      }
      return
    }

    const model = this.models.get(id)
    if (model) model.show = visible
  }

  /**
   * 移除数据源
   */
  removeDataSource(id) {
    const tileset = this.tilesets.get(id)
    if (tileset) {
      this.viewer.scene.primitives.remove(tileset)
      this.tilesets.delete(id)
      return true
    }

    const dataSourceData = this.dataSources.get(id)
    if (dataSourceData) {
      const dataSource = dataSourceData.dataSource || dataSourceData
      this.viewer.dataSources.remove(dataSource)
      this.dataSources.delete(id)
      return true
    }

    const model = this.models.get(id)
    if (model) {
      this.viewer.scene.primitives.remove(model)
      this.models.delete(id)
      return true
    }

    return false
  }

  /**
   * 清理所有数据源
   */
  destroy() {
    // 清理 Tilesets
    this.tilesets.forEach((tileset) => {
      this.viewer.scene.primitives.remove(tileset)
    })
    this.tilesets.clear()

    // 清理 DataSources
    this.dataSources.forEach((dataSourceData) => {
      const dataSource = dataSourceData.dataSource || dataSourceData
      this.viewer.dataSources.remove(dataSource)
    })
    this.dataSources.clear()

    this.models.forEach((model) => {
      this.viewer.scene.primitives.remove(model)
    })
    this.models.clear()

    this.loading.clear()
    console.log('数据源管理器已清理')
  }
}

// ====== 仓库 CSV 解析与描述构建辅助 ======
function parseWarehouseCSV(text) {
  const map = new Map()
  if (!text) return map
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return map
  const header = lines.shift().split(',').map(h => h.trim())
  const alias = (raw) => {
    if (!raw) return raw
    let k = raw.trim()
    k = k.replace(/\s+/g, '')
    k = k.replace(/分拣中心|分拣|中心/g, '中心')
    const m = /^(\d+)号?/.exec(k)
    if (m && !k.includes('中心')) k = m[1] + '号中心'
    return k
  }
  lines.forEach(line => {
    const cols = line.split(',')
    const obj = {}
    header.forEach((h, i) => { obj[h] = (cols[i] || '').trim() })
    const key = alias(obj['分拣中心'])
    if (!key) return
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(obj)
  })
  return map
}

// 显式 FID 区间映射（优先）
const EXPLICIT_FID_RANGES = [
  { min: 0,   max: 33,  name: '2号中心' },
  { min: 34,  max: 67,  name: '4号中心' },
  { min: 68,  max: 101, name: '6号中心' },
  { min: 102, max: 135, name: '8号中心' },
  { min: 136, max: 177, name: '1号中心' },
  { min: 178, max: 219, name: '3号中心' },
  { min: 220, max: 257, name: '5号中心' },
  { min: 258, max: 289, name: '7号中心' },
  { min: 290, max: 315, name: '10号中心' },
  { min: 316, max: 349, name: '9号中心' },
  { min: 350, max: 375, name: '12号中心' },
  { min: 376, max: 401, name: '11号中心' }
]
function buildGroupNameByFid(fid, size) {
  if (!Number.isFinite(fid) || fid < 0) return '未知中心'
  const hit = EXPLICIT_FID_RANGES.find(r => fid >= r.min && fid <= r.max)
  if (hit) return hit.name
  const idx = Math.floor(fid / size) + 1
  return `${idx}号中心(待定)`
}

function buildWarehouseDescription(centerName, rows) {
  if (rows && rows.length) {
    const trs = rows.map(r => `<tr><td>${r['序号']||''}</td><td>${r['物流']||''}</td><td>${r['线路/目的地']||''}</td><td>${r['电话']||''}</td></tr>`).join('')
    return `
    <div style="font-family:Arial;font-size:13px;">
      <h3 style="margin:4px 0 8px;">${centerName}</h3>
      <table style="border-collapse:collapse;width:100%;">
        <thead><tr style="background:#2c3e50;color:#fff;">
          <th style="border:1px solid #ccc;padding:4px;">序号</th>
          <th style="border:1px solid #ccc;padding:4px;">物流</th>
          <th style="border:1px solid #ccc;padding:4px;">线路/目的地</th>
          <th style="border:1px solid #ccc;padding:4px;">电话</th>
        </tr></thead>
        <tbody>${trs}</tbody>
      </table>
      <p style="margin-top:6px;color:#666;">共 ${rows.length} 条线路</p>
    </div>`
  }
  return `<div style="font-family:Arial;font-size:13px;"><h3 style="margin:4px 0 8px;">${centerName}</h3><p style="color:#999;">暂无匹配 CSV 数据，可调整分组规则或补充名称映射。</p></div>`
}

function computeEntityCentroid(entity) {
  try {
    const hierarchy = entity.polygon.hierarchy.getValue?.(Cesium.JulianDate.now()) || entity.polygon.hierarchy
    const positions = hierarchy.positions || hierarchy
    if (!positions || !positions.length) return null
    let sx=0, sy=0, sz=0
    positions.forEach(p => { sx+=p.x; sy+=p.y; sz+=p.z })
    const cx = sx / positions.length
    const cy = sy / positions.length
    const cz = sz / positions.length
    const cart = new Cesium.Cartesian3(cx, cy, cz)
    const carto = Cesium.Cartographic.fromCartesian(cart)
    return { lon: Cesium.Math.toDegrees(carto.longitude), lat: Cesium.Math.toDegrees(carto.latitude), cartesian: cart }
  } catch (e) { return null }
}

// —— 属性解析与几何辅助（去除重复：parseDiameterMeters / parseDepthMeters 已使用 NumberUtils 导入）——

function computeUndergroundPositions(positions, startDepthM, endDepthM) {
  if (!Array.isArray(positions) || positions.length === 0) return positions
  const cartos = positions.map((p) => Cesium.Cartographic.fromCartesian(p))
  let total = 0
  const seg = []
  for (let i = 1; i < cartos.length; i++) {
    const g = new Cesium.EllipsoidGeodesic(cartos[i - 1], cartos[i])
    const d = g.surfaceDistance || 0
    seg.push(d)
    total += d
  }
  if (total === 0) {
    return cartos.map((c) => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, (c.height || 0) - startDepthM))
  }
  let acc = 0
  const underground = [
    (function first() {
      const c = cartos[0]
      const depth = startDepthM
      return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, (c.height || 0) - depth)
    })(),
  ]
  for (let i = 1; i < cartos.length; i++) {
    acc += seg[i - 1]
    const t = acc / total
    const depth = startDepthM + (endDepthM - startDepthM) * t
    const c = cartos[i]
    underground.push(Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, (c.height || 0) - depth))
  }
  return underground
}

function createPropertyDescription(properties) {
  let html = `
    <div style="
      color: #000000;
      font-size: 14px;
      max-height: 400px;
      overflow-y: auto;
      padding: 10px;
      background: #ffffff;
      border-radius: 5px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    ">
      <h3 style="
        margin: 0 0 15px 0;
        color: #2c3e50;
        border-bottom: 2px solid #3498db;
        padding-bottom: 8px;
        font-size: 16px;
      ">
        管线属性信息
      </h3>
      <table style="
        width: 100%;
        border-collapse: collapse;
        font-family: Arial, sans-serif;
        color: #000000;
      ">
  `
  Object.entries(properties).forEach(([key, value]) => {
    html += `
      <tr>
        <th style="
          text-align: left;
          padding: 8px;
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          width: 30%;
          color: #000000;
          word-break: break-word;
          white-space: normal;
          overflow-wrap: anywhere;
        ">${key}</th>
        <td style="
          padding: 8px;
          border: 1px solid #dee2e6;
          word-break: break-word;
          white-space: normal;
          overflow-wrap: anywhere;
          color: #000000;
        ">${value}</td>
      </tr>`
  })
  html += `</table></div>`
  return html
}