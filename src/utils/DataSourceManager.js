import * as Cesium from 'cesium'

/**
 * 统一的 3D 数据源管理器
 * 负责管理 3D Tileset、GeoJSON、管线数据等各种数据源
 */

export class DataSourceManager {
  constructor(viewer) {
    this.viewer = viewer
    this.dataSources = new Map()
    this.tilesets = new Map()
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
        type: '3dtileset',
        id: 'ck',
        url: '/Assets/data/ck/tileset.json',
        options: {
          classificationType: Cesium.ClassificationType.CESIUM_3D_TILE,
          modelMatrix: Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, 135)),
          maximumScreenSpaceError: 12
        }
      },
      // GeoJSON 数据
      {
        type: 'geojson',
        id: 'warehouse',
        url: '/Assets/data/geojson/仓库.json',
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
        id: 'communication',
        url: '/Assets/data/json/TXLN_Project4_FeaturesToJSON.json',
        config: {
          name: '通信管线',
          color: '#00ff00',
          depth: 7,
          diameter: 8
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
   * 获取数据源
   */
  getDataSource(id) {
    return this.dataSources.get(id) || this.tilesets.get(id)
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
    }
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

    this.loading.clear()
    console.log('数据源管理器已清理')
  }
}

// —— 属性解析与几何辅助（从外部仓库提炼并适配）——
function parseNumberLike(value) {
  if (value == null) return NaN
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const sanitized = trimmed
      .replace(/毫米|mm/gi, '')
      .replace(/厘米|cm/gi, '')
      .replace(/米|m/gi, '')
      .replace(/长度|管径|直径|起点埋|终点埋|口径|DN/gi, '')
      .replace(/[：:]/g, '')
      .replace(/[^0-9+\-.]/g, '')
      .trim()
    const n = Number(sanitized)
    return Number.isFinite(n) ? n : NaN
  }
  return NaN
}

function getNumericProperty(properties, candidateKeys, defaultValue, transformFn) {
  for (let i = 0; i < candidateKeys.length; i++) {
    const key = candidateKeys[i]
    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      const raw = properties[key]
      let num = parseNumberLike(raw)
      if (!Number.isFinite(num)) continue
      if (typeof transformFn === 'function') {
        num = transformFn(num, raw)
      }
      return num
    }
  }
  return defaultValue
}

function parseDiameterMeters(properties, propertiesRaw, fallbackRaw) {
  const candidateKeys = ['管径', '直径', '口径', 'diameter', 'Diameter', 'DIAMETER']
  const val = getNumericProperty(properties, candidateKeys, undefined)

  let fallbackMeters = 0.2 // 安全默认 20cm
  if (Number.isFinite(fallbackRaw)) {
    if (fallbackRaw > 50) fallbackMeters = fallbackRaw / 1000 // mm→m
    else if (fallbackRaw > 5) fallbackMeters = fallbackRaw / 100 // cm→m
    else fallbackMeters = fallbackRaw // m
  }

  let primaryFromRaw = undefined
  let rawUnitHint = ''
  for (const k of candidateKeys) {
    const raw = propertiesRaw && propertiesRaw[k]
    if (typeof raw === 'string') {
      rawUnitHint += raw
      const matches = raw.match(/\d+(?:\.\d+)?/g)
      if (matches && matches.length > 0) {
        primaryFromRaw = Number(matches[0])
        break
      }
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      primaryFromRaw = raw
      break
    }
  }

  const base = Number.isFinite(primaryFromRaw) ? primaryFromRaw : val
  if (!Number.isFinite(base)) return fallbackMeters

  let meters = base
  for (const k of candidateKeys) {
    const raw = propertiesRaw && propertiesRaw[k]
    if (typeof raw === 'string' && /DN\s*\d+/i.test(raw)) {
      meters = base / 1000
      break
    }
  }
  if (/mm/i.test(rawUnitHint) || meters > 50) meters /= 1000
  else if (/cm/i.test(rawUnitHint) || meters > 5) meters /= 100
  meters = Math.min(Math.max(meters, 0.02), 2.0)
  return meters
}

function parseDepthMeters(properties, candidateKeys, fallbackMeters = 1) {
  const val = getNumericProperty(properties, candidateKeys, undefined)
  if (val == null) return fallbackMeters
  if (!Number.isFinite(val)) return fallbackMeters
  if (val > 50) return val / 1000 // 毫米 → 米
  if (val > 5) return val / 100 // 厘米 → 米
  return val
}

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