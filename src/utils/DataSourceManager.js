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

      const geojson = await response.json()
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
              
              const entity = dataSource.entities.add({
                name: feature.properties?.设施名 || config.name || id,
                polylineVolume: {
                  positions: positions,
                  shape: this.createPipeShape(config.diameter || 10),
                  material: Cesium.Color.fromCssColorString(config.color || '#00ffff').withAlpha(0.8),
                  outline: true,
                  outlineColor: Cesium.Color.fromCssColorString(config.color || '#00ffff')
                },
                properties: feature.properties || {}
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