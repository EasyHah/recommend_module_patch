# 基于数字孪生的物流园区应急疏散演练系统 - 软件著作权申请材料草案

## 1. 软件基本信息

*   **软件全称**：基于数字孪生的物流园区应急疏散演练系统
*   **软件简称**：园区应急演练系统
*   **版本号**：V1.0
*   **开发完成日期**：2025年11月18日

## 2. 开发目的

针对物流园区人员密集、货物堆积、火灾风险高且疏散难度大的特点，开发本系统。利用数字孪生技术构建园区的虚拟映射，模拟火灾、泄漏等突发事件下的环境变化，通过三维可视化手段演示最佳疏散路径与救援方案。系统旨在替代高成本、低频次的实地演练，提供常态化、可视化的安全培训与应急预案推演工具。

## 3. 技术特点

1.  **高保真三维场景**：基于 **Cesium** 引擎加载园区 BIM 模型与倾斜摄影数据，真实还原仓库、道路、消防设施的空间分布。
2.  **多视角沉浸式模拟**：支持第一人称（逃生者视角）、第三人称（上帝视角）、无人机俯瞰视角及 CCTV 监控视角等多维度观察模式，全方位评估疏散方案。
3.  **动态路径规划算法**：集成 A* 或 Dijkstra 寻路算法，结合实时路况与火势蔓延模型，动态计算并展示最优逃生路线。
4.  **环境影响分析**：融合气象数据（风向、风速），模拟烟雾扩散趋势，评估天气对疏散效率的影响。
5.  **多媒体融合演示**：支持在三维场景中嵌入疏散教学视频、警示图标与动态标牌，增强演练的指导性。

## 4. 软件功能描述

### 4.1 应急疏散模拟 (Fire Evacuation Simulation)
*   **场景库管理**：内置多种典型事故场景（如A区仓库起火、化学品泄漏），支持场景切换与参数配置。
*   **视频联动**：点击特定区域可播放对应的疏散模拟视频，展示正确的逃生动作与路线。
*   **视角切换**：用户可一键切换至“监控室视角”查看全局，或“现场视角”体验紧迫感。

### 4.2 路径规划与导航 (Route Planning)
*   **智能寻路**：根据起火点位置，自动计算避开危险区域的安全路径，并在地图上以高亮线条绘制。
*   **关键节点标注**：自动标记沿途的灭火器、消防栓、紧急出口位置。
*   **路况模拟**：模拟道路拥堵或障碍物阻断情况下的备选路线规划。

### 4.3 气象与环境监测 (Weather Analysis)
*   **实时气象接入**：显示当前的温度、湿度、风力风向数据。
*   **影响评估**：分析恶劣天气（如大风、暴雨）对救援车辆进出及人员疏散速度的影响，辅助制定针对性预案。

### 4.4 演练评估与教学
*   **演练回放**：支持对模拟演练过程进行录制与回放，便于复盘分析。
*   **知识库集成**：关联消防安全知识文档与操作手册，提供即时查询功能。

## 5. 运行环境

*   **客户端**：
    *   浏览器：Chrome / Edge / Firefox (需支持 WebGL 2.0)
    *   显卡：NVIDIA GTX 1060 / AMD RX 580 及以上（保证三维渲染流畅度）
*   **数据源**：
    *   GIS 地理信息服务
    *   园区 BIM 模型数据库

## 6. 代码规模
*   **代码行数**：约 10,000 行（含三维场景构建、路径算法及模拟逻辑）

## 7. 核心代码摘录

### 7.1 多视角视频切换逻辑 (FireEvacuation.vue)
```typescript
// 视角切换：按进度比例保持时间点
const switchView = (viewId: string) => {
  if (!selectedVideo.value || !videoPlayerRef.value) return
  if (currentViewId.value === viewId) return

  const videoEl = videoPlayerRef.value
  // 计算当前播放进度比例
  const oldDuration = Math.max(videoEl.duration || 0, 0.00001)
  const progress = videoEl.currentTime / oldDuration

  currentViewId.value = viewId
  isVideoLoading.value = true

  // 重新绑定 loadedmetadata 以便跳转进度
  const onLoadedMeta = () => {
    const newDuration = Math.max(videoEl.duration || 0, 0.00001)
    // 恢复播放进度
    videoEl.currentTime = Math.min(newDuration * progress, newDuration - 0.05)
    videoEl.play().catch(() => {})
    videoEl.removeEventListener('loadedmetadata', onLoadedMeta)
  }
  
  videoEl.addEventListener('loadedmetadata', onLoadedMeta)
}
```

### 7.2 视频网格展示 (FireEvacuation.vue Template)
```vue
<!-- 视频网格容器 -->
<div class='video-grid'>
  <div 
    v-for="video in evacuationVideos" 
    :key="video.id"
    class='video-card'
    :class="{ active: selectedVideo?.id === video.id }"
  >
    <div class='video-thumbnail' @click="selectVideo(video)">
      <div class='video-icon'>{{ video.icon }}</div>
      <div class='video-info'>
        <h3 class='video-title'>{{ video.title }}</h3>
        <p class='video-desc'>{{ video.description }}</p>
        <div class='video-meta'>
          <span class='duration'>{{ video.duration }}</span>
          <span class='category'>{{ video.category }}</span>
        </div>
      </div>
    </div>
  </div>
</div>
```
