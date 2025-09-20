/**
 * Cesium相关的公共工具函数
 */

/**
 * 安全获取实体集合
 * @param {Cesium.DataSource} dataSource - 数据源
 * @returns {Array} 实体数组
 */
export function safeGetEntities(dataSource) {
  if (!dataSource || !dataSource.entities) {
    return [];
  }
  return dataSource.entities.values || [];
}

/**
 * 安全获取属性名列表
 * @param {Cesium.Entity} entity - 实体对象
 * @returns {Array} 属性名数组
 */
export function safeGetPropertyNames(entity) {
  if (!entity || !entity.properties) {
    return [];
  }
  
  const propertyNames = entity.properties.propertyNames || Object.keys(entity.properties);
  return Array.isArray(propertyNames) ? propertyNames : [];
}

/**
 * 安全获取实体位置
 * @param {Cesium.Entity} entity - 实体对象
 * @param {Cesium.JulianDate} time - 时间
 * @returns {Array|null} 位置数组或null
 */
export function safeGetEntityPositions(entity, time = null) {
  if (!entity || !entity.polyline || !entity.polyline.positions) {
    return null;
  }
  
  const currentTime = time || Cesium.JulianDate.now();
  const positions = entity.polyline.positions.getValue(currentTime);
  
  return Array.isArray(positions) && positions.length > 0 ? positions : null;
}

/**
 * 安全获取实体的polylineVolume位置
 * @param {Cesium.Entity} entity - 实体对象 
 * @param {Cesium.JulianDate} time - 时间
 * @returns {Array|null} 位置数组或null
 */
export function safeGetVolumePositions(entity, time = null) {
  if (!entity || !entity.polylineVolume || !entity.polylineVolume.positions) {
    return null;
  }
  
  const currentTime = time || Cesium.JulianDate.now();
  const positions = entity.polylineVolume.positions.getValue(currentTime);
  
  return Array.isArray(positions) && positions.length > 0 ? positions : null;
}

/**
 * 提取实体属性
 * @param {Cesium.Entity} entity - 实体对象
 * @param {Cesium.JulianDate} time - 时间
 * @returns {Object} 包含properties和propertiesRaw的对象
 */
export function extractEntityProperties(entity, time = null) {
  const properties = {};
  const propertiesRaw = {};
  
  if (!entity || !entity.properties) {
    return { properties, propertiesRaw };
  }
  
  const currentTime = time || Cesium.JulianDate.now();
  const propertyNames = safeGetPropertyNames(entity);
  
  propertyNames.forEach(name => {
    try {
      let value = entity.properties[name];
      if (value && typeof value.getValue === 'function') {
        value = value.getValue(currentTime);
      }
      propertiesRaw[name] = value;
      properties[name] = value != null ? value.toString() : '(无数据)';
    } catch (error) {
      console.warn(`获取属性 ${name} 失败:`, error);
      properties[name] = '(获取失败)';
      propertiesRaw[name] = null;
    }
  });
  
  return { properties, propertiesRaw };
}

/**
 * 检查viewer是否有效且未销毁
 * @param {Cesium.Viewer} viewer - Cesium viewer实例
 * @returns {boolean} 是否有效
 */
export function isViewerValid(viewer) {
  return viewer && !viewer.isDestroyed();
}

/**
 * 安全执行数据源相关操作
 * @param {Cesium.Viewer} viewer - Cesium viewer实例
 * @param {Function} callback - 回调函数，接收viewer作为参数
 * @returns {*} 回调函数的返回值，或null如果viewer无效
 */
export function safeExecuteWithViewer(viewer, callback) {
  if (!isViewerValid(viewer)) {
    console.warn('Viewer无效或已销毁，跳过操作');
    return null;
  }
  
  try {
    return callback(viewer);
  } catch (error) {
    console.error('执行Viewer操作时发生错误:', error);
    return null;
  }
}

/**
 * 创建安全的实体遍历器
 * @param {Cesium.Viewer} viewer - Cesium viewer实例
 * @param {Function} entityProcessor - 实体处理函数
 * @param {Object} options - 选项
 * @returns {Array} 处理结果数组
 */
export function safeForEachEntity(viewer, entityProcessor, options = {}) {
  const { 
    filterEntity = () => true,
    onError = (error, entity) => console.warn('处理实体时出错:', error),
    maxResults = Infinity 
  } = options;
  
  const results = [];
  
  if (!isViewerValid(viewer)) {
    return results;
  }
  
  try {
    viewer.dataSources._dataSources.forEach((dataSource, dsIndex) => {
      if (results.length >= maxResults) return;
      
      const entities = safeGetEntities(dataSource);
      entities.forEach((entity, entityIndex) => {
        if (results.length >= maxResults) return;
        
        try {
          if (filterEntity(entity, entityIndex, dsIndex)) {
            const result = entityProcessor(entity, entityIndex, dsIndex);
            if (result !== undefined) {
              results.push(result);
            }
          }
        } catch (error) {
          onError(error, entity);
        }
      });
    });
  } catch (error) {
    console.error('遍历实体时发生错误:', error);
  }
  
  return results;
}

/**
 * 清理资源的通用函数
 * @param {*} resource - 要清理的资源
 * @param {string} resourceType - 资源类型（用于日志）
 */
export function safeCleanupResource(resource, resourceType = 'resource') {
  if (!resource) return;
  
  try {
    if (typeof resource.destroy === 'function' && !resource.isDestroyed()) {
      resource.destroy();
    } else if (typeof resource.remove === 'function') {
      resource.remove();
    }
  } catch (error) {
    console.warn(`清理${resourceType}时出错:`, error);
  }
}

/**
 * 批量清理实体数组
 * @param {Cesium.Viewer} viewer - Cesium viewer实例
 * @param {Array} entities - 实体数组
 */
export function safeClearEntities(viewer, entities) {
  if (!isViewerValid(viewer) || !Array.isArray(entities)) {
    return;
  }
  
  entities.forEach(entity => {
    try {
      if (entity && viewer.entities.contains(entity)) {
        viewer.entities.remove(entity);
      }
    } catch (error) {
      console.warn('移除实体时出错:', error);
    }
  });
}

/**
 * 高亮管线工具函数
 * @param {Array} pipelines - 管线实体数组
 * @returns {Function} 清理高亮的回调函数
 */
export function highlightPipelinesUtil(pipelines) {
  if (!Array.isArray(pipelines)) {
    return () => {};
  }
  
  const originalMaterials = [];
  
  pipelines.forEach(entity => {
    if (entity && entity.polylineVolume && entity.polylineVolume.material) {
      // 保存原始材质
      originalMaterials.push({
        entity,
        originalMaterial: entity.polylineVolume.material
      });
      
      // 设置高亮材质
      try {
        const Cesium = window.Cesium;
        entity.polylineVolume.material = Cesium.Color.YELLOW.withAlpha(0.8);
      } catch (error) {
        console.warn('设置高亮材质失败:', error);
      }
    }
  });
  
  // 返回清理函数
  return function cleanupHighlight() {
    originalMaterials.forEach(({ entity, originalMaterial }) => {
      if (entity && entity.polylineVolume) {
        entity.polylineVolume.material = originalMaterial;
      }
    });
  };
}