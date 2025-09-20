# YOLO模型文件说明

本项目支持使用ONNX格式的YOLO模型进行实时视频目标检测。

## 模型要求

- **格式**: ONNX (.onnx)
- **输入**: `images` - [1, 3, 640, 640] float32
- **输出**: YOLOv8 格式 - [1, 84, 8400] 或 [1, 8400, 84]
- **推荐模型**: YOLOv8n (nano版本，平衡性能与精度)

## 获取模型文件

### 方法1: 使用Ultralytics导出

```bash
# 安装ultralytics
pip install ultralytics

# Python脚本导出
from ultralytics import YOLO

# 加载预训练模型
model = YOLO('yolov8n.pt')

# 导出为ONNX格式
model.export(
    format='onnx',
    imgsz=640,
    dynamic=False,
    simplify=True,
    opset=11
)
```

### 方法2: 直接下载预训练模型

```bash
# 下载预训练的ONNX模型
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx
```

### 方法3: 使用自定义数据集训练

```python
from ultralytics import YOLO

# 训练自定义模型
model = YOLO('yolov8n.yaml')
model.train(data='your_dataset.yaml', epochs=100)

# 导出训练好的模型
model.export(format='onnx', imgsz=640)
```

## 模型放置

将导出的ONNX模型文件重命名为 `yolov8n.onnx` 并放置在以下位置：

```
public/
  models/
    yolov8n.onnx  ← 将模型文件放在这里
```

## 支持的类别

默认支持COCO 80个类别，包括：
- 人员相关: 人员
- 车辆相关: 汽车、卡车、公交车、摩托车、自行车
- 其他物体: 详见源码中的 `CLASS_LABELS` 数组

## 性能优化建议

1. **模型选择**:
   - YOLOv8n: 速度最快，精度适中
   - YOLOv8s: 平衡速度与精度
   - YOLOv8m/l/x: 精度更高但速度较慢

2. **浏览器支持**:
   - Chrome/Edge: 支持WebGL加速
   - Safari: 仅支持WASM，性能较低
   - Firefox: WebGL支持有限

3. **输入尺寸**:
   - 640x640: 默认推荐
   - 416x416: 更快的推理速度
   - 320x320: 最快速度，但精度下降

## 故障排除

### 模型加载失败
- 检查模型文件路径是否正确
- 确认模型格式为ONNX
- 检查浏览器控制台错误信息

### 推理速度慢
- 尝试使用更小的模型(YOLOv8n)
- 降低输入分辨率
- 检查是否启用了WebGL加速

### 检测精度低
- 使用更大的模型(YOLOv8s/m)
- 增加输入分辨率到640x640
- 调整置信度阈值

## 自定义配置

可以在 `src/services/recognition.ts` 中修改以下参数：

```typescript
const options = {
  modelUrl: '/models/your_model.onnx',  // 模型路径
  confidenceThreshold: 0.25,            // 置信度阈值
  iouThreshold: 0.45,                   // IoU阈值
  maxFPS: 8                             // 最大推理FPS
}
```

## 许可证说明

请确保您使用的YOLO模型符合相应的许可证要求：
- YOLOv8: AGPL-3.0 (非商业用途免费)
- 商业用途请购买Ultralytics商业许可证