# 视频识别模块 (YOLOv8 + ONNX Runtime Web)

> 来源：`VIDEO_RECOGNITION_DEMO.md` 精炼版；统计/性能/使用说明集中。

## 1. 功能要点
- 多源视频（内置 / 上传 / 摄像头）
- 实时检测框 + 置信度展示
- 统计面板（类别分布 / 历史趋势 / 置信度图）
- Mock 演示与真实推理模式切换

## 2. 核心文件
| 作用 | 文件 |
|------|------|
| 视图入口 | `src/views/VideoRecognition.vue` |
| Worker 推理 | `src/workers/yoloWorker.ts` |
| 模型文件 | `public/models/yolov8n.onnx` |
| ORT 运行时 | `public/onnxruntime-web/*` |

## 3. 推理流程
```
<Video> frame → Worker: preprocess → ORT session.run → postProcess(NMS) → 主线程绘制 overlay
```

## 4. 关键参数
| 名称 | 默认 | 说明 |
|------|------|------|
| confidenceThreshold | 0.25 | 过滤低置信度检测 |
| iouThreshold | 0.45 | NMS IoU 阈值 |
| maxFPS | 8 | 最大推理帧率 |
| mockMode | true | 是否使用模拟结果 |

## 5. 性能优化要点
- 控制帧率与自适应降频
- Worker 隔离计算避免阻塞 UI
- 预加载 ORT + 模型缓存
- 结果对象池复用（可后续加入）

## 6. 常见问题
| 症状 | 排查 |
|------|------|
| 模型加载失败 | 检查路径 / 网络 / MIME 类型 |
| 推理慢 | 降低分辨率 / 减少 fps |
| Worker 报错 | 查看浏览器支持 (WASM+SIMD) |

## 7. 扩展路线
- 轨迹跟踪 (DeepSort)
- 行为识别二级模型
- 抽帧存档与批量审核

---
最后更新：2025-10-05
