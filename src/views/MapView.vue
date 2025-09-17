<template>  
  <div id="cesiumContainer" ref="cesiumContainer"></div>  
  <!-- 左侧容器：上=地下管线分析，下=管线图例 -->
  <div class="left-pane">
    <div class="tool-panel">
      <div class="control-group">
        <h3>地下管线分析</h3>
        <div class="row">
          <label>地形透明度</label>
          <input id="alpha" type="range" min="0" max="1" step="0.05" value="0.35" />
          <span id="alphaVal">0.35</span>
        </div>
        <div class="row">
          <button id="btnSection">剖面分析</button>
          <button id="btnExcavation">挖方分析</button>
          <button id="btnClear">清除</button>
        </div>
      </div>
      
      <div class="info-panel" id="infoPanel" style="display: none;">
        <h3 id="infoTitle">管线信息</h3>
        <div class="info-content" id="infoContent">
          <!-- 动态生成的信息内容 -->
        </div>
      </div>
    </div>
    <div class="legend-panel" id="legendPanel">
      <h3>管线图例</h3>
      <div class="legend-content" id="legendContent">
        <!-- 动态渲染：分组与复选框 -->
      </div>
    </div>
  </div>
  <!-- 底部剖面图面板 -->
  <div class="profile-panel" id="profilePanel" style="display:none;">
    <div class="profile-header">
      <button id="btnCloseProfile">关闭</button>
      <span class="title">剖面分析</span>
    </div>
    <div id="profileChart" class="profile-chart"></div>
  </div>
</template>  

<script setup>  
import * as Cesium from 'cesium';  
import "./Widgets/widgets.css";  
import { onMounted, onUnmounted, ref } from 'vue';  

window.CESIUM_BASE_URL = "/";  

// 保存viewer实例的引用，以便在组件销毁时正确清理
let viewer = null;
// 保存所有管线数据源的数组
let pipelineDataSources = [];

onMounted(async () => {  
    Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyZTFmMDI1YS05MTRkLTRhMzYtYTNiZi0wYmM2YTdlYjU5ODMiLCJpZCI6MjIwNDYzLCJpYXQiOjE3MTc2NTIwMDF9.U1PZjG0GiZdXjIvHRyAGsHRMveUVQdINghXIfF6xJDE';
    viewer = new Cesium.Viewer("cesiumContainer",{
      terrainProvider: await Cesium.createWorldTerrainAsync({
      requestWaterMask: true,
      requestVertexNormals: true
      })
    });  
    const url = "/Assets/data/osgb/tileset.json";  

    const osgb = await Cesium.Cesium3DTileset.fromUrl(url);  
    viewer.scene.primitives.add(osgb);  
    viewer.zoomTo(osgb);  

    const classificationTilesetUrl =
    "/Assets/data/ck/tileset.json";
     const classificationTileset = await Cesium.Cesium3DTileset.fromUrl(
    classificationTilesetUrl,
    {
      classificationType: Cesium.ClassificationType.CESIUM_3D_TILE,
    },
  );
  classificationTileset.modelMatrix = Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0,135));
  
  viewer.scene.primitives.add(classificationTileset);

  // 加载 App1.vue 中的额外 3D Tileset 数据源
  const di = await Cesium.Cesium3DTileset.fromUrl('/Assets/data/di/tileset.json');
  const sh = await Cesium.Cesium3DTileset.fromUrl('/Assets/data/sh/tileset.json');
  const a  = await Cesium.Cesium3DTileset.fromUrl('/Assets/data/a/tileset.json');
  const heightOffset = 135;

  di.modelMatrix = Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, heightOffset));
  di.style = new Cesium.Cesium3DTileStyle({ color: "color('rgba(0,255,255,0.01)')" });
  sh.modelMatrix = Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, heightOffset));
  sh.show = false;

  viewer.scene.primitives.add(di);
  viewer.scene.primitives.add(sh);
  viewer.scene.primitives.add(a);

  // ECharts 句柄
  let profileChart = null;
  let profileTotalLen = 0;
  let profileStart = null;
  let profileEnd = null;
  let profileIndicator = null; // Cesium 中的联动指示点

  // 抛物线动画函数（从 App1.vue 移植）
  function animatedParabola(twoPoints) {
    const start = [twoPoints[0], twoPoints[1], 0];
    const step = 80;
    const heightProportion = 0.125;
    const dLon = (twoPoints[2] - start[0]) / step;
    const dLat = (twoPoints[3] - start[1]) / step;
    const deltaLon = dLon * Math.abs(111000 * Math.cos(start[1]));
    const deltaLat = dLat * 111000;
    const end = [0, 0, 0];
    const heigh = Math.floor(step * Math.sqrt(deltaLon ** 2 + deltaLat ** 2) * heightProportion);
    const x2 = 10000 * Math.sqrt(dLon ** 2 + dLat ** 2);
    const a = heigh / (x2 * x2);
    const y = (x) => Math.floor(heigh - a * x * x);

    for (let i = 1; i <= step; i++) {
      end[0] = start[0] + dLon;
      end[1] = start[1] + dLat;
      const x = x2 * ((2 * i) / step - 1);
      end[2] = y(x);

      const positions = Cesium.Cartesian3.fromDegreesArrayHeights([...start, ...end]);

      viewer.entities.add({
        polyline: {
          positions,
          width: 4,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: Cesium.Color.GOLD,
            outlineWidth: 0.3,
          }),
        },
      });

      start[0] = end[0];
      start[1] = end[1];
      start[2] = end[2];
    }
    viewer.clock.shouldAnimate = true;
    viewer.clock.multiplier = 1600;
  }

  // 创建从青岛到北京的抛物线
  const twoPoints = [118.22951002492071, 35.10534526147898, 116.391389, 39.905556];
  animatedParabola(twoPoints);
  
    // 允许相机入地、开启地形半透明并绑定透明度滑块
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = false;
    viewer.scene.globe.translucency.enabled = true;
    viewer.scene.globe.translucency.frontFaceAlpha = 0.35;
    viewer.scene.globe.translucency.backFaceAlpha = 0.05;
    // 允许在半透明对象上拾取
    viewer.scene.pickTranslucentDepth = true;

    // 提升高亮观感：开启 Bloom（荧光效果）
    const bloom = viewer.scene.postProcessStages.bloom;
    if (bloom) {
      bloom.enabled = true;
      bloom.uniforms.glowOnly = false;
      bloom.uniforms.contrast = 128.0;
      bloom.uniforms.brightness = -0.3;
      bloom.uniforms.delta = 1.0;
      bloom.uniforms.sigma = 2.0;
      bloom.uniforms.stepSize = 1.0;
    }

    // 同步调整地形与3D Tiles透明度
    function applyTilesAlpha(tileset, alpha) {
      if (!tileset) return;
      tileset.backFaceCulling = false;
      tileset.style = new Cesium.Cesium3DTileStyle({
        color: `rgba(255,255,255, ${Math.min(Math.max(alpha, 0), 1)})`
      });
    }
    const alphaInput = document.getElementById('alpha');
    const alphaVal = document.getElementById('alphaVal');
    if (alphaInput && alphaVal) {
      const onAlpha = () => {
        const v = Number(alphaInput.value);
        alphaVal.textContent = v.toFixed(2);
        viewer.scene.globe.translucency.frontFaceAlpha = v;
        applyTilesAlpha(osgb, v);
        applyTilesAlpha(classificationTileset, v);
      };
      alphaInput.addEventListener('input', onAlpha);
      onAlpha();
    }

    // —— 裁剪工具函数 ——
    function pickCenterCartographic() {
      const canvas = viewer.scene.canvas;
      const windowPos = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
      const ray = viewer.camera.getPickRay(windowPos);
      const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      if (!cartesian) return null;
      return Cesium.Cartographic.fromCartesian(cartesian);
    }

    function makeBoxClipping(centerCarto, halfX = 50.0, halfY = 50.0, depth = 50.0) {
      const center = Cesium.Cartesian3.fromRadians(centerCarto.longitude, centerCarto.latitude, centerCarto.height);
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
      const xAxis = Cesium.Matrix4.getColumn(enu, 0, new Cesium.Cartesian3());
      const yAxis = Cesium.Matrix4.getColumn(enu, 1, new Cesium.Cartesian3());
      const zAxis = Cesium.Matrix4.getColumn(enu, 2, new Cesium.Cartesian3());

      function plane(normal, distance) {
        const n = Cesium.Cartesian3.normalize(normal, new Cesium.Cartesian3());
        return new Cesium.ClippingPlane(n, distance);
      }

      const planes = new Cesium.ClippingPlaneCollection({
        planes: [
          plane(xAxis,  halfX),
          plane(Cesium.Cartesian3.negate(xAxis, new Cesium.Cartesian3()), halfX),
          plane(yAxis,  halfY),
          plane(Cesium.Cartesian3.negate(yAxis, new Cesium.Cartesian3()), halfY),
          plane(Cesium.Cartesian3.negate(zAxis, new Cesium.Cartesian3()), depth),
        ],
        edgeColor: Cesium.Color.YELLOW,
        edgeWidth: 1.0,
        unionClippingRegions: true,
        enabled: true
      });

      planes.modelMatrix = enu;
      return planes;
    }

    function applyClipping(planes) {
      viewer.scene.globe.clippingPlanes = planes;
      if (osgb) osgb.clippingPlanes = planes;
      if (classificationTileset) classificationTileset.clippingPlanes = planes;
    }

    function createTrench() {
      const c = pickCenterCartographic();
      if (!c) return;
      const planes = makeBoxClipping(c, 50.0, 10.0, 30.0);
      applyClipping(planes);
    }

    function createPit() {
      const c = pickCenterCartographic();
      if (!c) return;
      const planes = makeBoxClipping(c, 40.0, 40.0, 40.0);
      applyClipping(planes);
    }

    function clearClipping() {
      viewer.scene.globe.clippingPlanes = undefined;
      if (osgb) osgb.clippingPlanes = undefined;
      if (classificationTileset) classificationTileset.clippingPlanes = undefined;
    }

    // 剖面分析相关变量
    let sectionMode = false;
    let sectionPoints = [];
    let sectionLine = null;
    let sectionTempEntities = []; // 存储临时实体（轨迹点和线）
    let excavationMode = false;
    let excavationPoints = [];
    let excavationPolygon = null;
    let excavationTempEntities = []; // 存储临时绘制的实体
    let sectionPreviewLine = null; // 剖面预览线
    let excavationPreviewPolygon = null; // 挖方预览多边形
    let currentMousePosition = null; // 当前鼠标位置
    let sectionClippingPlanes = null; // 剖面裁剪平面
    let excavationClippingPlanes = null; // 挖方裁剪平面
    let sectionVolume = null; // 剖面区域实体
    let excavationVolume = null; // 挖方区域实体
    let highlightedPipelines = []; // 高亮显示的管线
    
    // 剖面分析：沿线检测管线
    function analyzeSectionPipelines(startCart, endCart) {
      const pipelines = [];
      const startPos = Cesium.Cartesian3.fromRadians(startCart.longitude, startCart.latitude, startCart.height);
      const endPos = Cesium.Cartesian3.fromRadians(endCart.longitude, endCart.latitude, endCart.height);
      
      console.log('开始剖面分析，数据源数量:', viewer.dataSources._dataSources.length);
      
      // 遍历所有管线实体
      viewer.dataSources._dataSources.forEach((dataSource, dsIndex) => {
        console.log(`数据源 ${dsIndex}:`, dataSource.entities.values.length, '个实体');
        dataSource.entities.values.forEach((entity, entityIndex) => {
          if (entity.polylineVolume && entity.polylineVolume.positions) {
            const positions = entity.polylineVolume.positions.getValue(Cesium.JulianDate.now());
            if (positions && positions.length >= 2) {
              // 检查管线是否与剖面线相交或接近
              for (let i = 0; i < positions.length - 1; i++) {
                const segStart = positions[i];
                const segEnd = positions[i + 1];
                
                // 计算管线段与剖面线的最短距离
                const distance = calculateLineSegmentDistance(startPos, endPos, segStart, segEnd);
                if (distance < 50.0) { // 50米缓冲区
                  // 正确提取属性
                  const properties = {};
                  if (entity.properties) {
                    const propertyNames = entity.properties.propertyNames || Object.keys(entity.properties);
                    propertyNames.forEach(name => {
                      let value = entity.properties[name];
                      if (value && typeof value.getValue === 'function') {
                        value = value.getValue(Cesium.JulianDate.now());
                      }
                      if (value !== undefined && value !== null) {
                        properties[name] = value;
                      }
                    });
                  }
                  
                  console.log(`找到管线 ${entityIndex}:`, properties);
                  
                  pipelines.push({
                    entity: entity,
                    name: entity.name || properties['设施名'] || properties['类型'] || properties['管线类型'] || '未知管线',
                    properties: properties,
                    distance: distance
                  });
                  break;
                }
              }
            }
          }
        });
      });
      
      return pipelines;
    }
    
    // 挖方分析：检测多边形内的管线
    function analyzeExcavationPipelines(polygonPoints) {
      const pipelines = [];
      
      viewer.dataSources._dataSources.forEach((dataSource, dsIndex) => {
        dataSource.entities.values.forEach((entity, entityIndex) => {
          if (entity.polylineVolume && entity.polylineVolume.positions) {
            const positions = entity.polylineVolume.positions.getValue(Cesium.JulianDate.now());
            if (positions && positions.length >= 2) {
              // 检查管线点是否在多边形内
              for (let pos of positions) {
                const cart = Cesium.Cartographic.fromCartesian(pos);
                if (isPointInPolygon(cart, polygonPoints)) {
                  // 正确提取属性
                  const properties = {};
                  if (entity.properties) {
                    const propertyNames = entity.properties.propertyNames || Object.keys(entity.properties);
                    propertyNames.forEach(name => {
                      let value = entity.properties[name];
                      if (value && typeof value.getValue === 'function') {
                        value = value.getValue(Cesium.JulianDate.now());
                      }
                      if (value !== undefined && value !== null) {
                        properties[name] = value;
                      }
                    });
                  }
                  
                  pipelines.push({
                    entity: entity,
                    name: entity.name || properties['设施名'] || properties['类型'] || properties['管线类型'] || '未知管线',
                    properties: properties
                  });
                  break;
                }
              }
            }
          }
        });
      });
      
      return pipelines;
    }
    
    // 计算两条线段之间的最短距离
    function calculateLineSegmentDistance(line1Start, line1End, line2Start, line2End) {
      // 简化计算：使用端点到线段的距离
      const d1 = Cesium.Cartesian3.distance(line1Start, line2Start);
      const d2 = Cesium.Cartesian3.distance(line1Start, line2End);
      const d3 = Cesium.Cartesian3.distance(line1End, line2Start);
      const d4 = Cesium.Cartesian3.distance(line1End, line2End);
      return Math.min(d1, d2, d3, d4);
    }
    
    // 点在多边形内判断
    function isPointInPolygon(point, polygon) {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].longitude, yi = polygon[i].latitude;
        const xj = polygon[j].longitude, yj = polygon[j].latitude;
        
        if (((yi > point.latitude) !== (yj > point.latitude)) &&
            (point.longitude < (xj - xi) * (point.latitude - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
      return inside;
    }
    
    // 显示管线信息
    function showPipelineInfo(pipelines, title) {
      const infoPanel = document.getElementById('infoPanel');
      const infoTitle = document.getElementById('infoTitle');
      const infoContent = document.getElementById('infoContent');
      
      infoTitle.textContent = title;
      
      let html = '';
      if (pipelines.length === 0) {
        html = '<div style="color: #ccc; text-align: center; padding: 20px;">未发现管线</div>';
      } else {
        pipelines.forEach((pipeline, index) => {
          const props = pipeline.properties;
          html += `
            <div class="pipeline-item">
              <h4>管线 ${index + 1}: ${pipeline.name}</h4>
              <div class="property">
                <span class="label">名称:</span>
                <span class="value">${pipeline.name}</span>
              </div>`;
          
          // 显示主要属性
          const importantProps = ['ObjectId', '设施名', '类型', '管线类型', '管径', '材质', '埋深'];
          importantProps.forEach(key => {
            if (props[key] !== undefined && props[key] !== null) {
              html += `
                <div class="property">
                  <span class="label">${key}:</span>
                  <span class="value">${props[key]}</span>
                </div>`;
            }
          });
          
          // 显示所有其他属性
          Object.keys(props).forEach(key => {
            // 跳过已经显示的重要属性
            if (!importantProps.includes(key) && key && props[key] !== undefined && props[key] !== null) {
              html += `
                <div class="property">
                  <span class="label">${key}:</span>
                  <span class="value">${props[key]}</span>
                </div>`;
            }
          });
          
          if (pipeline.distance !== undefined) {
            html += `
              <div class="property">
                <span class="label">距离:</span>
                <span class="value">${pipeline.distance.toFixed(1)}m</span>
              </div>`;
          }
          
          html += '</div>';
        });
      }
      
      infoContent.innerHTML = html;
      infoPanel.style.display = 'block';
    }
    
    // 开始剖面分析
    function startSectionAnalysis() {
      if (sectionMode) {
        endSectionAnalysis();
        return;
      }
      
      sectionMode = true;
      sectionPoints = [];
      excavationMode = false;
      clearClipping();
      
      const btn = document.getElementById('btnSection');
      if (btn) btn.textContent = '取消剖面';
      
      viewer.canvas.style.cursor = 'crosshair';
      
      // 创建剖面预览线
      sectionPreviewLine = viewer.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            if (sectionPoints.length === 0) {
              return [];
            } else if (sectionPoints.length === 1 && currentMousePosition) {
              // 实时预览：第一个点到鼠标位置
              return [
                Cesium.Cartesian3.fromRadians(sectionPoints[0].longitude, sectionPoints[0].latitude, sectionPoints[0].height),
                Cesium.Cartesian3.fromRadians(currentMousePosition.longitude, currentMousePosition.latitude, currentMousePosition.height)
              ];
            } else if (sectionPoints.length === 2) {
              // 完成状态：两个点之间
              return [
                Cesium.Cartesian3.fromRadians(sectionPoints[0].longitude, sectionPoints[0].latitude, sectionPoints[0].height),
                Cesium.Cartesian3.fromRadians(sectionPoints[1].longitude, sectionPoints[1].latitude, sectionPoints[1].height)
              ];
            }
            return [];
          }, false),
          width: 2,
          material: Cesium.Color.YELLOW.withAlpha(0.8),
          clampToGround: true
        }
      });
    }
    
    // 开始挖方分析
    function startExcavationAnalysis() {
      if (excavationMode) {
        endExcavationAnalysis();
        return;
      }
      
      excavationMode = true;
      excavationPoints = [];
      sectionMode = false;
      clearClipping();
      
      const btn = document.getElementById('btnExcavation');
      if (btn) btn.textContent = '取消挖方';
      
      viewer.canvas.style.cursor = 'crosshair';
      
      // 创建挖方预览多边形
      excavationPreviewPolygon = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.CallbackProperty(() => {
            if (excavationPoints.length === 0) {
              return new Cesium.PolygonHierarchy([]);
            } else if (excavationPoints.length === 1 && currentMousePosition) {
              // 只有一个点和鼠标位置时，不构成面
              return new Cesium.PolygonHierarchy([]);
            } else if (excavationPoints.length >= 2) {
              // 有两个或更多点时
              const positions = excavationPoints.map(cart => 
                Cesium.Cartesian3.fromRadians(cart.longitude, cart.latitude, cart.height)
              );
              
              // 如果有鼠标位置，添加到预览中
              if (currentMousePosition) {
                positions.push(Cesium.Cartesian3.fromRadians(currentMousePosition.longitude, currentMousePosition.latitude, currentMousePosition.height));
              }
              
              return new Cesium.PolygonHierarchy(positions);
            }
            return new Cesium.PolygonHierarchy([]);
          }, false),
          material: Cesium.Color.CYAN.withAlpha(0.3),
          outline: true,
          outlineColor: Cesium.Color.CYAN,
          extrudedHeight: 20,
          height: 0
        }
      });
    }
    
    // 结束剖面分析
    function endSectionAnalysis() {
      sectionMode = false;
      sectionPoints = [];
      currentMousePosition = null;
      
      // 清除临时实体
      sectionTempEntities.forEach(entity => viewer.entities.remove(entity));
      sectionTempEntities = [];
      
      if (sectionLine) {
        viewer.entities.remove(sectionLine);
        sectionLine = null;
      }
      
      // 移除预览线
      if (sectionPreviewLine) {
        viewer.entities.remove(sectionPreviewLine);
        sectionPreviewLine = null;
      }
      
      const btn = document.getElementById('btnSection');
      if (btn) btn.textContent = '剖面分析';
      
      viewer.canvas.style.cursor = 'default';
    }
    
    // 结束挖方分析
    function endExcavationAnalysis() {
      excavationMode = false;
      excavationPoints = [];
      currentMousePosition = null;
      
      // 清除临时实体
      excavationTempEntities.forEach(entity => viewer.entities.remove(entity));
      excavationTempEntities = [];
      
      if (excavationPolygon) {
        viewer.entities.remove(excavationPolygon);
        excavationPolygon = null;
      }
      
      // 移除预览多边形
      if (excavationPreviewPolygon) {
        viewer.entities.remove(excavationPreviewPolygon);
        excavationPreviewPolygon = null;
      }
      
      const btn = document.getElementById('btnExcavation');
      if (btn) btn.textContent = '挖方分析';
      
      viewer.canvas.style.cursor = 'default';
    }
    
    // 清除所有分析
    function clearAllAnalysis() {
      endSectionAnalysis();
      endExcavationAnalysis();
      clearClipping();
      
      // 清除剖面区域
      if (sectionVolume) {
        viewer.entities.remove(sectionVolume);
        sectionVolume = null;
      }
      
      // 清除挖方区域
      if (excavationVolume) {
        viewer.entities.remove(excavationVolume);
        excavationVolume = null;
      }
      
      // 取消管线高亮
      clearPipelineHighlight();
      
      const infoPanel = document.getElementById('infoPanel');
      if (infoPanel) infoPanel.style.display = 'none';
    }
    
    // 清除管线高亮
    function clearPipelineHighlight() {
      highlightedPipelines.forEach(entity => {
        if (entity.polylineVolume && entity.__origMaterial) {
          entity.polylineVolume.material = entity.__origMaterial;
          entity.__origMaterial = undefined;
        }
      });
      highlightedPipelines = [];
    }
    
    // 高亮管线
    function highlightPipelines(pipelines) {
      clearPipelineHighlight();
      
      pipelines.forEach(pipeline => {
        const entity = pipeline.entity;
        if (entity.polylineVolume) {
          // 保存原始材质
          if (!entity.__origMaterial) {
            entity.__origMaterial = entity.polylineVolume.material;
          }
          
          // 设置高亮材质
          entity.polylineVolume.material = new Cesium.ColorMaterialProperty(
            Cesium.Color.YELLOW.withAlpha(1.0)
          );
          
          highlightedPipelines.push(entity);
        }
      });
    }
    
    // 创建剖面区域
    function createSectionVolume(startCart, endCart) {
      const startPos = Cesium.Cartesian3.fromRadians(startCart.longitude, startCart.latitude, startCart.height);
      const endPos = Cesium.Cartesian3.fromRadians(endCart.longitude, endCart.latitude, endCart.height);
      
      // 计算方向向量
      const direction = Cesium.Cartesian3.subtract(endPos, startPos, new Cesium.Cartesian3());
      const length = Cesium.Cartesian3.magnitude(direction);
      Cesium.Cartesian3.normalize(direction, direction);
      
      // 计算垂直向量（假设垂直于地面）
      const up = new Cesium.Cartesian3(0, 0, 1);
      const right = Cesium.Cartesian3.cross(direction, up, new Cesium.Cartesian3());
      Cesium.Cartesian3.normalize(right, right);
      
      // 计算剖面区域的四个角点
      const halfWidth = 20.0;
      const halfHeight = 30.0;
      
      const corner1 = Cesium.Cartesian3.add(
        Cesium.Cartesian3.add(startPos, 
          Cesium.Cartesian3.multiplyByScalar(right, -halfWidth, new Cesium.Cartesian3()), 
          new Cesium.Cartesian3()),
        Cesium.Cartesian3.multiplyByScalar(up, -halfHeight, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      
      const corner2 = Cesium.Cartesian3.add(
        Cesium.Cartesian3.add(startPos, 
          Cesium.Cartesian3.multiplyByScalar(right, halfWidth, new Cesium.Cartesian3()), 
          new Cesium.Cartesian3()),
        Cesium.Cartesian3.multiplyByScalar(up, -halfHeight, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      
      const corner3 = Cesium.Cartesian3.add(
        Cesium.Cartesian3.add(endPos, 
          Cesium.Cartesian3.multiplyByScalar(right, halfWidth, new Cesium.Cartesian3()), 
          new Cesium.Cartesian3()),
        Cesium.Cartesian3.multiplyByScalar(up, halfHeight, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      
      const corner4 = Cesium.Cartesian3.add(
        Cesium.Cartesian3.add(endPos, 
          Cesium.Cartesian3.multiplyByScalar(right, -halfWidth, new Cesium.Cartesian3()), 
          new Cesium.Cartesian3()),
        Cesium.Cartesian3.multiplyByScalar(up, halfHeight, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      
      // 创建剖面区域实体
      sectionVolume = viewer.entities.add({
        name: "剖面区域",
        polygon: {
          hierarchy: [corner1, corner2, corner3, corner4],
          extrudedHeight: 0,
          material: Cesium.Color.GRAY.withAlpha(0.3),
          outline: true,
          outlineColor: Cesium.Color.YELLOW
        }
      });
    }
    
    // 创建挖方区域
    function createExcavationVolume(polygonPoints) {
      if (polygonPoints.length < 3) return;
      
      const positions = polygonPoints.map(cart => 
        Cesium.Cartesian3.fromRadians(cart.longitude, cart.latitude, cart.height)
      );
      
      // 创建挖方区域实体
      excavationVolume = viewer.entities.add({
        name: "挖方区域",
        polygon: {
          hierarchy: positions,
          extrudedHeight: 20, // 假设开挖20米
          material: Cesium.Color.BROWN.withAlpha(0.4),
          outline: true,
          outlineColor: Cesium.Color.DARKRED
        }
      });
    }
    
    // 计算挖方体积
    function calculateExcavationVolume(polygonPoints) {
      if (polygonPoints.length < 3) return 0;
      
      // 计算多边形面积（使用鞋带公式）
      let area = 0;
      for (let i = 0; i < polygonPoints.length; i++) {
        const current = polygonPoints[i];
        const next = polygonPoints[(i + 1) % polygonPoints.length];
        area += Cesium.Math.toDegrees(current.longitude) * Cesium.Math.toDegrees(next.latitude);
        area -= Cesium.Math.toDegrees(next.longitude) * Cesium.Math.toDegrees(current.latitude);
      }
      area = Math.abs(area) / 2.0;
      
      // 简化的体积计算（实际应用中需要更精确的计算）
      const depth = 20; // 假设开挖深度为20米
      const volume = area * depth;
      
      return volume;
    }
    
    // 创建剖面裁剪区域
    function createSectionClippingPlanes(startCart, endCart) {
      const startPos = Cesium.Cartesian3.fromRadians(startCart.longitude, startCart.latitude, startCart.height);
      const endPos = Cesium.Cartesian3.fromRadians(endCart.longitude, endCart.latitude, endCart.height);
      
      // 计算中心点
      const center = Cesium.Cartesian3.midpoint(startPos, endPos, new Cesium.Cartesian3());
      const centerCart = Cesium.Cartographic.fromCartesian(center);
      
      // 创建裁剪平面
      const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(center);
      const inverseEnuMatrix = Cesium.Matrix4.inverse(enuMatrix, new Cesium.Matrix4());
      
      // 转换起点和终点到ENU坐标系
      const startEnu = Cesium.Matrix4.multiplyByPoint(inverseEnuMatrix, startPos, new Cesium.Cartesian3());
      const endEnu = Cesium.Matrix4.multiplyByPoint(inverseEnuMatrix, endPos, new Cesium.Cartesian3());
      
      // 计算方向向量
      const direction = Cesium.Cartesian3.subtract(endEnu, startEnu, new Cesium.Cartesian3());
      const length = Cesium.Cartesian3.magnitude(direction);
      Cesium.Cartesian3.normalize(direction, direction);
      
      // 创建垂直于剖面线的平面
      const halfLength = length / 2;
      const halfWidth = 20.0; // 宽度
      const halfDepth = 50.0; // 深度（调整为50m）
      
      function createPlane(normal, distance) {
        const n = Cesium.Cartesian3.normalize(normal, new Cesium.Cartesian3());
        return new Cesium.ClippingPlane(n, distance);
      }
      
      // 创建裁剪平面集合
      const planes = [
        createPlane(direction, halfLength), // 沿线方向的平面
        createPlane(Cesium.Cartesian3.negate(direction, new Cesium.Cartesian3()), halfLength), // 反向平面
        createPlane(new Cesium.Cartesian3(0, 1, 0), halfWidth), // 垂直方向平面
        createPlane(new Cesium.Cartesian3(0, -1, 0), halfWidth), // 反向垂直平面
        createPlane(new Cesium.Cartesian3(0, 0, -1), halfDepth), // 向下平面
      ];
      
      sectionClippingPlanes = new Cesium.ClippingPlaneCollection({
        planes: planes,
        edgeColor: Cesium.Color.YELLOW,
        edgeWidth: 1.0,
        modelMatrix: enuMatrix,
        enabled: true
      });
      
      // 应用裁剪平面到地形和模型
      applyClipping(sectionClippingPlanes);
    }
    
    // 创建挖方裁剪区域
    function createExcavationClippingPlanes(polygonPoints) {
      if (polygonPoints.length < 3) return;
      
      // 计算多边形中心点
      let centerLon = 0, centerLat = 0, centerHeight = 0;
      polygonPoints.forEach(point => {
        centerLon += point.longitude;
        centerLat += point.latitude;
        centerHeight += point.height;
      });
      centerLon /= polygonPoints.length;
      centerLat /= polygonPoints.length;
      centerHeight /= polygonPoints.length;
      
      const center = Cesium.Cartesian3.fromRadians(centerLon, centerLat, centerHeight);
      const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(center);
      const inverseEnuMatrix = Cesium.Matrix4.inverse(enuMatrix, new Cesium.Matrix4());
      
      // 创建裁剪平面
      const planes = [];
      
      // 为多边形的每条边创建裁剪平面
      for (let i = 0; i < polygonPoints.length; i++) {
        const currentPoint = polygonPoints[i];
        const nextPoint = polygonPoints[(i + 1) % polygonPoints.length];
        
        const currentPos = Cesium.Cartesian3.fromRadians(currentPoint.longitude, currentPoint.latitude, currentPoint.height);
        const nextPos = Cesium.Cartesian3.fromRadians(nextPoint.longitude, nextPoint.latitude, nextPoint.height);
        
        // 转换到ENU坐标系
        const currentEnu = Cesium.Matrix4.multiplyByPoint(inverseEnuMatrix, currentPos, new Cesium.Cartesian3());
        const nextEnu = Cesium.Matrix4.multiplyByPoint(inverseEnuMatrix, nextPos, new Cesium.Cartesian3());
        
        // 计算法向量（朝向多边形内部）
        const normal = new Cesium.Cartesian3(-edgeVector.y, edgeVector.x, 0);
        
        // 计算距离
        const distance = Cesium.Cartesian3.dot(currentEnu, normal);
        
        planes.push(new Cesium.ClippingPlane(normal, distance));
      }
      
      // 添加顶部和底部平面
      planes.push(new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 0, -1), 50.0)); // 向下平面（50m）
      
      excavationClippingPlanes = new Cesium.ClippingPlaneCollection({
        planes: planes,
        edgeColor: Cesium.Color.CYAN,
        edgeWidth: 1.0,
        modelMatrix: enuMatrix,
        enabled: true
      });
      
      // 应用裁剪平面到地形和模型
      applyClipping(excavationClippingPlanes);
    }
    
    const btnSection = document.getElementById('btnSection');
    const btnExcavation = document.getElementById('btnExcavation');
    const btnClear = document.getElementById('btnClear');
    btnSection && btnSection.addEventListener('click', startSectionAnalysis);
    btnExcavation && btnExcavation.addEventListener('click', startExcavationAnalysis);
    btnClear && btnClear.addEventListener('click', clearAllAnalysis);

    // 加载GeoJSON面数据
    const ck=viewer.dataSources.add(Cesium.GeoJsonDataSource.load('/Assets/data/geojson/仓库.json', {
      clampToGround: true // 保证贴地
    })).then(function (dataSource) {
      // 遍历实体，设置 classificationType
      const entities = dataSource.entities.values;
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (entity.polygon) {
          entity.polygon.classificationType = Cesium.ClassificationType.BOTH;
          entity.polygon.material = Cesium.Color.fromCssColorString("rgba(0,255,255,0.01)"); // 示例材质，可调整
          entity.polygon.outline = false;
        }
      }

//地层

// new两条管线配置
// 两条管线配置
const pipelines = [
  { 
    url: "/Assets/data/json/JPLN_Project_FeaturesToJSON.json", 
    color: Cesium.Color.fromCssColorString('rgb(0,255,255)').withAlpha(0.8), 
    depth: 5, 
    diameter: 20,
    name: "配水管线"
  },
  { 
    url: "/Assets/data/json/DSLN_Project_FeaturesToJSON.json", 
    color: Cesium.Color.fromCssColorString('rgb(0,255,0)').withAlpha(0.8), 
    depth: 10, 
    diameter: 10,
    name: "电视管线"
  },
  { 
    url: "/Assets/data/json/TXLN_Project4_FeaturesToJSON.json", 
    color: Cesium.Color.fromCssColorString('rgb(0,255,0)').withAlpha(0.8),
    depth: 7, 
    diameter: 8,
    name: "通信管线"
  },
    { 
    url: "/Assets/data/json/TRLN_Project_FeaturesToJSON.json", 
    color: Cesium.Color.fromCssColorString('rgb(255,0,255)').withAlpha(0.8),
    depth: 25, 
    diameter: 15,
    name: "天然气管线"
  },
  { 
    url: "/Assets/data/json/WSLN_Project_FeaturesToJSON.json", 
    color: Cesium.Color.fromCssColorString('rgb(76,57,38)').withAlpha(0.8), 
    depth: 8, 
    diameter: 18,
    name: "污水管线"
  },
  { 
    url: "/Assets/data/json/YSLN_Project1_FeaturesToJSON.json", 
    color: Cesium.Color.fromCssColorString('rgb(76,57,38)').withAlpha(0.8), 
    depth: 6, 
    diameter: 16,
    name: "雨水管线"
  },
  { 
    url: "/Assets/data/json/RSLN_Project1_FeaturesToJSON1.json", 
    color: Cesium.Color.fromCssColorString('rgb(255,128,0)').withAlpha(0.8),
    depth: 12, 
    diameter: 14,
    name: "热水管线"
  },
  { 
    url: "/Assets/data/json/GDLN_Project1_FeaturesToJSON.json", 
    color: Cesium.Color.fromCssColorString('rgb(255,0,0)').withAlpha(0.8),
    depth: 15, 
    diameter: 12,
    name: "供电管线"
  },
  { 
    url: "/Assets/data/json/LDLN_Project_FeaturesToJSON.json", 
    color: Cesium.Color.fromCssColorString('rgb(255,0,0)').withAlpha(0.8),
    depth: 18, 
    diameter: 10,
    name: "路灯管线"
  },
  
  
];

// =============== 管线分组与图例面板 ===============
const pipelineGroups = new Map(); // key: 分组名, value: { color, entities: Entity[], visible: true }

function renderLegendPanel() {
  const container = document.getElementById('legendContent');
  if (!container) return;
  let html = '';
  pipelineGroups.forEach((group, name) => {
    const id = `chk_${name}`;
    const count = group.entities.length;
    const color = group.color && group.color.toCssColorString ? group.color.toCssColorString() : '#00BCD4';
    html += `
      <label class="legend-item">
        <input type="checkbox" id="${id}" ${group.visible !== false ? 'checked' : ''} />
        <span class="swatch" style="background:${color}"></span>
        <span class="name">${name}</span>
        <span class="count">(${count})</span>
      </label>
    `;
  });
  container.innerHTML = html;
  // 绑定事件
  pipelineGroups.forEach((group, name) => {
    const id = `chk_${name}`;
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', (e) => {
        const checked = e.target.checked;
        group.visible = checked;
        group.entities.forEach(ent => ent.show = checked);
      });
    }
  });
}

function addToPipelineGroup(groupName, color, entity) {
  let group = pipelineGroups.get(groupName);
  if (!group) {
    group = { color, entities: [], visible: true };
    pipelineGroups.set(groupName, group);
  }
  group.entities.push(entity);
  renderLegendPanel();
}

// 加载管线（确保 UTF-8 解码 + 完整属性提取）
pipelines.forEach(async (p) => {
  try {
    // 检查viewer是否仍然存在
    if (!viewer || viewer.isDestroyed()) {
      return;
    }
    
    // 使用fetch API获取数据并手动解码
    const response = await fetch(p.url);
    if (!response.ok) {
      throw new Error(`网络响应错误: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(arrayBuffer);
    const geoJsonData = JSON.parse(text);

    // 加载GeoJSON数据源
    const dataSource = await Cesium.GeoJsonDataSource.load(geoJsonData, { 
      clampToGround: false 
    });
    
    // 再次检查viewer是否仍然存在
    if (!viewer || viewer.isDestroyed()) {
      if (!dataSource.isDestroyed()) {
        dataSource.destroy();
      }
      return;
    }
    
    viewer.dataSources.add(dataSource);
    
    // 隐藏原始数据源的实体
    dataSource.show = false;

    // 处理每个实体
    dataSource.entities.values.forEach((entity) => {
      // 检查viewer是否仍然存在
      if (!viewer || viewer.isDestroyed()) {
        return;
      }
      
      if (entity.polyline) {
        // 提取所有属性（在后续也要使用）
        const properties = {};
        const propertiesRaw = {};
        if (entity.properties) {
          const propertyNames = entity.properties.propertyNames || 
                               Object.keys(entity.properties);
          propertyNames.forEach(name => {
            let value = entity.properties[name];
            if (value && typeof value.getValue === 'function') {
              value = value.getValue(Cesium.JulianDate.now());
            }
            propertiesRaw[name] = value;
            properties[name] = value != null ? value.toString() : '(无数据)';
          });
        }

        // 获取管线位置
        const positions = entity.polyline.positions.getValue(Cesium.JulianDate.now());

        // 基于属性表解析起点/终点埋深与管径（单位：米），有缺省则回落到预设
        const startDepth = parseDepthMeters(properties, ['起点埋', '起点埋深', 'startDepth', 'StartDepth'], p.depth);
        const endDepth = parseDepthMeters(properties, ['终点埋', '终点埋深', 'endDepth', 'EndDepth'], p.depth);
        const diameterMeters = parseDiameterMeters(properties, propertiesRaw, p.diameter);

        // 基于起终埋深进行沿线插值，得到地下位置
        const undergroundPositions = computeUndergroundPositions(positions, startDepth, endDepth);

        // 创建管线截面形状
        function createCircleShape(radius) {
          const shape = [];
          for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * 2 * Math.PI;
            shape.push(new Cesium.Cartesian2(Math.cos(angle) * radius, Math.sin(angle) * radius));
          }
          return shape;
        }

        // 检查viewer是否仍然存在
        if (!viewer || viewer.isDestroyed()) {
          return;
        }
        
        // 创建自定义管线实体
        const pipelineEntity = viewer.entities.add({
          name: properties["设施名"] || p.name || '管线',
          polylineVolume: {
            positions: undergroundPositions,
            shape: createCircleShape(diameterMeters / 2),
            material: p.color
          },
          // 存储原始属性供后续使用
          properties: properties,
          // 完整的属性描述（黑色字体）
          description: createPropertyDescription(properties)
        });

        // 加入分组并刷新图例面板
        addToPipelineGroup(p.name || '管线', p.color, pipelineEntity);

        // 直径异常诊断（> 0.6m 记录）
        if (diameterMeters > 0.6) {
          console.warn('大口径管线', {
            name: pipelineEntity.name,
            diameterMeters,
            raw: {
              管径: propertiesRaw['管径'],
              直径: propertiesRaw['直径'],
              口径: propertiesRaw['口径'],
              diameter: propertiesRaw['diameter']
            }
          });
        }
      }
    });
  } catch (err) {
    console.error(`管线加载失败：${p.url}`, err);
  }
});

// 创建属性描述HTML（黑色字体版本）
function createPropertyDescription(properties) {
  let html = `
    <div style="
      color: #000000; /* 黑色字体 */
      font-size: 14px; 
      max-height: 400px; 
      overflow-y: auto;
      padding: 10px;
      background: #ffffff; /* 白色背景 */
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
        color: #000000; /* 确保表格内也是黑色字体 */
      ">
  `;
  
  // 添加每个属性行
  Object.entries(properties).forEach(([key, value]) => {
    html += `
      <tr>
        <th style="
          text-align: left; 
          padding: 8px; 
          background: #f8f9fa; 
          border: 1px solid #dee2e6;
          width: 30%;
          color: #000000; /* 表头黑色字体 */
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
          color: #000000; /* 表格内容黑色字体 */
        ">${value}</td>
      </tr>`;
  });
  
  html += `</table></div>`;
  return html;
}

    // 显示挖方信息
    function showExcavationInfo(pipelines, volume) {
      const infoPanel = document.getElementById('infoPanel');
      const infoTitle = document.getElementById('infoTitle');
      const infoContent = document.getElementById('infoContent');
      
      infoTitle.textContent = `挖方分析结果`;
      
      let html = `
        <div class="property">
          <span class="label">挖方体积:</span>
          <span class="value">${volume.toFixed(2)} m³</span>
        </div>
        <div class="property">
          <span class="label">管线数量:</span>
          <span class="value">${pipelines.length} 条</span>
        </div>
      `;
      
      if (pipelines.length > 0) {
        html += '<h4 style="color: #FFD700; margin: 10px 0;">管线详情:</h4>';
        pipelines.forEach((pipeline, index) => {
          const props = pipeline.properties;
          html += `
            <div class="pipeline-item">
              <h4>管线 ${index + 1}: ${pipeline.name}</h4>
              <div class="property">
                <span class="label">名称:</span>
                <span class="value">${pipeline.name}</span>
              </div>`;
          
          // 显示主要属性
          const importantProps = ['ObjectId', '设施名', '类型', '管线类型', '管径', '材质', '埋深'];
          importantProps.forEach(key => {
            if (props[key] !== undefined && props[key] !== null) {
              html += `
                <div class="property">
                  <span class="label">${key}:</span>
                  <span class="value">${props[key]}</span>
                </div>`;
            }
          });
          
          html += '</div>';
        });
      }
      
      infoContent.innerHTML = html;
      infoPanel.style.display = 'block';
    }
    
      // —— 属性解析与几何计算辅助函数 ——
// 将任意值解析为数字（去除单位与空白），失败则返回 NaN
function parseNumberLike(value) {
  if (value == null) return NaN;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // 去掉常见单位与中文描述
    const sanitized = trimmed
      .replace(/毫米|mm/gi, '')
      .replace(/厘米|cm/gi, '')
      .replace(/米|m/gi, '')
      .replace(/长度|管径|直径|起点埋|终点埋|口径|DN/gi, '')
      .replace(/[：:]/g, '')
      .replace(/[^0-9+\-.]/g, '') // 保留数字/+-/.
      .trim();
    const n = Number(sanitized);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

// 从属性集合中按候选键读取数字；按需应用转换器
function getNumericProperty(properties, candidateKeys, defaultValue, transformFn) {
  for (let i = 0; i < candidateKeys.length; i++) {
    const key = candidateKeys[i];
    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      const raw = properties[key];
      let num = parseNumberLike(raw);
      if (!Number.isFinite(num)) continue;
      if (typeof transformFn === 'function') {
        num = transformFn(num, raw);
      }
      return num;
    }
  }
  return defaultValue;
}

// 解析管径（尽量转换为米）。经验规则：>50 认为是毫米；>5 可能是厘米；否则按米
function parseDiameterMeters(properties, propertiesRaw, fallbackRaw) {
  const candidateKeys = ['管径', '直径', '口径', 'diameter', 'Diameter', 'DIAMETER'];
  const val = getNumericProperty(properties, candidateKeys, undefined);
  // 解析 fallback：如果配置中给的是较大的数，按毫米/厘米规则估计；否则认为是米
  let fallbackMeters = 0.2; // 安全默认 20cm
  if (Number.isFinite(fallbackRaw)) {
    if (fallbackRaw > 50) fallbackMeters = fallbackRaw / 1000; // mm→m
    else if (fallbackRaw > 5) fallbackMeters = fallbackRaw / 100; // cm→m
    else fallbackMeters = fallbackRaw; // m
  }

  // 优先用原始字符串解析，支持 200x200、300×400、DN300 等
  let primaryFromRaw = undefined;
  let rawUnitHint = '';
  for (const k of candidateKeys) {
    const raw = propertiesRaw && propertiesRaw[k];
    if (typeof raw === 'string') {
      rawUnitHint += raw;
      const matches = raw.match(/\d+(?:\.\d+)?/g);
      if (matches && matches.length > 0) {
        primaryFromRaw = Number(matches[0]); // 取第一个数字，如 200x200 取 200
        break;
      }
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      primaryFromRaw = raw;
      break;
    }
  }

  const base = Number.isFinite(primaryFromRaw) ? primaryFromRaw : val;
  if (!Number.isFinite(base)) return fallbackMeters;

  let meters = base;
  // 如果原始字符串中包含 DNxxx，优先认为是毫米
  for (const k of candidateKeys) {
    const raw = propertiesRaw && propertiesRaw[k];
    if (typeof raw === 'string' && /DN\s*\d+/i.test(raw)) {
      meters = base / 1000;
      break;
    }
  }
  if (/mm/i.test(rawUnitHint) || meters > 50) meters = meters / 1000;      // 毫米 → 米
  else if (/cm/i.test(rawUnitHint) || meters > 5) meters = meters / 100;   // 厘米 → 米
  // 合理范围夹紧：2cm ~ 2m
  meters = Math.min(Math.max(meters, 0.02), 2.0);
  return meters;
}

// 解析埋深，单位按米处理（若检测到毫米/厘米同上转换）
function parseDepthMeters(properties, candidateKeys, fallbackMeters) {
  const val = getNumericProperty(properties, candidateKeys, undefined);
  if (val == null) return fallbackMeters;
  if (!Number.isFinite(val)) return fallbackMeters;
  if (val > 50) return val / 1000; // 毫米 → 米
  if (val > 5) return val / 100;   // 厘米 → 米
  return val;                      // 米
}

// 根据起终埋深按路径长度线性插值每个顶点的埋深，返回新的地下位置数组
function computeUndergroundPositions(positions, startDepthM, endDepthM) {
  if (!Array.isArray(positions) || positions.length === 0) return positions;
  const cartos = positions.map(p => Cesium.Cartographic.fromCartesian(p));

  // 计算总长度（地表近似）
  let total = 0;
  const seg = [];
  for (let i = 1; i < cartos.length; i++) {
    const g = new Cesium.EllipsoidGeodesic(cartos[i - 1], cartos[i]);
    const d = g.surfaceDistance || 0;
    seg.push(d);
    total += d;
  }
  if (total === 0) {
    // 退化为常量埋深
    return cartos.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, (c.height || 0) - startDepthM));
  }

  let acc = 0;
  const underground = [
    (function first() {
      const c = cartos[0];
      const depth = startDepthM;
      return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, (c.height || 0) - depth);
    })()
  ];
  for (let i = 1; i < cartos.length; i++) {
    acc += seg[i - 1];
    const t = acc / total; // 0..1
    const depth = startDepthM + (endDepthM - startDepthM) * t;
    const c = cartos[i];
    underground.push(Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, (c.height || 0) - depth));
  }
  return underground;
}

      // 3) 创建正确的事件处理器
// 假设你已经有一个 Cesium.Viewer 实例：viewer

let lastSelected = null;

// 使用一个稳健的事件处理器（确保只有一个，避免重复创建）
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

// 清理高亮的帮助函数
function clearHighlight(entity) {
  if (!entity) return;
  if (entity.polygon) {
    entity.polygon.material = Cesium.Color.fromCssColorString("rgba(0,255,255,0.01)");
    entity.polygon.outline = false;
  }
  if (entity.polylineVolume) {
    const pv = entity.polylineVolume;
    if (entity.__origMaterial) {
      pv.material = entity.__origMaterial;
    }
    entity.__origMaterial = undefined;
  }
}

// 高亮目标的帮助函数
function highlightEntity(entity) {
  if (!entity) return;
  if (entity.polygon) {
    const brightYellow = Cesium.Color.YELLOW.withAlpha(0.6);
    entity.polygon.material = brightYellow;
    entity.polygon.outline = true;
    entity.polygon.outlineColor = Cesium.Color.YELLOW;
  }
  if (entity.polylineVolume) {
    const pv = entity.polylineVolume;
    if (!entity.__origMaterial) {
      entity.__origMaterial = pv.material;
    }
    // 亮黄色高亮材质
    const brightYellow = Cesium.Color.YELLOW.withAlpha(1.0);
    pv.material = new Cesium.ColorMaterialProperty(brightYellow);
  }
}

// 鼠标移动事件：显示轨迹
handler.setInputAction(function (movement) {
  // 更新当前鼠标位置
  const ray = viewer.camera.getPickRay(movement.endPosition);
  const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
  if (cartesian) {
    currentMousePosition = Cesium.Cartographic.fromCartesian(cartesian);
  } else {
    currentMousePosition = null;
  }
  
  // 剖面分析模式下的鼠标移动处理（仅用于显示点）
  if (sectionMode && sectionPoints.length === 1) {
    // 清除之前的临时线（使用CallbackProperty后不再需要临时线）
    sectionTempEntities.forEach(entity => viewer.entities.remove(entity));
    sectionTempEntities = [];
  }
  
  // 挖方分析模式下的鼠标移动处理（仅用于显示线）
  if (excavationMode && excavationPoints.length > 0) {
    // 清除之前的临时线（使用CallbackProperty后不再需要临时线）
    excavationTempEntities.forEach(entity => viewer.entities.remove(entity));
    excavationTempEntities = [];
  }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

// 点击事件：高亮并显示 InfoBox（包含管线 polylineVolume）
handler.setInputAction(function (movement) {
  const scene = viewer.scene;
  
  // 处理剖面分析模式
  if (sectionMode) {
    const ray = viewer.camera.getPickRay(movement.position);
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    if (cartesian) {
      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      sectionPoints.push(cartographic);
      
      if (sectionPoints.length === 1) {
        // 显示第一个点
        const pointEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, cartographic.height),
          point: {
            pixelSize: 10,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2
          }
        });
        sectionTempEntities.push(pointEntity);
      } else if (sectionPoints.length === 2) {
        // 剖面分析完成，创建剖面线
        const positions = sectionPoints.map(cart => 
          Cesium.Cartesian3.fromRadians(cart.longitude, cart.latitude, cart.height)
        );
        
        sectionLine = viewer.entities.add({
          polyline: {
            positions: positions,
            width: 4,
            material: Cesium.Color.YELLOW,
            clampToGround: true
          }
        });
        
        // 创建剖面区域
        createSectionVolume(sectionPoints[0], sectionPoints[1]);
        
        // 创建剖面裁剪区域
        createSectionClippingPlanes(sectionPoints[0], sectionPoints[1]);
        
        // 生成剖面图并联动
        buildProfileChart(sectionPoints[0], sectionPoints[1]);
        
        endSectionAnalysis();
      }
    }
    return;
  }
  
  // 处理挖方分析模式
  if (excavationMode) {
    const ray = viewer.camera.getPickRay(movement.position);
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    if (cartesian) {
      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      excavationPoints.push(cartographic);
      
      // 右键完成多边形绘制
      if (movement.button === 2 || excavationPoints.length >= 3) {
        if (excavationPoints.length >= 3) {
          // 挖方分析完成，创建挖方多边形
          const positions = excavationPoints.map(cart => 
            Cesium.Cartesian3.fromRadians(cart.longitude, cart.latitude, cart.height)
          );
          
          excavationPolygon = viewer.entities.add({
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(positions),
              material: Cesium.Color.CYAN.withAlpha(0.3),
              outline: true,
              outlineColor: Cesium.Color.CYAN,
              extrudedHeight: 0,
              height: 0
            }
          });
          
          // 创建挖方区域
          createExcavationVolume(excavationPoints);
          
          // 创建挖方裁剪区域
          createExcavationClippingPlanes(excavationPoints);
          
          // 计算挖方体积
          const volume = calculateExcavationVolume(excavationPoints);
          
          // 分析挖方区域内管线
          const pipelines = analyzeExcavationPipelines(excavationPoints);
          console.log('挖方分析找到管线:', pipelines.length, '条');
          
          // 高亮显示管线
          highlightPipelines(pipelines);
          
          // 显示信息面板
          showExcavationInfo(pipelines, volume);
        }
        
        endExcavationAnalysis();
      } else {
        // 显示临时点
        const pointEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, cartographic.height),
          point: {
            pixelSize: 8,
            color: Cesium.Color.CYAN,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2
          }
        });
        excavationTempEntities.push(pointEntity);
        
        // 如果有多个点，显示连线
        if (excavationPoints.length > 1) {
          const positions = excavationPoints.map(cart => 
            Cesium.Cartesian3.fromRadians(cart.longitude, cart.latitude, cart.height)
          );
          
          const lineEntity = viewer.entities.add({
            polyline: {
              positions: positions,
              width: 2,
              material: Cesium.Color.CYAN.withAlpha(0.7),
              clampToGround: true
            }
          });
          excavationTempEntities.push(lineEntity);
        }
      }
    }
    return;
  }
  
  // 正常的点击选择逻辑
  const picked = scene.pick(movement.position);

  // 添加 App1.vue 的模型点击切换 sh 显示功能
  sh.show = false;
  if (Cesium.defined(picked)) {
    try {
      if (picked._batchId === 0) sh.show = true;
    } catch {}
  }

  if (lastSelected && lastSelected !== (picked && picked.id)) {
    clearHighlight(lastSelected);
    lastSelected = null;
  }

  if (!picked || !picked.id) {
    clearHighlight(lastSelected);
    lastSelected = null;
    return;
  }

  const entity = picked.id;

  // 展示 InfoBox（无论类型，只要有 description）
  if (entity.description) {
    viewer.selectedEntity = entity;
  }

  if (entity.polygon) {
    clearHighlight(lastSelected);
    highlightEntity(entity);
    lastSelected = entity;
  } else if (entity.polylineVolume) {
    clearHighlight(lastSelected);
    highlightEntity(entity);
    lastSelected = entity;
  } else {
    clearHighlight(lastSelected);
    lastSelected = null;
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// 右键点击结束挖方分析
handler.setInputAction(function (movement) {
  if (excavationMode && excavationPoints.length >= 3) {
    // 创建挖方多边形
    const positions = excavationPoints.map(cart => 
      Cesium.Cartesian3.fromRadians(cart.longitude, cart.latitude, cart.height || 0)
    );
    
    excavationPolygon = viewer.entities.add({
      polygon: {
        hierarchy: positions,
        material: Cesium.Color.CYAN.withAlpha(0.3),
        outline: true,
        outlineColor: Cesium.Color.CYAN,
        extrudedHeight: 0,
        height: 0
      }
    });
    
    // 分析挖方区域内管线
    const pipelines = analyzeExcavationPipelines(excavationPoints);
    showPipelineInfo(pipelines, `挖方分析结果 (${pipelines.length}条管线)`);
    
    endExcavationAnalysis();
  }
}, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  // =============== 剖面图：采样、相交、绘制、联动 ===============
  function sampleGroundProfile(startPos, endPos, stepMeter = 1.0) {
    const total = Cesium.Cartesian3.distance(startPos, endPos);
    const steps = Math.max(1, Math.floor(total / stepMeter));
    const result = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = Cesium.Cartesian3.lerp(startPos, endPos, t, new Cesium.Cartesian3());
      const carto = Cesium.Cartographic.fromCartesian(p);
      const h = viewer.scene.globe.getHeight(carto) || 0;
      result.push({ distance: t * total, height: h, cartesian: p });
    }
    return { total, samples: result };
  }

  function getPolylineVolumeRadiusMeters(entity) {
    try {
      const shape = entity.polylineVolume.shape.getValue?.(Cesium.JulianDate.now()) || entity.polylineVolume.shape;
      if (Array.isArray(shape) && shape.length > 0) {
        const maxR = shape.reduce((m, c) => Math.max(m, Math.sqrt(c.x * c.x + c.y * c.y)), 0);
        return maxR; // 已是米
      }
    } catch (e) {}
    return 0.1;
  }

  function projectPointOnLine(startPos, endPos, point) {
    const ab = Cesium.Cartesian3.subtract(endPos, startPos, new Cesium.Cartesian3());
    const ap = Cesium.Cartesian3.subtract(point, startPos, new Cesium.Cartesian3());
    const abLen2 = Cesium.Cartesian3.dot(ab, ab);
    if (abLen2 === 0) return 0;
    const t = Cesium.Cartesian3.dot(ap, ab) / abLen2;
    return Math.min(Math.max(t, 0), 1);
  }

  function collectPipesOnProfile(startCart, endCart, corridorHalfWidth = 25.0) {
    const startPos = Cesium.Cartesian3.fromRadians(startCart.longitude, startCart.latitude, startCart.height);
    const endPos = Cesium.Cartesian3.fromRadians(endCart.longitude, endCart.latitude, endCart.height);
    const total = Cesium.Cartesian3.distance(startPos, endPos);
    const items = [];
    viewer.entities.values.filter(e => e.polylineVolume).forEach(pipe => {
      const pos = pipe.polylineVolume.positions.getValue?.(Cesium.JulianDate.now()) || pipe.polylineVolume.positions;
      if (!Array.isArray(pos) || pos.length < 2) return;
      for (let i = 0; i < pos.length; i++) {
        const p = pos[i];
        // 到剖线的最近距离（近似：与端点的最小距离判定 + 走向投影）
        const d = Cesium.Cartesian3.distance(p, Cesium.Cartesian3.closestPointOnLine?.(startPos, endPos, p) || startPos);
        // 简化：如果没有 closestPointOnLine，使用投影法近似
        let projT;
        if (!Cesium.Cartesian3.closestPointOnLine) {
          projT = projectPointOnLine(startPos, endPos, p);
        }
        if (d <= corridorHalfWidth || projT >= 0 && projT <= 1) {
          const carto = Cesium.Cartographic.fromCartesian(p);
          const groundH = viewer.scene.globe.getHeight(carto) || 0;
          const radius = getPolylineVolumeRadiusMeters(pipe);
          const t = projectPointOnLine(startPos, endPos, p);
          items.push({
            entity: pipe,
            name: pipe.name || '管线',
            objectId: pipe.properties?.ObjectId || pipe.properties?.OBJECTID || pipe.properties?.id || '',
            distance: t * total,
            groundH,
            pipeH: carto.height,
            radius,
            material: (pipe.properties && (pipe.properties['材质'] || pipe.properties['材料'] || pipe.properties['material'])) || ''
          });
          break;
        }
      }
    });
    return { total, items };
  }

  function ensureProfileChart() {
    const panel = document.getElementById('profilePanel');
    const chartEl = document.getElementById('profileChart');
    const closeBtn = document.getElementById('btnCloseProfile');
    if (!panel || !chartEl) return null;
    panel.style.display = 'block';
    if (!profileChart && window.echarts) {
      profileChart = window.echarts.init(chartEl);
    } else if (!window.echarts) {
      // 无 ECharts 时的降级显示，保证面板可见
      chartEl.innerHTML = '<div style="padding:12px;color:#eaf6ff;">正在加载剖面图组件或网络较慢…</div>';
    }
    if (closeBtn) {
      closeBtn.onclick = () => {
        panel.style.display = 'none';
        if (profileIndicator) {
          viewer.entities.remove(profileIndicator);
          profileIndicator = null;
        }
      };
    }
    return profileChart;
  }

  function setIndicatorAtDistance(distance) {
    if (!profileStart || !profileEnd) return;
    const t = Math.min(Math.max(distance / profileTotalLen, 0), 1);
    const p = Cesium.Cartesian3.lerp(profileStart, profileEnd, t, new Cesium.Cartesian3());
    if (!profileIndicator) {
      profileIndicator = viewer.entities.add({
        position: p,
        point: { pixelSize: 10, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 }
      });
    } else {
      profileIndicator.position = p;
    }
    viewer.flyTo(profileIndicator, { duration: 0.5, maximumHeight: undefined });
  }

  function buildProfileChart(startCart, endCart) {
    const chart = ensureProfileChart();
    if (!chart) return;
    const startPos = Cesium.Cartesian3.fromRadians(startCart.longitude, startCart.latitude, startCart.height);
    const endPos = Cesium.Cartesian3.fromRadians(endCart.longitude, endCart.latitude, endCart.height);
    profileStart = startPos; profileEnd = endPos;
    const { total, samples } = sampleGroundProfile(startPos, endPos, 1.0);
    profileTotalLen = total;
    // 改为纵向剖面：横轴=高程，纵轴=里程
    const groundSeries = samples.map(s => [Number(s.height.toFixed(2)), Number(s.distance.toFixed(2))]);

    // 收集剖面内的管线点（简化：管心）
    const { items } = collectPipesOnProfile(startCart, endCart, 50.0);
    const pipeScatter = items.map(d => [Number(d.pipeH.toFixed(2)), Number(d.distance.toFixed(2)), d]);

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        formatter(params) {
          if (!Array.isArray(params)) params = [params];
          const lines = [];
          params.forEach(p => {
            if (p.seriesName === '地面') {
              lines.push(`里程 ${p.value[1]} m，地面高程 ${p.value[0]} m`);
            } else if (p.seriesName === '管线') {
              const extra = p.value[2];
              if (extra) {
                lines.push(`管线：${extra.name} (ObjectId:${extra.objectId || '-'})`);
                lines.push(`高程 ${p.value[0]} m，半径 ${Number(extra.radius.toFixed(2))} m`);
                if (extra.material) lines.push(`材质：${extra.material}`);
              }
            }
          });
          return lines.join('<br/>');
        }
      },
      xAxis: { name: '高程(m)', type: 'value', scale: true },
      yAxis: { name: '里程(m)', type: 'value', min: 0, max: Number(total.toFixed(2)) },
      grid: { left: 50, right: 20, top: 30, bottom: 40 },
      series: [
        { name: '地面', type: 'line', data: groundSeries, smooth: true, lineStyle: { color: '#ddd' } },
        { name: '管线', type: 'scatter', data: pipeScatter, symbolSize: function (val) { const extra = val[2]; return Math.max(6, Math.min(24, (extra?.radius || 0.1) * 100)); }, itemStyle: { color: '#6cf' } }
      ]
    };
    chart.setOption(option);

    // 图表联动：鼠标移动 → Cesium 指示点
    chart.getZr().off('mousemove');
    chart.getZr().on('mousemove', function (evt) {
      const pointInPixel = [evt.offsetX, evt.offsetY];
      const axisVals = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, pointInPixel);
      // 纵向剖面：使用纵轴(里程)的值
      if (Array.isArray(axisVals) && Number.isFinite(axisVals[1])) {
        setIndicatorAtDistance(axisVals[1]);
      }
    });

    // 信息面板：列出剖面内管线名称与 ObjectId
    const pipelines = items.map(it => ({
      entity: it.entity,
      name: it.name,
      properties: { ObjectId: it.objectId, 材质: it.material, 半径米: it.radius.toFixed(2) },
      distance: it.distance
    }));
    showPipelineInfo(pipelines, `剖面分析结果 (${pipelines.length}条管线)`);
    highlightPipelines(pipelines);
  }

});



  

/* viewer.screenSpaceEventHandler.setInputAction(function onLeftClick(event) {

     // 选择新要素
     const pickedFeature = viewer.scene.pick(event.position);
     if (!Cesium.defined(pickedFeature)) {
         return;
     }
     
 }, Cesium.ScreenSpaceEventType.LEFT_CLICK)*/





  ///////////////////////////////////////////////////////
/* 5. 创建红色圆点 canvas */
  /* 5. 自适应红色圆点 billboard */
  function createScaledRedDot() {
    // 16×16 的基础 canvas
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(8, 8, 6, 0, 2 * Math.PI);
    ctx.fillStyle = 'red';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 0.3;
    ctx.stroke();
    return canvas; // 返回 HTMLCanvasElement
  }

  /* 6. 批量添加红点并绑定点击跳转 */
  const redPoints = [
    { lon: 118.22840000032071, lat: 35.10694586947898, url: 'http://192.168.2.6:3001 ' },//pic1
    { lon: 118.22810000032071, lat: 35.10656486947898, url: 'http://192.168.2.6:3096 ' },//pic96
    { lon: 118.22770600000000, lat: 35.10656486947898, url: 'http://192.168.2.6:3002 ' },//pic2
    { lon: 118.22731100000000, lat: 35.10656486947898, url: 'http://192.168.2.6:3003 ' },//pic3
    { lon: 118.22693300000000, lat: 35.10656486947898, url: 'http://192.168.2.6:3097 ' },//pic4
    { lon: 118.22655500000000, lat: 35.10656486947898, url: 'http://192.168.2.6:3004' },//pic97
    { lon: 118.22655500000000, lat: 35.10632486947898, url: 'http://192.168.2.6:3005 ' },//pic5
    { lon: 118.22655500000000, lat: 35.10604486947898, url: 'http://192.168.2.6:3006' },//pic98
    { lon: 118.22693300000000, lat: 35.10604486947898, url: 'http://192.168.2.6:3098 ' },//pic6
    { lon: 118.22731100000000, lat: 35.10604486947898, url: 'http://192.168.2.6:3007 ' },//pic7
    { lon: 118.22770600000000, lat: 35.10604486947898, url: 'http://192.168.2.6:3099 ' },//pic8
    { lon: 118.22810000032071, lat: 35.10604486947898, url: 'http://192.168.2.6:3008' },//pic99
    { lon: 118.22810000032071, lat: 35.10632486947898, url: 'http://192.168.2.6:3009 ' },//pic9
    { lon: 118.22810000032071, lat: 35.10569999999999, url: 'http://192.168.2.6:3010' },//pic100
    { lon: 118.22770600000000, lat: 35.10569999999999, url: 'http://192.168.2.6:3011 ' },//pic10
    { lon: 118.22731100000000, lat: 35.10569999999999, url: 'http://192.168.2.6:3011 ' },//pic11
    { lon: 118.22693300000000, lat: 35.10569999999999, url: 'http://192.168.2.6:3012 ' },//pic12
    { lon: 118.22655500000000, lat: 35.10569999999999, url: 'http://192.168.2.6:3012' },//pic101
    { lon: 118.22655500000000, lat: 35.10544526147898, url: 'http://192.168.2.6:3013 ' },//pic13
    { lon: 118.22655500000000, lat: 35.10516526147898, url: 'http://192.168.2.6:3014' },//pic102
    { lon: 118.22693300000000, lat: 35.10516526147898, url: 'http://192.168.2.6:3015 ' },//pic14
    { lon: 118.22731100000000, lat: 35.10516526147898, url: 'http://192.168.2.6:3015 ' },//pic15
    { lon: 118.22770600000000, lat: 35.10516526147898, url: 'http://192.168.2.6:3016 ' },//pic16
    { lon: 118.22810000032071, lat: 35.10516526147898, url: 'http://192.168.2.9:3016' },//pic103（从这里开始保持 192.168.2.9）
    { lon: 118.22810000032071, lat: 35.10544526147898, url: 'http://192.168.2.9:3017 ' },//pic17
    { lon: 118.22810000032071, lat: 35.10483526147898, url: 'http://192.168.2.9:3018' },//pic104
    { lon: 118.22770600000000, lat: 35.10483526147898, url: 'http://192.168.2.9:3019 ' },//pic18
    { lon: 118.22731100000000, lat: 35.10483526147898, url: 'http://192.168.2.9:3019 ' },//pic19
    { lon: 118.22693300000000, lat: 35.10483526147898, url: 'http://192.168.2.9:3020 ' },//pic20
    { lon: 118.22655500000000, lat: 35.10483526147898, url: 'http://192.168.2.9:3020' },//pic105
    { lon: 118.22655500000000, lat: 35.10455526147898, url: 'http://192.168.2.9:3021 ' },//pic21
    { lon: 118.22655500000000, lat: 35.10427526147898, url: 'http://192.168.2.9:3022' },//pic106
    { lon: 118.22693300000000, lat: 35.10427526147898, url: 'http://192.168.2.9:3023 ' },//pic22
    { lon: 118.22731100000000, lat: 35.10427526147898, url: 'http://192.168.2.9:3023 ' },//pic23
    { lon: 118.22770600000000, lat: 35.10427526147898, url: 'http://192.168.2.9:3024 ' },//pic24
    { lon: 118.22810000032071, lat: 35.10427526147898, url: 'http://192.168.2.9:3024' },//pic107 
    { lon: 118.22810000032071, lat: 35.10455526147898, url: 'http://192.168.2.9:3025 ' },//pic25
    { lon: 118.22810000032071, lat: 35.10394526147898, url: 'http://192.168.2.9:3026' },//pic108
    { lon: 118.22770600000000, lat: 35.10394526147898, url: 'http://192.168.2.9:3027 ' },//pic26
    { lon: 118.22731100000000, lat: 35.10394526147898, url: 'http://192.168.2.9:3027 ' },//pic27
    { lon: 118.22693300000000, lat: 35.10394526147898, url: 'http://192.168.2.9:3028 ' },//pic28
    { lon: 118.22655500000000, lat: 35.10394526147898, url: 'http://192.168.2.9:3028' },//pic109
    { lon: 118.22655500000000, lat: 35.10366526147898, url: 'http://192.168.2.9:3029 ' },//pic29
    { lon: 118.22655500000000, lat: 35.10338526147898, url: 'http://192.168.2.9:3030' },//pic110
    { lon: 118.22693300000000, lat: 35.10338526147898, url: 'http://192.168.2.9:3031 ' },//pic30
    { lon: 118.22731100000000, lat: 35.10338526147898, url: 'http://192.168.2.9:3031 ' },//pic31
    { lon: 118.22770600000000, lat: 35.10338526147898, url: 'http://192.168.2.9:3032 ' },//pic32
    { lon: 118.22810000032071, lat: 35.10338526147898, url: 'http://192.168.2.9:3032' },//pic111
    { lon: 118.22810000032071, lat: 35.10366526147898, url: 'http://192.168.2.9:3033 ' },//pic33
    { lon: 118.23060000032071, lat: 35.10656476947898, url: 'http://192.168.2.9:3034' },//pic112
    { lon: 118.23012500000000, lat: 35.10656476947898, url: 'http://192.168.2.9:3035 ' },//pic34
    { lon: 118.22965000032071, lat: 35.10656476947898, url: 'http://192.168.2.9:3035 ' },//pic35
    { lon: 118.22915000000000, lat: 35.10656476947898, url: 'http://192.168.2.9:3036 ' },//pic36
    { lon: 118.22865000032071, lat: 35.10656476947898, url: 'http://192.168.2.9:3036' },//pic113
    { lon: 118.22865000032071, lat: 35.10632486947898, url: 'http://192.168.2.9:3037 ' },//pic37
    { lon: 118.22865000032071, lat: 35.10604486947898, url: 'http://192.168.2.9:3038' },//pic114
    { lon: 118.22915000000000, lat: 35.10604486947898, url: 'http://192.168.2.9:3039 ' },//pic38
    { lon: 118.22965000032071, lat: 35.10604486947898, url: 'http://192.168.2.9:3039 ' },//pic39
    { lon: 118.23012500000000, lat: 35.10604486947898, url: 'http://192.168.2.9:3040 ' },//pic40
    { lon: 118.23060000032071, lat: 35.10604486947898, url: 'http://192.168.2.9:3040' },//pic115
    { lon: 118.23060000032071, lat: 35.10632486947898, url: 'http://192.168.2.9:3041 ' },//pic41
    { lon: 118.23060000032071, lat: 35.10569999999999, url: 'http://192.168.2.9:3042' },//pic116
    { lon: 118.23012500000000, lat: 35.10569999999999, url: 'http://192.168.2.9:3043 ' },//pic42
    { lon: 118.22965000032071, lat: 35.10569999999999, url: 'http://192.168.2.9:3043 ' },//pic43
    { lon: 118.22915000000000, lat: 35.10569999999999, url: 'http://192.168.2.9:3044 ' },//pic44
    { lon: 118.22865000032071, lat: 35.10569999999999, url: 'http://192.168.2.9:3044' },//pic117
    { lon: 118.22865000032071, lat: 35.10544526147898, url: 'http://192.168.2.9:3045 ' },//pic45
    { lon: 118.22865000032071, lat: 35.10516526147898, url: 'http://192.168.2.9:3046' },//pic118
    { lon: 118.22915000000000, lat: 35.10516526147898, url: 'http://192.168.2.9:3047 ' },//pic46
    { lon: 118.22965000032071, lat: 35.10516526147898, url: 'http://192.168.2.9:3047 ' },//pic47
    { lon: 118.23012500000000, lat: 35.10516526147898, url: 'http://192.168.2.9:3048 ' },//pic48
    { lon: 118.23060000032071, lat: 35.10516526147898, url: 'http://192.168.2.9:3048' },//pic119
    { lon: 118.23060000032071, lat: 35.10544526147898, url: 'http://192.168.2.9:3049 ' },//pic49
    { lon: 118.23060000032071, lat: 35.10483526147898, url: 'http://192.168.2.9:3050' },//pic120
    { lon: 118.23012500000000, lat: 35.10483526147898, url: 'http://192.168.2.9:3051 ' },//pic50
    { lon: 118.22965000032071, lat: 35.10483526147898, url: 'http://192.168.2.9:3051 ' },//pic51
    { lon: 118.22915000000000, lat: 35.10483526147898, url: 'http://192.168.2.9:3052 ' },//pic52
    { lon: 118.22865000032071, lat: 35.10483526147898, url: 'http://192.168.2.9:3052' },//pic121
    { lon: 118.22865000032071, lat: 35.10455526147898, url: 'http://192.168.2.9:3053 ' },//pic53
    { lon: 118.22865000032071, lat: 35.10427526147898, url: 'http://192.168.2.9:3054' },//pic122
    { lon: 118.22915000000000, lat: 35.10427526147898, url: 'http://192.168.2.9:3055 ' },//pic54
    { lon: 118.22965000032071, lat: 35.10427526147898, url: 'http://192.168.2.9:3055 ' },//pic55
    { lon: 118.23012500000000, lat: 35.10427526147898, url: 'http://192.168.2.9:3055 ' },//pic56
    { lon: 118.23060000032071, lat: 35.10427526147898, url: 'http://192.168.2.9:3056' },//pic123
    { lon: 118.23060000032071, lat: 35.10455526147898, url: 'http://192.168.2.9:3057 ' },//pic57
    { lon: 118.23010000032071, lat: 35.10394526147898, url: 'http://192.168.2.9:3058' },//pic124
    { lon: 118.22972500000000, lat: 35.10394526147898, url: 'http://192.168.2.9:3059' },//pic58
    { lon: 118.22935000032071, lat: 35.10394526147898, url: 'http://192.168.2.9:3059 ' },//pic59
    { lon: 118.22900000000000, lat: 35.10394526147898, url: 'http://192.168.2.9:3060' },//pic60
    { lon: 118.22865000032071, lat: 35.10394526147898, url: 'http://192.168.2.9:3060' },//pic125
    { lon: 118.22865000032071, lat: 35.10366526147898, url: 'http://192.168.2.9:3061 ' },//pic61
    { lon: 118.22865000032071, lat: 35.10338526147898, url: 'http://192.168.2.9:3062' },//pic126
    { lon: 118.22900000000000, lat: 35.10338526147898, url: 'http://192.168.2.9:3063' },//pic62
    { lon: 118.22935000032071, lat: 35.10338526147898, url: 'http://192.168.2.9:3063 ' },//pic63
    { lon: 118.22972500000000, lat: 35.10338526147898, url: 'http://192.168.2.9:3064' },//pic64
    { lon: 118.23010000032071, lat: 35.10338526147898, url: 'http://192.168.2.9:3064' },//pic127
    { lon: 118.23010000032071, lat: 35.10366526147898, url: 'http://192.168.2.9:3065 ' },//pic65
    { lon: 118.22770000000000, lat: 35.10308526147898, url: 'http://192.168.2.9:3066' },//pic66
    { lon: 118.22647999999999, lat: 35.10308526147898, url: 'http://192.168.2.9:3067 ' },//pic67
    { lon: 118.22647999999999, lat: 35.10277526147898, url: 'http://192.168.2.9:3068' },//pic68
    { lon: 118.22647999999999, lat: 35.10249526147898, url: 'http://192.168.2.9:3069 ' },//pic69
    { lon: 118.22770000000000, lat: 35.10249526147898, url: 'http://192.168.2.9:3070' },//pic70
    { lon: 118.22770000000000, lat: 35.10277526147898, url: 'http://192.168.2.9:3071 ' },//pic71
    { lon: 118.22770000000000, lat: 35.10217526147898, url: 'http://192.168.2.9:3072' },//pic72
    { lon: 118.22647999999999, lat: 35.10217526147898, url: 'http://192.168.2.9:3073 ' },//pic73
    { lon: 118.22647999999999, lat: 35.10189526147898, url: 'http://192.168.2.9:3074' },//pic74   
    { lon: 118.22647999999999, lat: 35.10161526147898, url: 'http://192.168.2.9:3075 ' },//pic75
    { lon: 118.22647999999999, lat: 35.10133526147898, url: 'http://192.168.2.9:3076' },//pic76
    { lon: 118.22770000000000, lat: 35.10133526147898, url: 'http://192.168.2.9:3077 ' },//pic77
    { lon: 118.22770000000000, lat: 35.10161526147898, url: 'http://192.168.2.9:3078' },//pic78 
    { lon: 118.22770000000000, lat: 35.10189526147898, url: 'http://192.168.2.9:3079 ' },//pic79
    { lon: 118.22900000000000, lat: 35.10217526147898, url: 'http://192.168.2.9:3080' },//pic80
    { lon: 118.22810000032071, lat: 35.10217526147898, url: 'http://192.168.2.9:3081 ' },//pic81
    { lon: 118.22810000032071, lat: 35.10189526147898, url: 'http://192.168.2.9:3082' },//pic82
    { lon: 118.22810000032071, lat: 35.10161526147898, url: 'http://192.168.2.9:3083 ' },//pic83
    { lon: 118.22810000032071, lat: 35.10133526147898, url: 'http://192.168.2.9:3084' },//pic84
    { lon: 118.22900000000000, lat: 35.10133526147898, url: 'http://192.168.2.9:3085 ' },//pic85
    { lon: 118.22900000000000, lat: 35.10161526147898, url: 'http://192.168.2.9:3086 ' },//pic86
    { lon: 118.22900000000000, lat: 35.10189526147898, url: 'http://192.168.2.9:3087 ' },//pic87
    { lon: 118.22935000032071, lat: 35.10308526147898, url: 'http://192.168.2.9:3088 ' },//pic88
    { lon: 118.22865000032071, lat: 35.10308526147898, url: 'http://192.168.2.9:3089 ' },//pic89
    { lon: 118.22810000032071, lat: 35.10308526147898, url: 'http://192.168.2.9:3090 ' },//pic90
    { lon: 118.22810000032071, lat: 35.10277526147898, url: 'http://192.168.2.9:3091 ' },//pic91
    { lon: 118.22810000032071, lat: 35.10249526147898, url: 'http://192.168.2.9:3092 ' },//pic92
    { lon: 118.22865000032071, lat: 35.10249526147898, url: 'http://192.168.2.9:3093 ' },//pic93
    { lon: 118.22935000032071, lat: 35.10249526147898, url: 'http://192.168.2.9:3094 ' },//pic94
    { lon: 118.22935000032071, lat: 35.10277526147898, url: 'http://192.168.2.9:3095 ' },//pic95

  // 可以继续添加更多点
  ];
  /* 7. 批量添加 billboard（红点）- 融合 App1.vue 的鼠标接近显示功能 */
  const redEntities = []; // 保存引用方便后续查找
  redPoints.forEach((pt) => {
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, 50),
      billboard: {
        image: createScaledRedDot(),
        scaleByDistance: new Cesium.NearFarScalar(1, 1, 8000, 0.4),
        width: 32,
        height: 32,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: false, // 初始隐藏，鼠标接近时才显示
      },
    });
    entity.url = pt.url;
    entity.lon = pt.lon;
    entity.lat = pt.lat;
    redEntities.push(entity);
  });

  /* 鼠标移动事件：靠近才显示红点（从 App1.vue 移植） */
  const mouseMoveRedDotHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  mouseMoveRedDotHandler.setInputAction((movement) => {
    const mousePosition = viewer.scene.pickPosition(movement.endPosition);
    if (!mousePosition) return;

    redEntities.forEach((entity) => {
      const pointPosition = Cesium.Cartesian3.fromDegrees(entity.lon, entity.lat, 50);
      const distance = Cesium.Cartesian3.distance(mousePosition, pointPosition);
      entity.billboard.show = distance < 50; // 50 米内显示
    });
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  /* 7. 统一监听点击事件 */
  viewer.screenSpaceEventHandler.setInputAction((event) => {
    const pickedObject = viewer.scene.pick(event.position);
    if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.url) {
      window.open(pickedObject.id.url, '_blank');
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  ///////////////////////////////////////////////////////




})  

</script>  

<style>  
* {  
  box-sizing: border-box;  
  padding: 0;  
  margin: 0;  
}  

#app {  
  margin: 0;  
  padding: 0;  
}  

#cesiumContainer {  
  width: 100vw;  
  height: 100vh;  
}  

.left-pane {
  position: absolute;
  top: 20px;
  left: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 1000;
}

.tool-panel {
  position: relative;
  background: rgba(42, 42, 42, 0.9);
  padding: 15px;
  border-radius: 8px;
  color: white;
  font-family: Arial, sans-serif;
  z-index: 1;
  min-width: 250px;
  max-height: 40vh;
  overflow-y: auto;
}

.control-group {
  margin-bottom: 20px;
}

.control-group h3 {
  margin: 0 0 15px 0;
  font-size: 16px;
  color: #fefefe;
  border-bottom: 1px solid #555;
  padding-bottom: 5px;
}

.tool-panel .row {
  display: flex;
  flex-direction: column;
  margin-bottom: 15px;
  gap: 8px;
}

.tool-panel label {
  font-size: 14px;
  font-weight: bold;
}

.tool-panel input[type="range"] {
  width: 100%;
  margin: 5px 0;
}

.tool-panel button {
  background: #007acc;
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  margin-bottom: 8px;
  width: 100%;
  transition: background 0.3s;
}

.tool-panel button:hover {
  background: #005a9e;
}

.tool-panel button:active {
  background: #004080;
}

.info-panel {
  background: rgba(30, 30, 30, 0.95);
  border-radius: 8px;
  padding: 15px;
  margin-top: 10px;
}

.info-panel h3 {
  margin: 0 0 15px 0;
  font-size: 16px;
  color: #FFD700;
  border-bottom: 1px solid #555;
  padding-bottom: 5px;
}

.info-content {
  max-height: 300px;
  overflow-y: auto;
}

.pipeline-item {
  background: rgba(60, 60, 60, 0.8);
  margin: 8px 0;
  padding: 10px;
  border-radius: 4px;
  border-left: 4px solid #007acc;
}

.pipeline-item h4 {
  margin: 0 0 8px 0;
  color: #FFD700;
  font-size: 14px;
}

.pipeline-item .property {
  display: flex;
  justify-content: space-between;
  margin: 4px 0;
  font-size: 12px;
}

.pipeline-item .property .label {
  color: #ccc;
  font-weight: bold;
}

.pipeline-item .property .value {
  color: #fff;
}

/* 左侧图例/统计面板样式 */
.legend-panel {
  position: relative;
  background: rgba(42, 42, 42, 0.9);
  color: #fff;
  padding: 12px 14px;
  border-radius: 8px;
  z-index: 1000;
  min-width: 250px;
  max-height: 40vh;
  overflow-y: auto;
}

.legend-panel h3 {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: #fefefe;
  border-bottom: 1px solid #555;
  padding-bottom: 6px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  font-size: 14px;
}

.legend-item .swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  display: inline-block;
  border: 1px solid rgba(255,255,255,0.4);
}

.legend-item .name { color: #fff; }
.legend-item .count { color: #bbb; margin-left: auto; }

/* 剖面图面板 */
.profile-panel {
  position: absolute;
  right: 20px; /* 右侧 */
  bottom: 20px; /* 底部 */
  width: min(520px, 40vw);
  background: rgba(32, 96, 160, 0.68); /* 半透明蓝系，与属性面板区分 */
  color: #eaf6ff;
  border-radius: 10px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.35);
  z-index: 3000;
}
.profile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.25);
  font-size: 14px;
}
.profile-header .title { margin-left: auto; color: #bfe3ff; font-weight: 600; }
.profile-header button {
  background: rgba(0,0,0,0.25);
  color: #eaf6ff;
  border: none;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
}
.profile-header button:hover { background: rgba(0,0,0,0.4); }
.profile-chart {
  width: 100%;
  height: 320px;
  min-height: 240px;
}
</style>  