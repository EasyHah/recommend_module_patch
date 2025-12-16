# 基于计算机视觉的物流园区智能安防监控系统 - 软件著作权申请材料草案

## 1. 软件基本信息

*   **软件全称**：基于计算机视觉的物流园区智能安防监控系统
*   **软件简称**：园区智能安防系统
*   **版本号**：V1.0
*   **开发完成日期**：2025年11月18日

## 2. 开发目的

针对大型物流园区监控点位多、人工巡查效率低、安全隐患发现滞后等痛点，开发本系统。旨在利用先进的计算机视觉技术（Computer Vision）和深度学习算法，对园区内的监控视频流进行实时分析，自动识别人员入侵、车辆违停、火灾烟雾等异常情况，实现从“被动监控”向“主动预警”的转变，保障园区的人员与财产安全。

## 3. 技术特点

1.  **端侧实时推理**：集成 **ONNX Runtime Web** 引擎，直接在浏览器端运行 **YOLOv8** 轻量化模型，无需将视频流上传至云端，有效保护数据隐私并降低带宽消耗。
2.  **高精度目标检测**：针对物流园区场景优化的检测算法，能够精准识别行人、各类货车、火源及烟雾，支持多目标同时追踪，实时计算并显示置信度。
3.  **智能视频流处理**：支持本地视频文件导入与实时摄像头流（RTSP/HLS）接入，具备帧级截取与分析能力，可动态调节检测频率以平衡性能与功耗。
4.  **可视化数据看板**：左侧侧边栏实时统计识别到的目标数量、分类占比及报警记录，提供 FPS（帧率）与推理延迟（Inference Time）的实时性能监控。
5.  **交互式标注层**：在视频画面上通过 Canvas 动态绘制检测框（Bounding Box）与标签，色彩区分不同类别，提供直观的视觉反馈。

## 4. 软件功能描述

### 4.1 智能视频识别 (Video Recognition)
*   **实时检测**：自动对播放的视频内容进行逐帧分析，识别画面中的关键目标。
*   **多模式切换**：支持“初始化”、“预热”、“识别中”等状态管理，用户可随时暂停/恢复识别功能。
*   **性能监控**：实时显示当前推理引擎的 FPS 和单帧处理耗时，辅助管理员评估系统负载。
*   **测试用例库**：内置多种典型场景（如门口监控、仓库内部、停车场）的测试视频，便于快速验证算法效果。

### 4.2 识别结果统计与分析
*   **实时计数**：自动统计当前画面中各类目标（如人、车）的数量。
*   **历史记录**：记录异常事件发生的时间戳与截图，形成可追溯的安防日志。
*   **置信度过滤**：支持设置置信度阈值，过滤低质量的误检结果。

### 4.3 视频播放与控制
*   **多格式支持**：兼容 MP4、WebM 等常见视频格式及流媒体协议。
*   **帧级操作**：提供“截取帧”功能，一键保存当前画面的分析结果图，用于取证或报告。
*   **播放控制**：标准的播放、暂停、进度拖拽及音量控制功能。

## 5. 运行环境

*   **客户端**：
    *   浏览器：Chrome 90+ / Edge 90+ (需支持 WebAssembly 与 WebGL)
    *   CPU：支持 SIMD 指令集的现代多核处理器
    *   GPU：推荐支持 WebGPU 或高性能 WebGL 的显卡以加速推理
*   **服务端**：
    *   Node.js 环境（用于静态资源托管与模型分发）

## 6. 代码规模
*   **代码行数**：约 8,000 行（核心算法集成与前端交互逻辑）

## 7. 核心代码摘录

### 7.1 视频识别控制逻辑 (VideoRecognition.vue)
```typescript
const startRecognition = () => {
  if (recognitionState.value !== RecognitionState.READY) {
    errorMessage.value = '推理服务未就绪'
    return
  }
  
  if (!videoRef.value) {
    errorMessage.value = '请先选择视频文件'
    return
  }
  
  isRecognizing.value = true
  
  const useRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype

  if (useRVFC && videoRef.value?.requestVideoFrameCallback) {
    const loop = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (!isRecognizing.value || !videoRef.value) return
      
      // 调用识别服务进行推理
      recognitionService.detect(videoRef.value, metadata.mediaTime)
        .then(results => {
           detections.value = results
           updateStats(results)
        })
        .catch(err => console.error(err))

      videoRef.value.requestVideoFrameCallback(loop)
    }
    videoRef.value.requestVideoFrameCallback(loop)
  }
}
```

### 7.2 识别结果叠加层 (VideoRecognition.vue Template)
```vue
<div class='video-wrapper' ref="videoWrapperRef">
  <video ref="videoRef" class='video-player' controls autoplay muted crossorigin="anonymous" playsinline>
    <source src="" type="video/mp4">
  </video>
  <!-- 识别框叠加层 -->
  <div class='recognition-overlay'>
    <div 
      v-for="detection in detections" 
      :key="detection.id"
      class='detection-box'
      :style="getBoxStyle(detection)"
    >
      <div class='detection-label'>
        {{ detection.label }} ({{ detection.confidence }}%)
      </div>
    </div>
  </div>
</div>
```
