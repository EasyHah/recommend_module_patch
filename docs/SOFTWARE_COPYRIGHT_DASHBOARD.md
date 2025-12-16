# 智慧物流园区信息感知发布系统 - 软件著作权申请材料草案

## 1. 软件基本信息

*   **软件全称**：智慧物流园区信息感知发布系统
*   **软件简称**：智慧园区感知系统
*   **版本号**：V1.0
*   **开发完成日期**：2025年11月18日
*   **发表状态**：未发表 / 已发表（根据实际情况选择）

## 2. 开发目的

本软件旨在解决传统物流园区信息孤岛、数据可视化程度低、监控手段单一等问题。通过集成三维地理信息系统（GIS）、物联网（IoT）数据接入、实时数据分析与可视化技术，构建一个集“感知、分析、发布、交互”于一体的综合管理平台。系统能够实时展示园区物流态势、仓储状态、环境监测数据，并提供直观的三维全景漫游与即时信息发布功能，辅助管理者进行科学决策，提升园区运营效率与智能化水平。

## 3. 技术特点

1.  **基于 WebGL 的三维可视化**：采用 Cesium 引擎构建高精度三维园区场景，支持海量地理空间数据的加载与渲染，实现从宏观全景到微观设施的无缝缩放与漫游。
2.  **组件化数据看板设计**：基于 Vue 3 和 ECharts 开发了高度可配置的数据可视化组件（如雷达图、环形图、趋势图），支持多维度数据的实时动态展示。
3.  **响应式流体布局**：采用现代化的流体布局设计（Fluent Design），支持左右侧边栏的动态折叠、固定与悬浮，自适应不同分辨率屏幕，提供沉浸式的用户体验。
4.  **模块化架构**：系统采用模块化设计，包含地图视图、数据看板、全景查看器、语音助手等独立模块，便于功能扩展与维护。
5.  **多源数据融合**：支持接入物流仓储数据、气象数据、视频监控流等多源异构数据，并在统一的时空框架下进行融合展示。

## 4. 软件功能描述

本系统主要包含以下核心功能模块：

### 4.1 综合态势感知看板 (Dashboard)
*   **功能描述**：作为系统的主界面，集成地图视图与左右侧数据面板，提供园区运行状态的全局概览。
*   **详细特性**：
    *   **实时数据展示**：通过左侧面板展示园区关键指标，如入园车辆数、仓储利用率、今日订单量等。
    *   **图表分析**：集成环形图（DonutChart）、雷达图（RadarChart）和趋势图（ProfileChart），直观展示各类物流数据的占比与变化趋势。
    *   **交互式布局**：用户可根据需要展开、收起或固定左右侧边栏，自定义屏幕空间分配，支持全屏模式专注于地图监控。

### 4.2 三维全景巡检 (Panoramic Inspection)
*   **功能描述**：提供基于全景图像的沉浸式园区巡检功能。
*   **详细特性**：
    *   **全景漫游**：支持加载高分辨率全景图，用户可进行360度旋转查看，模拟实地巡检体验。
    *   **点位联动**：在三维地图上标记全景点位，点击即可快速切换至对应的全景视图。
    *   **多模式支持**：支持本地全景资源加载及外部全景链接嵌入。

### 4.3 物流信息发布与查询
*   **功能描述**：管理并展示物流节点、仓储中心及供应商信息。
*   **详细特性**：
    *   **节点可视化**：在地图上以图标形式标注仓库、配送中心位置，支持聚合显示。
    *   **详情查询**：点击地图要素或列表项，右侧面板自动弹出详细信息（如仓库容量、负责人、联系方式）。
    *   **路径规划**：支持查看物流运输路线，展示关键途径城市与节点。

### 4.4 智能辅助交互
*   **功能描述**：提供便捷的人机交互辅助工具。
*   **详细特性**：
    *   **语音助手**：集成语音识别与指令解析功能，支持通过语音指令切换视图、查询数据。
    *   **天气监测**：实时显示园区及周边天气状况，提供气象预警信息。

## 5. 运行环境

### 5.1 硬件环境
*   **服务器端**：
    *   CPU：8核 2.5GHz 及以上
    *   内存：16GB 及以上
    *   硬盘：500GB SSD 及以上
*   **客户端**：
    *   CPU：Intel Core i5 / AMD Ryzen 5 及以上
    *   内存：8GB 及以上
    *   显卡：支持 WebGL 2.0 的独立显卡或高性能核显

### 5.2 软件环境
*   **操作系统**：Windows 10/11, Linux (Ubuntu/CentOS), macOS
*   **运行平台**：Node.js 18+ (服务端), Nginx (静态资源托管)
*   **浏览器**：Chrome 90+, Edge 90+, Firefox 88+ (需支持 WebGL)
*   **开发语言**：TypeScript, JavaScript, HTML5, CSS3
*   **开发框架**：Vue.js 3.x, Vite, Cesium.js, ECharts

## 6. 代码规模
*   **代码行数**：约 15,000 行（估算，含前端组件、样式及逻辑代码）

## 7. 核心代码摘录

### 7.1 地图图层控制 (MapView.vue)
```vue
<!-- 图层面板（右上角，可折叠） -->
<div class="layer-panel" :class="{ collapsed: panelCollapse.layers }">
  <div class="row title">
    <span>图层</span>
    <button class="collapse-btn" @click="panelCollapse.layers = !panelCollapse.layers" :title="panelCollapse.layers ? '展开' : '收起'">{{ panelCollapse.layers ? '＋' : '－' }}</button>
  </div>
  <transition name="panel-fade">
    <div v-show="!panelCollapse.layers" class="panel-body">
      <label class="row"><input type="checkbox" v-model="ui.osgb"> OSGB 建筑</label>
      <label class="row"><input type="checkbox" v-model="ui.factory"> 厂房模型</label>
      <label class="row small" v-if="ui.factory"><input type="checkbox" v-model="ui.factoryRoofOpen"> 厂房掀盖</label>
      
      <div class="row sep"></div>

      <!-- 天气图层控制 -->
      <label class="row">
        <input type="checkbox" v-model="ui.weather"> 天气图层
      </label>
      <template v-if="ui.weather">
        <label class="row small"><input type="checkbox" v-model="ui.temperature"> 温度分布</label>
        <label class="row small"><input type="checkbox" v-model="ui.precipitation"> 降水预报</label>
        <label class="row small"><input type="checkbox" v-model="ui.wind"> 风力风向</label>
        <div class="row small">透明度：{{ ui.weatherOpacity }}%</div>
        <input class="slider" type="range" min="10" max="100" step="10" v-model.number="ui.weatherOpacity" />
      </template>
    </div>
  </transition>
</div>
```

### 7.2 数据看板组件 (LeftSidebar.vue)
```vue
<template>
  <aside class='side'>
    <FluentCard title='今日巡场统计' strong>
      <div class='stats'>
        <div class='stat' v-for='s in stats' :key='s.label'>
          <div class='dot' :style='{background:s.color}'>{{ s.value }}</div>
          <div class='lab'>{{ s.label }}</div>
        </div>
      </div>
    </FluentCard>
    <FluentCard title='重要设备巡查覆盖率' strong>
      <RadarChart :indicators='equipIndicators' :values='equipValues' :fill='true' />
    </FluentCard>
  </aside>
</template>
<script setup lang='ts'>
import FluentCard from '@/components/FluentCard.vue';
import RadarChart from '@/components/RadarChart.vue';
const stats=[
  {label:'场外车辆',value:5,color:'#4C8BF5'},
  {label:'设备故障',value:5,color:'#E91E63'},
  {label:'应急救援',value:12,color:'#FFC107'},
  {label:'危险物品',value:2,color:'#00BFA5'}
];
</script>
```

---
*注：以上内容为申请软件著作权所需的技术文档草案，请根据实际申报要求进行调整。*
