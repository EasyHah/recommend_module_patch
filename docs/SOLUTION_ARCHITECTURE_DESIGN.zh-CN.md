# 工业园区智能可视化与 AI 平台 · 技术方案 / 架构 / 功能设计（zh-CN）

## 执行摘要（Executive Summary）

本方案面向工业园区的智能可视化与 AI 一体化场景，采用 Vue 3 + Vite 的前端架构与轻量服务配合，强调“端上智能、弱网可用与安全合规”。核心优势：

- 前端 AI 集成：基于 MediaPipe 与 Web Speech API，在浏览器端实现轻量视频识别与语音交互，降低服务端压力并提升交互即时性。

- 数据可视化：融合高德地图与天气数据，支持 2D/3D 图层、风险着色与路线避险，为调度与决策提供直观依据。

- 灵活 AI 聊天：以 LKE 为主、Appflow 为备的双通道策略，既保证深度集成与稳定性，也兼顾快速接入与容灾降级。

  同时，本架构兼顾性能（按需加载、GPU/CPU 回退）、安全（密钥后端签发）与弱网可用性（脚本动态加载与兜底），满足演示与生产落地的双重要求。

## 🏗️ 系统架构图（System Architecture）

![架构图](./assets/%E6%9E%B6%E6%9E%84%E5%9B%BE.png)

> 注：
>
> - 前端仅注入以 `VITE_` 开头的环境变量；真实后端密钥仅在服务端（如 TokenSrv）使用。
> - LKE 优先用 WS / SSE，Appflow 用于备选与独立连通性验证。
> - 视频识别优先采用 MediaPipe Tasks，必要时可切换到 ONNX Runtime Web（WASM/Threads/WebGL）。

## 背景与目标

- 为园区监控、态势感知与决策辅助提供可视化与 AI 能力：
  - 天气风险分析与路线避险
  - 语音助手与 AI 聊天联动
  - 视频目标识别与统计
  - 地图场景与多图层叠加
  - 火灾疏散模拟与多视角播放
- 交付要求：易演示、易排错、可扩展、安全合规。

## 技术选型

### 选型总览

- 前端：Vue 3、Vite、TypeScript、Pinia、Vue Router
- 可视化/地图：高德 JS SDK（AMap），3D 图层（项目内封装）
- AI / 多媒体：Web Speech API（STT/TTS）、MediaPipe Tasks（优先）、ONNX Runtime Web（备选）
- 聊天：LKE（主）/ Appflow Chat（备）
- 服务：Node.js 轻量服务（Token 签发、物流数据）
- 数据：公共 API（和风天气、高德 REST）+ 本地 JSON/GeoJSON

### 选型考量与备选方案（Alternatives Considered）

- 视频识别：
  - 选型：MediaPipe Tasks（优先）
  - 理由：自动 GPU/CPU 回退，浏览器端部署成本低，API 友好，生态活跃。
  - 备选：ONNX Runtime Web（WASM/WebGL/Threads）。适合需要加载特定 ONNX 模型的场景，但初始化与线程/显存管理更复杂，包体与首帧开销较大。
- 聊天服务：
  - 选型：LKE（主） / Appflow（备）
  - 理由：LKE 提供 WS/SSE 流式接口，便于深度集成与实时交互；Appflow SDK 接入快、配置简单，适合作为连通性验证与降级兜底路径。
  - 取舍：优先保证主链路稳定（LKE），保留备链路以应对网络与配额波动。

## 功能设计（Feature Design）

### 天气分析与路线避险（Weather）

- 输入：起点/终点、路径规划、天气指标（温度/风/降水/能见度）
- 处理：省份/路段风险评估，融合预警事件
- 输出：
  - 省份风险着色（低/中/高/极端）
  - 路线评分与替代建议
  - Tooltip 详情/预警点位
- 关键交互：图层切换、路线选择、点位详情
- 主要文件：`src/services/weather.ts`、`src/views/WeatherAnalysis.vue`

### 语音助手（Voice）

- 能力：开始/停止识别、TTS 播报、命令解析（页面跳转、图层、全屏等）
- 联动：将最终识别文本发送至聊天模块，支持语音→AI→播报闭环
- 主要文件：`src/composables/useVoiceAssistant.ts`、`src/utils/voiceCommands.ts`、`src/components/VoiceAssistantFloat.vue`

#### 语音助手功能详细实现（对齐代码实现）

##### 1. 架构与数据流

技术原理：

基于浏览器原生 Web Speech API 提供语音转文本（ASR），并配合 SpeechSynthesis 做文本转语音（TTS）反馈；将识别与语义解析解耦（`parseCommand` 纯函数），通过全局事件总线广播意图（`voiceBus`），从而在页面间复用同一套语音能力并与聊天模块联动。

数据流：

```
Web Speech API → useVoiceAssistant（ASR/TTS/状态） → parseCommand → voiceBus.onVoiceCommand → 路由/图层/Chat
                                                   ↘ speak()（队列化播报）
```

##### 2. 识别与 TTS 关键机制

实现要点（源自 `src/composables/useVoiceAssistant.ts`）：

1) 识别初始化与兼容

- 自动检测 `window.SpeechRecognition || webkitSpeechRecognition`，不支持时给出可读错误并禁用入口。
- `continuous=true` 与 `interimResults=true`，减少片段化问题，支持长时间监听。
- 首次 `start()` 前通过 `getUserMedia({audio:true})` 做权限与设备预检，失败时返回清晰提示。

2) 自动恢复与人机工效

- `onend` 若处于持续监听模式，300ms 后自动重启，缓解浏览器的空闲超时。
- `no-speech` 错误时区分短等待与长等待提示语，并可自动重试。
- 开始识别时自动 `stopSpeaking(true)` 以避免 TTS 回灌干扰麦克风。

3) TTS 队列化播报

- 文本分句切片（句末断句+超长切片），逐条入队，防止单次过长导致合成失败。
- `voices` 优选策略（完全匹配语言 → 语族匹配 → zh 任一 → 默认），并对 Chrome 偶发 `synth.paused` 做自动 `resume()`。

示例（节选）：

```js
const voice = useVoiceAssistant({ lang: 'zh-CN', interimResults: true, continuous: true })
voice.onCommand(({ transcript, isFinal, parsed }) => {
  if (isFinal && parsed?.isQuery) {/* 执行业务查询 */}
})
voice.speak('已为您打开天气分析页面')
```

##### 3. 语义解析契约（ParsedCommand）

来源：`src/utils/voiceCommands.ts`（已配套单测）。核心字段：

- 物流语义：`cities`（城市对）、`location`（自由文本起止）、`vehicle`、`weightKg`、`demandType`（normal/cold/hazmat/fragile）、`temperatureRange`、`time`、`timeWindow`。
- 控制/导航：`navigation`（page/path）、`isQuery`、`isClose`、`isWeather`、`isFullscreen`、`isLayer`、`isUndo`。
- `changed`: string[] 用于 UI 高亮/撤销提示。

解析示例：

```js
parseCommand('从上海到北京 冷链10吨 明天上午8点到下午3点 查询') → {
  cities: { from: '上海', to: '北京' }, weightKg: 10000, demandType: 'cold',
  timeWindow: [ISO, ISO], isQuery: true, changed: ['cities','weightKg','demandType','timeWindow']
}
```

##### 4. 事件总线与页面集成

事件源自组合式 `useVoiceAssistant` 的 `onCommand` 回调，统一经 `voiceBus` 广播，页面仅订阅：

```js
import { onVoiceCommand } from '@/bridge/voiceBus'
onVoiceCommand(e => {
  if (e.isFinal && e.parsed?.navigation) router.push(e.parsed.navigation.path)
  if (e.isFinal && e.parsed?.isWeather) {/* 切换天气图层 */}
  if (e.isFinal && e.parsed?.isFullscreen) {/* 全屏/退出全屏 */}
})
```

##### 5. 权限、兼容与边界

- 需 HTTPS 或 localhost 才能获取麦克风；Chromium/Safari 有效；Firefox 对 ASR 支持较弱。
- 多标签并发监听会争抢音频设备，建议只保留一处入口。
- 默认本地 ASR/TTS，不上传音频；如切换云识别需补充隐私与合规说明。

##### 6. 测试与排障

- 单测用例：`tests/voiceCommands.test.ts`、`tests/voiceCommands.enhanced.test.ts`（覆盖重量/温控/时间窗/城市/撤销）。
- 故障排查：`docs/troubleshooting/voice.md`（权限诊断、错误映射、独立调试页）。
- 模块文档：`docs/modules/voice.md`（架构、契约、集成与最佳实践）。

### 聊天助手（Chat）

- LKE（主）：WS/SSE 连接、Token 服务签发、流式回复、互斥控制与 TTS 播报
- Appflow（备）：SDK 初始化、显隐控制、发送消息、独立测试页验证
- 主要文件：`src/composables/useAppflowChat.ts`、`server/lke-token-server.mjs`、测试页 `tests/pages/*`

### 视频识别（Video Recognition）

- 优先 MediaPipe Tasks（自动 GPU/CPU 回退），对性能不足环境提供 Mock 兜底
- 输出：检测框、置信度曲线、统计面板
- 主要文件：`src/views/VideoRecognition.vue`、`src/workers/*`、`public/models/`、`public/onnxruntime-web/`

#### 视频识别功能详细实现（对齐代码实现）

##### 1. 识别后端与回退策略

入口：`src/services/recognition.ts`

- 优先创建 MediaPipe 实现（`getMediapipeRecognitionService`）。若构造失败，自动回退到简单演示模式（mock）。
- YOLOv8 + ONNX Runtime Web 的 Worker 实现保留为备选路径（`src/workers/yoloWorker.ts`），便于加载自定义 ONNX 模型。

页面：`src/views/VideoRecognition.vue` 通过统一服务 API 初始化→预热→帧循环推理（支持 `requestVideoFrameCallback` 与 `requestAnimationFrame` 双模式），并将结果映射为 overlay 盒与统计面板。

##### 2. 状态机与回调契约

来源：`src/services/mediapipeRecognition.ts`

```js
enum RecognitionState { UNINITIALIZED, INITIALIZING, READY, WARMING_UP, RUNNING, ERROR }

onStateChange((state) => {})
onResult((results: DetectionResult[], stats: { timeMs; fps; totalDetections }) => {})
onError((msg: string) => {})
onTrackEvent(({ entered, exited }) => {})
```

UI 将 `state` 转换为状态文本与按钮文案；`onResult` 更新框与统计；`onTrackEvent` 更新进入/离开计数。

##### 3. 时间戳单调与 GPU/CPU 回退

MediaPipe 的 `detectForVideo(video, timestampMs)` 要求时间戳严格单调。实现中：

- 统一从 `requestVideoFrameCallback` 注入的 `metadata.mediaTime` 或 `video.currentTime` 获取原始媒体时间；若回退（如 seek/replay），通过偏移量补偿并强制 `+1ms` 保证严格单调。
- 常见错误“Packet timestamp mismatch”时自动调整并跳过本帧，不进入 ERROR 状态。
- 遇到 `texImage2D`/跨域导致的 WebGL 纹理错误时，自动销毁 GPU 实例并切换到 CPU 后端，立即重试当前帧：

```js
if (delegate==='GPU' && /texImage2D|cross-origin/i.test(err)) {
  delegate='CPU'; detector = createDetector(vision,'CPU'); cpuFallbackDone = true; await inferFrame(video)
}
```

##### 4. 轻量级跟踪与平滑

为避免框抖动与 ID 频繁变更，实现了简化版匈牙利匹配 + 指数平滑：

- 同类内匹配：按类别拆分，构建 IoU 代价矩阵（低于阈值的直接高代价抑制）。
- 新出现/未匹配 → 新建轨迹（enter 事件）；持续未命中超过阈值 → 淘汰（exit 事件）。
- 平滑：对 box 做指数平滑（`alpha`），置信度做上限保留。

参数可在线更新：`iouThreshold`、`smoothingAlpha`、`maxTrackMisses`。

##### 5. 运行参数与默认值

```js
type RecognitionOptions = {
  modelUrl?: string                      // 默认 EfficientDet Lite0（官方 CDN）
  confidenceThreshold?: number = 0.25    // 0..1，运行时过滤按百分比生效
  maxFPS?: number = 12                   // 推理频率限制
  wasmRoot?: string                      // MediaPipe WASM 根路径
  iouThreshold?: number = 0.5            // 匹配阈值
  smoothingAlpha?: number = 0.6          // 平滑
  maxTrackMisses?: number = 5            // 轨迹丢失阈值
  delegate?: 'GPU' | 'CPU' = 'GPU'       // 后端，可回退
}
```

检测结果：

```js
type DetectionResult = {
  id: string; label: string; classId: number; confidence: number;
  x: number; y: number; width: number; height: number; // 百分比 0-100
}
```

##### 6. Overlay 映射与多源输入

- Overlay 以视频在容器 `object-fit: contain` 的实际显示矩形为基准，将百分比框映射为像素（参见 `getDisplayedRect` 与 `getBoxStyle`）。
- 多源：内置测试视频（`TestVideoManager`）、本地文件、摄像头（`?source=webcam` 自动加载与识别）。

##### 7. 常见问题与排查

- 模型/WASM 加载失败：检查 CDN 与路径；必要时改为本地镜像。
- WebGL 纹理/跨域：使用同源资源或允许 CORS；已内置 CPU 回退。
- 推理慢：降低分辨率/`maxFPS`；移动端优先默认 MediaPipe；必要时切 Mock 展示。

更多：`docs/modules/video-recognition.md`（双路径说明、性能与 QA 清单）；`src/workers/yoloWorker.ts`（备选实现）。

### 地图与三维可视化（Map / Scene）

- 动态加载 AMap 脚本与插件、弱网与错误兜底
- 路线规划与覆盖物渲染、图层控制
- 主要文件：`src/utils/amapLoader.ts`、`docs/modules/map-amap-fix.md`

#### 图层与工具清单

- 地下管线（含地形透明度滑块）
  - 剖面分析：依次两点生成剖面，缓冲距离可调；附近管线列表；高亮闪烁；导出 CSV/GeoJSON
  - 挖方分析：多边形绘制（单击加点、双击/按钮完成、Backspace 撤销、Esc 取消）；面积/周长标注；附近管线列表
  - 图例：按管线类型分组显隐（与数据源 show 状态同步）
- 楼层抽屉：点击楼层模型展开目标楼层、其他楼层半透明，再次点击空白复位
- 设施与灭火器：提高相对地面高度与标签气泡样式，强化可视性
- 全景红点：自定义图标、聚合强度可调、距离显示；点击打开全景查看器
- 园区→目的地曲线：数量上限/分段/高度比例可调，展示辐射范围
- 性能调优：Tiles 细节（SSE）开关与参数

#### 地下管线功能详细实现 (集成自管线文档)

##### 1. 地形与 3D Tiles 透明度控制技术

技术原理：

地形与 3D Tiles 透明度控制技术旨在解决地表模型与地下管线可视化的遮挡冲突，通过动态调整地形和 3D Tiles 模型（如园区建筑物、地形分类模型）的透明度参数，实现 “穿透” 地表直观查看地下管线分布的效果。核心依托 CesiumJS 的材质样式系统和地形半透明接口，实时更新渲染参数，在保证地表场景完整性的同时，突出地下管线的空间位置关系。

**实现流程：**

1. **透明度应用函数定义：** 首先定义 `applyTilesAlpha` 函数，用于将透明度值应用到指定的 3D Tiles 数据集。该函数接收两个参数：3D Tiles 数据集和透明度值。若传入为空，函数直接返回，避免空指针错误；若有效，先关闭模型的背面剔除功能，防止因透明度调节导致模型背面显示异常；随后创建样式对象，通过颜色格式设置模型颜色为白色，透明度由 `alpha` 值控制。
2. **交互事件绑定：** 在页面加载完成后，通过 `document.getElementById` 分别获取透明度调节滑块（`alphaInput`）和透明度数值显示元素（`alphaVal`）。若两个元素均存在，定义 `onAlpha` 回调函数：首先读取滑块的当前数值（`v`），并将其保留两位小数后更新到 `alphaVal` 元素中，实现数值实时展示；然后调用 CesiumJS 的地形半透明接口，同步调整地形的正面透明度；最后调用 `applyTilesAlpha` 函数，将透明度值分别应用到 OSGB 模型和分类，确保地形与 3D Tiles 模型透明度同步变化。
3. **初始化执行：** 在绑定完 `input` 事件后，主动调用 `onAlpha` 函数，确保页面加载时，地形和 3D Tiles 模型能按照滑块初始值展示对应的透明度，避免初始状态下的显示异常。

**关键代码：**

```js
// 应用透明度到地形和3D Tiles
function applyTilesAlpha(tileset, alpha) {
  if (!tileset) return;
  tileset.backFaceCulling = false;
  tileset.style = new Cesium.Cesium3DTileStyle({
    color: `rgba(255,255,255, ${Math.min(Math.max(alpha, 0), 1)})`
  });
}

// 绑定透明度滑块事件
const alphaInput = document.getElementById('alpha');
const alphaVal = document.getElementById('alphaVal');
if (alphaInput && alphaVal) {
  const onAlpha = () => {
    const v = Number(alphaInput.value);
    alphaVal.textContent = v.toFixed(2);
    // 设置地形透明度
    viewer.scene.globe.translucency.frontFaceAlpha = v;
    // 设置3D Tiles模型透明度
    applyTilesAlpha(osgb, v);
    applyTilesAlpha(classificationTileset, v);
  };
  alphaInput.addEventListener('input', onAlpha);
  onAlpha(); // 初始化执行，确保初始透明度生效
}
```

##### 2. 剖面采样技术

技术原理：

剖面采样技术是实现地下管线剖面分析的核心基础，基于用户在三维场景中绘制的剖面线，通过线性插值算法对剖面线沿线的地形进行等距采样，获取连续的地形高程数据。该技术利用 CesiumJS 的空间坐标计算能力，将离散的地形数据转换为连续的剖面高程信息，为后续生成剖面图、分析地形与管线埋深关系提供精准的数据支撑。

**实现流程：**

1. **参数初始化：** 函数 `sampleGroundProfile` 接收三个参数：剖面线起点坐标（`startPos`，Cartesian3 类型）、终点坐标和采样步长。首先通过 `Cesium.Cartesian3.distance` 计算剖面线的总长度（单位：米）；然后根据总长度和采样步长计算采样步数（`steps`），确保步数至少为 1。
2. **地形高程采样：** 创建空数组 `result` 用于存储采样结果，通过 `for` 循环遍历每个采样点：计算当前采样点在剖面线上的比例（`t`）；利用 `Cesium.Cartesian3.lerp` 进行线性插值，得到当前采样点的笛卡尔坐标（`p`）；调用 `Cesium.Cartographic.fromCartesian(p)` 将笛卡尔坐标转换为地理坐标（`carto`）；通过 `viewer.scene.globe.getHeight(carto)` 获取该点的地形高程。
3. **结果返回：** 函数返回包含两个属性的对象：`total`（剖面线总长度）和 `samples`（采样点数组），采样点数组中的每个元素包含距离、高程和笛卡尔坐标。

**关键代码：**

```js
// 剖面采样
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
```

##### 3. 管线检测技术 (剖面分析)

技术原理：

管线检测技术用于识别剖面线附近的地下管线，基于空间几何算法判断管线与剖面线的位置关系，筛选出处于剖面线走廊范围内的管线。该技术通过遍历场景中的管线实体，计算管线线段与剖面线的最短距离，结合预设的走廊宽度阈值，确定与剖面分析相关的管线。

**实现流程：**

1. **坐标转换与参数初始化：** 函数 `collectPipesOnProfile` 接收三个参数：剖面线起点地理坐标、终点地理坐标和走廊半宽度。首先通过 `Cesium.Cartesian3.fromRadians` 将起点和终点的地理坐标转换为笛卡尔坐标（`startPos`、`endPos`）。

2. **管线实体筛选：** 遍历场景中的所有实体 (`viewer.entities.values`)，筛选出包含 `polylineVolume` 组件的实体（即地下管线实体）。

3. **空间距离计算与管线筛选：** 对于每个管线实体，获取其所有空间坐标点 (`pipePositions`)。遍历管线的每一条线段（`pipeSegStart`, `pipeSegEnd`），调用 `Cesium.Cartesian3.distanceBetweenLineSegments` 计算当前管线线段与剖面线的最短距离。

4. 结果返回： 若距离小于等于预设的走廊半宽度（corridorHalfWidth），则将管线信息存入 items 数组，并 break

   当前管线的线段遍历，避免同一管线被重复添加。

**关键代码：**

```js
// 管线检测
function collectPipesOnProfile(startCart, endCart, corridorHalfWidth = 25.0) {
  const startPos = Cesium.Cartesian3.fromRadians(startCart.longitude, startCart.latitude, startCart.height);
  const endPos = Cesium.Cartesian3.fromRadians(endCart.longitude, endCart.latitude, endCart.height);
  const total = Cesium.Cartesian3.distance(startPos, endPos);
  const items = [];
  
  viewer.entities.values.filter(e => e.polylineVolume).forEach(pipe => {
    // 获取管线的所有空间坐标点
    const pipePositions = pipe.polylineVolume.positions.getValue(Cesium.JulianDate.now());
    // 遍历管线线段，计算与剖面线的最短距离
    for (let j = 0; j < pipePositions.length - 1; j++) {
      const pipeSegStart = pipePositions[j];
      const pipeSegEnd = pipePositions[j + 1];
      // 计算两条线段（剖面线、管线线段）的最短距离
      const distance = Cesium.Cartesian3.distanceBetweenLineSegments(startPos, endPos, pipeSegStart, pipeSegEnd);
      // 若距离在走廊范围内，记录管线信息
      if (distance <= corridorHalfWidth) {
        items.push({
          pipeEntity: pipe,
          distanceToProfile: distance,
          intersectSegment: [pipeSegStart, pipeSegEnd]
        });
        break; // 避免同一管线被多次添加
      }
    }
  });
  
  return { total, items };
}
```

##### 4. 挖方分析技术

技术原理：

挖方分析技术围绕工程施工中的土方量估算和管线保护需求，通过创建三维挖方区域实体实现挖方范围的可视化展示，结合多边形面积计算算法和体积公式估算土方量，同时检测挖方区域内的地下管线，评估施工对管线的影响。

**实现流程：**

1. **挖方区域创建：** 函数 `createExcavationVolume` 接收多边形顶点数组（地理坐标）。校验顶点数量（至少 3 个）。将地理坐标转换为笛卡尔坐标数组（`positions`）。调用 `viewer.entities.add` 创建一个 `polygon` 实体，设置 `hierarchy` (顶点)、`extrudedHeight` (拉伸高度/开挖深度)、`material` (半透明材质)和 `outline` (轮廓线)。
2. **挖方体积计算：** (在文档中描述，但未提供关键代码) 通过多边形面积算法（如梯形法则）计算挖方区域的平面面积，再乘以开挖深度（`extrudedHeight`）估算体积。
3. **挖方区域管线检测：** (在文档中描述) 遍历管线实体，判断管线坐标点是否在挖方区域的平面范围内，并结合管线埋深和挖方深度，判断管线是否处于挖方深度范围内。

**关键代码：**

```js
// 创建挖方区域
function createExcavationVolume(polygonPoints) {
  if (polygonPoints.length < 3) return; // 至少3个顶点才能构成多边形
  
  // 将地理坐标（Cartographic）转换为笛卡尔坐标（Cartesian3）
  const positions = polygonPoints.map(cart => 
    Cesium.Cartesian3.fromRadians(cart.longitude, cart.latitude, cart.height)
  );
  
  // 全局变量，用于存储挖方区域实体，便于后续操作
  excavationVolume = viewer.entities.add({
    name: "挖方区域",
    polygon: {
      hierarchy: positions, // 多边形顶点集合，定义挖方范围
      extrudedHeight: 20, // 拉伸高度，即挖方深度（默认20米）
      material: Cesium.Color.BROWN.withAlpha(0.4), // 半透明棕色材质，突出挖方区域
      outline: true, // 显示轮廓线
      outlineColor: Cesium.Color.DARKRED
    }
  });
}
```

### 火灾疏散模拟（Fire Evacuation）

- 能力：视频网格→播放器，播放/暂停、静音、加载指示、视角切换（保持当前进度比例）
- 资源：`public/FireEvacuation/` 下的演示视频（多视角）
- 主要文件：页面 `src/views/FireEvacuation.vue`，路由 `/fire-evacuation`

## 核心 API 与数据契约（Contracts）

### Weather Service（示例）

- getProvinceWeather(): Promise<ProvinceWeather[]>
- analyzeRoute(params: { origin, destination }): Promise<RouteRisk>
- 错误：无 Key / API 限频 / 网络异常 → UI Toast + 重试

Request（示例）

```js
{ "origin": "116.40,39.90", "destination": "121.47,31.23" }
```

Response（示例）

```js
{
  "routeId": "RT_20251028_001",
  "score": 45.5,
  "riskLevel": "High",
  "suggestion": "建议延后2小时出发或改道G2",
  "riskSegments": [
    { "location": "...", "event": "大风预警", "level": "High" }
  ]
}
```

### Voice → Chat 桥接

- 事件：finalText（最终文本） → chat.sendMessage(text)
- 并发控制：语音/播报/AI 回复互斥锁，避免抢占音频设备
- 路由口令：解析“打开天气页面”“打开火灾疏散”“全屏/退出全屏”“显示/隐藏天气图层”等，并触发对应处理（见 `src/utils/voiceCommands.ts`）

### Chat（LKE）

- 初始化：基于 `VITE_LKE_*` 与 `/getDemoToken`
- 协议：WS/SSE（心跳/重连/超时处理）
- 降级：不可用时提示并提供独立测试页排查

### Token 服务（server/lke-token-server.mjs）

- GET /getDemoToken → { token, expireAt }
- 安全：仅服务器持有 `SECRET_ID/SECRET_KEY`，前端不暴露
- 可加：Referer 限制、频率限制、审计日志

## 部署与环境（Dev/Prod）

- 环境变量：仅 `VITE_` 变量注入前端；服务器端私密变量不进入构建
- 本地开发：`npm run dev`，独立测试页通过 `/tests/pages/*.html` 访问
- 构建产物：`npm run build` 输出至 `dist/`
- 资源托管：地图/模型/ORT 的静态资源需确认路径与跨域策略
  - 弱网/离线：AMap 按需/延迟加载与兜底策略，详见 `AMAP_API_FIX.md` 与 `docs/modules/map-amap-fix.md`

## 安全与合规

- 密钥管理：`.env.example` 提供占位；`.env.local` 不提交；服务器持私密变量
- 平台侧限制：AMap/QWeather/Appflow/LKE 配置来源域名/频率/白名单
- 网络安全：Token 服务增加速率限制与 Referer 校验

## 非功能性需求（NFR）

### 性能（Performance）

- /weather 首屏性能：在非弱网环境下 LCP < 3s（按需加载脚本与数据缓存）。
- 视频识别（MediaPipe）：在目标设备（如 i5 笔记本）> 8 FPS；设备不足时自动回退 CPU，再不足回退 Mock，确保 UI 不卡顿。
- 地图与天气：AMap 脚本/插件按需加载，省份数据缓存，仅在图层变更时重绘。

### 可用性与韧性（Availability & Resilience）

- 弱网（Slow 3G）下地图 10s 内可加载；若失败显示重试与兜底提示。
- AI 聊天（LKE）断线后 30s 内自动重连；必要时回退 SSE。
- Weather/AMap API 限频或错误：前端 Toast + 指数退避重试；必要时走本地缓存。

### 可维护性（Maintainability）

- 关键模块提供独立测试页（Chat、Voice 等），便于隔离排错与回归。
- 统一日志与埋点：初始化耗时、连接状态、推理 FPS、错误率。

### 兼容性与边界（Compatibility & Constraints）

- 浏览器能力差异：语音/WebAssembly/Workers 在低端或受限环境下功能降级或禁用。
- 公共 API 稳定性与配额受限：必要时引入服务端代理与缓存。
- 离线/弱网：静态资源与脚本懒加载、可选离线包、重试与提示。

## 可观测与排错

- 日志：独立测试页（Appflow、语音）提供实时日志与调试入口
- 指标：初始化耗时、WS/SSE 连接状态、推理 FPS、错误率
- FAQ：集中于 `docs/OPERATION_GUIDE.zh-CN.md` 与 `docs/troubleshooting/*`

## 附：独立测试页索引

| **页面/路径**                               | **作用**                                      | **备注**                |
| ------------------------------------------- | --------------------------------------------- | ----------------------- |
| `/tests/pages/appflow-test-standalone.html` | Appflow SDK 最小验证（初始化/显隐/发送/日志） | 联通性与降级兜底验证    |
| `/tests/pages/appflow-test.html`            | Appflow 在项目态方法与事件                    | 接口回调与显隐控制      |
| `/tests/pages/voice-ai-integration.html`    | 语音 + Chat 联动闭环                          | 识别→AI 回复→TTS 播报   |
| `/tests/pages/voice-debug.html`             | 语音识别调试                                  | 实时日志、环境/权限排查 |
| `/tests/pages/test-tts.html`                | TTS 参数与发音对比                            | 语速/音调/声音切换      |
