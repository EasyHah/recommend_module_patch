# 视频识别模块（前端推理：MediaPipe 优先，YOLOv8/ORT 备选）

> 完整指引覆盖：架构/契约/模型与资源/性能/错误恢复/安全与兼容。细节程度与地图/管线类模块保持一致。

## 1. 使用场景与目标
- 在浏览器端实时识别人员/车辆/物体，叠加检测框与指标面板，用于安防可视化、视频巡检与展示。
- 支持多源输入：内置测试视频、用户上传、本机摄像头；支持演示模式与真实 AI 模式切换。
- 提供轻量级跟踪与进入/离开计数，支持 FPS/延迟与置信度趋势统计。

## 2. 架构与数据流
两条实现路径，默认优先 MediaPipe（更轻、更稳）：

```
路径A（默认）: <Video> → RecognitionService(MediaPipe) → mapDetections → Tracker → UI Overlay
路径B（备选）: <Video> → Worker(yolov8n.onnx + ORT) → preprocess → session.run → NMS → 主线程 Overlay
```

说明：`src/services/recognition.ts` 会优先创建 MediaPipe 服务；若失败回退到简单演示模式。

## 3. 核心文件与职责
| 作用 | 文件 |
|------|------|
| 视图入口（完整 UI、抽屉面板、统计） | `src/views/VideoRecognition.vue` |
| 统一识别服务入口（选择后端/回退） | `src/services/recognition.ts` |
| MediaPipe 实现（真实推理，含跟踪/平滑/事件） | `src/services/mediapipeRecognition.ts` |
| 简单演示实现（mock） | `src/services/simpleRecognition.ts` |
| YOLOv8 + ORT Worker（备选路径） | `src/workers/yoloWorker.ts` |
| ORT 运行时资源（WASM/JS） | `public/onnxruntime-web/*` |
| 示例模型（YOLOv8n） | `public/models/yolov8n.onnx` |

## 4. 契约（Contract）
### 4.1 识别结果与状态
来源：`mediapipeRecognition.ts`

```
type DetectionResult = {
	id: string
	label: string         // 中文或原标签（人/车/物体）
	classId: number       // 类别索引（未知时 -1）
	confidence: number    // 百分比 0-100
	x: number; y: number; // 左上角，百分比 0-100
	width: number; height: number // 百分比 0-100
}

type InferenceStats = { timeMs: number; fps: number; totalDetections: number }

enum RecognitionState { UNINITIALIZED, INITIALIZING, READY, WARMING_UP, RUNNING, ERROR }
```

回调：
```
onStateChange((s) => {})
onResult((results, stats) => {})
onError((msg) => {})
onTrackEvent(({ entered, exited }) => {})
```

### 4.2 运行参数（可在线更新）
```
type RecognitionOptions = {
	modelUrl?: string            // MediaPipe TFLite 模型地址
	confidenceThreshold?: number // 0..1，默认 0.25（内部会转换为百分比过滤）
	maxFPS?: number              // 限制推理频率，默认 12
	wasmRoot?: string            // MediaPipe WASM 根路径（默认官方 CDN）
	iouThreshold?: number        // 跟踪匹配 IoU 阈值（默认 0.5）
	smoothingAlpha?: number      // 位置平滑系数（默认 0.6）
	maxTrackMisses?: number      // 轨迹丢失帧阈值（默认 5）
	delegate?: 'GPU' | 'CPU'     // MediaPipe 后端，默认 GPU，异常时自动回退 CPU
}
```

## 5. 关键页面与用法
入口：`/video-recognition`

- 源选择：下拉选择内置视频；或“选择本地视频”；或通过 URL `?source=webcam` 自动启用摄像头。
- 启停识别：首次点击自动初始化与预热；支持 requestVideoFrameCallback 与 requestAnimationFrame 双模式。
- 抽屉面板：左侧统计（人数/车辆/平均置信度/趋势），右侧跟踪设置与实时分析。

示例（内部已实现）：
```ts
const svc = getRecognitionService()
await svc.initialize(); await svc.warmup();
svc.onResult((res, stats) => { /* 更新 overlay 和面板 */ })
svc.inferFrame(videoEl)
```

## 6. 模型与资源
### 6.1 MediaPipe（默认）
- 模型：EfficientDet Lite0（TFLite，官方 CDN，见源码 DEFAULT_MODEL_URL）。
- WASM：`wasmRoot` 默认指向与依赖版本匹配的 CDN，可按需改为本地镜像。

### 6.2 YOLOv8 + ONNX Runtime Web（备选）
- 模型：`public/models/yolov8n.onnx`
- 运行时：`public/onnxruntime-web/`（含 `ort.wasm.*` 等）
- Worker：`src/workers/yoloWorker.ts` 提供 letterbox 预处理、NMS 后处理、FPS/延迟统计。
- 跨域：使用外链视频源时需 CORS 允许，避免 WebGL 纹理错误；代码内置 GPU→CPU 回退逻辑。

## 7. 性能与稳定性
- 帧率控制：`maxFPS` 限制推理频率，避免占满主线程。
- GPU/CPU 回退：检测到 WebGL 纹理/CORS 问题自动切换 CPU 并重试。
- 时间戳单调：对 `detectForVideo(video, timestamp)` 传入的时间戳做严格单调修正，规避回放/seek 抖动。
- 轻量跟踪：Hungarian 简化匹配 + 指数平滑，输出进入/离开事件与平滑框。
- 预热：初始化后短延时 warmup，提升首帧稳定性。

## 8. 错误处理与排查
常见症状与建议：
- 模型/WASM 加载失败：检查网络与路径；CDN 被拦截时改用本地或内网镜像。
- WebGL 纹理错误/跨域：确保视频源 CORS；自动回退 CPU 后端；必要时改用本地文件或摄像头。
- 推理慢/掉帧：降低分辨率、减小 `maxFPS`、隐藏无关 UI；移动端建议优先使用 MediaPipe。
- 时间戳不单调：已自动调整并跳过本帧；持续出现时避免频繁 seek/重播。

## 9. 权限、兼容与安全
- 摄像头：需 HTTPS 或 localhost；浏览器弹窗授权后方可采集。
- 兼容：Chromium/Safari 均可；低端设备建议使用演示模式或较低帧率。
- 隐私：所有推理在前端本地执行，不上传视频帧；日志仅包含统计数与告警信息。

## 10. 验证清单（QA）
1) 打开 `/video-recognition`，选择本地视频，点击“开始识别”。
2) 观察 Overlay 方框与左/右面板统计实时更新，无错误日志。
3) 切换 `?source=webcam`，授权摄像头，验证 FPS 与延迟显示。
4) 遇到跨域/纹理错误时，确认自动回退 CPU 并继续输出结果。

## 11. 扩展路线
- 跟踪增强（ReID/DeepSort）；ROI/隐私遮挡；事件检测（摔倒/聚集）。
- 帧缓存与审计导出；与告警系统联动；离线批量处理工具。

---
维护：视频识别子系统 Owner｜参考：`src/services/mediapipeRecognition.ts`、`src/workers/yoloWorker.ts`
最后更新：2025-10-28
