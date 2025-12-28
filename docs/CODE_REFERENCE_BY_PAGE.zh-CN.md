# 项目主要代码索引（按页面分类）

用于快速定位“每个页面对应哪些核心代码/组件/数据/接口”，可作为项目交付参考附件。

## 1. 快速入口

- 应用入口：`src/main.ts`、`src/App.vue`、`src/router/index.ts`
- 全局能力
  - 语音助手（全局浮层 + 调试面板）：`src/App.vue`、`src/components/VoiceAssistantFloat.vue`、`src/components/VoiceDebugPanel.vue`
  - 推荐侧栏（全局挂载到 body Portal）：`src/bridge/mountRecommendSidebar.ts`、`src/components/recommend/RecommendSidebar.vue`
  - UI 状态（抽屉/全屏）：`src/stores/ui.ts`

## 2. 路由与页面总览

路由定义：`src/router/index.ts`

| 页面 | 路由 | View | 主要组件 | 关键服务/模块 |
|---|---|---|---|---|
| 总览大屏 | `/` | `src/views/Dashboard.vue` | `src/components/TopBar.vue`、`src/components/MapView.vue`、`src/components/LeftSidebar.vue`、`src/components/RightSidebar.vue` | `src/stores/ui.ts`、（地图/图层能力在 `MapView.vue` 内聚合） |
| 路线规划 | `/route` | `src/views/RoutePlan.vue` |（页面内 AMap 容器） | `src/bridge/routeBridge.ts`、高德加载/Key：`VITE_AMAP_KEY`/`VITE_AMAP_SECURITY` |
| 商家推荐 | `/recommend` | `src/views/Recommend.vue` | `src/components/recommend/RecQueryForm.vue`、`RecResultTable.vue`、`CompareDrawer.vue`、`src/components/map/AmapRoute.vue` | 评分：`src/utils/recommendScore.ts`，类型：`src/types/recommend.ts` |
| 天气分析 | `/weather` | `src/views/WeatherAnalysis.vue` | `src/components/FluentCard.vue`、`src/components/WeatherTooltip.vue`、`src/components/FloatingPanel.vue` | `src/services/weather.ts`、`src/services/disaster.ts`、`src/utils/amapLoader.ts`、`src/services/publicCameras.ts` |
| 天气/预警连通性测试 | `/weather-test` | `src/views/WeatherTest.vue` | `src/components/FluentCard.vue` | `src/utils/weatherTestUtils.ts`、`src/services/weather.ts`、`src/services/disaster.ts` |
| 视频识别 | `/video-recognition` | `src/views/VideoRecognition.vue` | `src/components/VideoRecognitionLeft.vue`、`VideoRecognitionRight.vue`、`TrackingSettings.vue`、`TopBar.vue` | `src/services/recognition.ts`（MediaPipe 优先/失败回退）、`src/utils/testVideo.ts`、`src/services/mediapipeRecognition.ts` |
| 火灾疏散演示 | `/fire-evacuation` | `src/views/FireEvacuation.vue` | `src/components/TopBar.vue` | 静态视频：`public/FireEvacuation/` |
| LKE 测试页 | `/lke-test` | `src/views/LKETest.vue` |（页面内 UI） | `src/composables/useLKEChat.ts`、`/getDemoToken`（需后端） |
| 物流中心/仓库 | `/logistics` | `src/views/Logistics.vue` | `src/components/CenterLogisticsView.vue`、`src/components/LogisticsEditor.vue` | 后端接口：`/api/logistics/*`（建议），数据文件：`src/data/*.json`、`public/data/*` |

## 3. 页面级代码说明

### 3.1 总览大屏（`/`）

- View：`src/views/Dashboard.vue`
- UI 结构：顶部导航 + Cesium 场景 + 左右抽屉
- 关键组件
  - 顶部导航/全屏/入口：`src/components/TopBar.vue`
  - 三维地图与图层/分析工具：`src/components/MapView.vue`
  - 左侧信息（统计/值班）：`src/components/LeftSidebar.vue`
  - 右侧信息（人员/车辆/运营）：`src/components/RightSidebar.vue`
- 状态管理
  - 抽屉开合/固定/宽度、全屏：`src/stores/ui.ts`
  - 统计聚合（管线/天气预警等，可选）：`src/stores/insights.ts`
- 相关静态资源（Cesium 运行时依赖）
  - `public/Assets/`、`public/ThirdParty/`、`public/Widgets/`、`public/Workers/`（构建后也会落在 `dist/`）

### 3.2 路线规划（`/route`）

- View：`src/views/RoutePlan.vue`
- 核心能力
  - 高德地图地理编码 + 驾车路径规划（`AMap.Geocoder`/`AMap.Driving`）
  - 生成的路线指标通过本地“桥接”推送给推荐模块
- 数据桥接（本地存储）
  - 发布/读取路线包：`src/bridge/routeBridge.ts`
- 环境变量
  - `VITE_AMAP_KEY`：高德 Web Key（必填）
  - `VITE_AMAP_SECURITY`：高德安全密钥（可选/建议）

### 3.3 商家推荐（`/recommend`）

- View：`src/views/Recommend.vue`
- 关键组件
  - 查询表单：`src/components/recommend/RecQueryForm.vue`
  - 结果表：`src/components/recommend/RecResultTable.vue`
  - 对比抽屉：`src/components/recommend/CompareDrawer.vue`
  - 路线绘制：`src/components/map/AmapRoute.vue`
- 核心算法
  - 基础匹配/评分：`src/utils/recommendScore.ts`
  - 天气增强评分（供天气页或测试页调用）：`src/utils/enhancedRecommendScore.ts`
- 数据来源（静态 JSON）
  - 厂商/仓库数据：`public/data/vendors.json`、`public/data/vendors-with-warehouse.json`、`public/data/warehouse-with-vendors.geojson`
- 全局侧栏（任意页面可打开）
  - 侧栏状态：`src/bridge/recommendUI.ts`
  - 全局挂载入口：`src/bridge/mountRecommendSidebar.ts`
  - 侧栏主体：`src/components/recommend/RecommendSidebar.vue`

### 3.4 天气分析（`/weather`）

- View：`src/views/WeatherAnalysis.vue`
- 核心能力
  - 全国天气概览（省级卡片）
  - 路线天气分析（起终点/沿途点位）
  - 天气图层/风险色彩叠加、Tooltip 展示
  - 公共监控点位（HLS 播放，弱网/不支持时自动处理）
  - 支持地图全屏模式（Teleport 到 `body`）+ 悬浮信息面板
- 服务与工具
  - 和风天气：`src/services/weather.ts`（依赖 `VITE_QWEATHER_KEY`）
  - 灾害/物流风险评估：`src/services/disaster.ts`（内部复用 `weatherService.getDisasterWarning`）
  - 高德加载封装：`src/utils/amapLoader.ts`
  - 公共摄像头数据：`src/services/publicCameras.ts`（读 `public/data/public-cameras.json`）
- 环境变量
  - `VITE_QWEATHER_KEY`：和风天气 Key（必填）
  - `VITE_AMAP_KEY`/`VITE_AMAP_SECURITY`：地图与地理能力（建议）
  - （可选）`VITE_QWEATHER_RADAR_TILE`：雷达瓦片模板（若配置会优先使用）

### 3.5 天气/预警连通性测试（`/weather-test`）

- View：`src/views/WeatherTest.vue`
- 目的：快速检测 Key 是否配置、天气/预警接口是否可用
- 关键模块
  - 环境检查：`src/utils/weatherTestUtils.ts`
  - 天气/灾害服务：`src/services/weather.ts`、`src/services/disaster.ts`

### 3.6 视频识别（`/video-recognition`）

- View：`src/views/VideoRecognition.vue`
- UI 结构：顶部栏 + 左侧统计 + 中间视频画布/叠加框 + 右侧趋势与详情
- 关键组件
  - 左侧统计/历史：`src/components/VideoRecognitionLeft.vue`
  - 右侧置信度曲线/热力分布/详情：`src/components/VideoRecognitionRight.vue`
  - 跟踪/阈值设置：`src/components/TrackingSettings.vue`
- 识别服务入口（优先真推理，失败自动降级）
  - 统一入口：`src/services/recognition.ts`
  - MediaPipe 推理实现：`src/services/mediapipeRecognition.ts`
    - WASM：`public/mediapipe/wasm/`（由 `scripts/copy-mediapipe-assets.mjs` 复制）
    - 模型：`public/mediapipe/models/efficientdet_lite0.tflite`（脚本尝试下载）
  - 演示回退：`src/services/simpleRecognition.ts`（默认 mock）
- 其它资源
  - YOLO 示例模型：`public/models/yolov8n.onnx`
  - ONNX Runtime Web 静态文件：`public/onnxruntime-web/`
  - Worker（如启用 ONNX 推理）：`src/workers/yoloWorker.ts`

### 3.7 火灾疏散演示（`/fire-evacuation`）

- View：`src/views/FireEvacuation.vue`
- 资源：`public/FireEvacuation/*.mp4`
- 说明：页面提供“多场景/多视角”视频切换与最小控制条

### 3.8 LKE 测试（`/lke-test`）

- View：`src/views/LKETest.vue`
- 核心 composable：`src/composables/useLKEChat.ts`
- 前端依赖的后端接口
  - `VITE_LKE_TOKEN_ENDPOINT`（默认 `/getDemoToken`，需 Node 后端代理签发 token）
- 相关环境变量（前端）
  - `VITE_LKE_ACCESS_TYPE`（`ws`/`sse`）
  - `VITE_LKE_APP_KEY`、`VITE_LKE_BOT_ID`
  - `VITE_LKE_WS_BASE`、`VITE_LKE_SSE_BASE`

### 3.9 物流中心/仓库（`/logistics`）

- View：`src/views/Logistics.vue`
- 关键组件
  - 中心/仓库浏览：`src/components/CenterLogisticsView.vue`
  - 仓库编辑器（CRUD）：`src/components/LogisticsEditor.vue`
- 后端接口依赖（生产推荐）
  - `GET /api/logistics/centers`
  - `GET /api/logistics/centers/:id`
  - `GET /api/logistics/search?q=...`
  - `POST /api/logistics/hubs`
  - `DELETE /api/logistics/hubs/:centerId/:code`
- 数据文件（Node 侧会读写）
  - 基础数据：`src/data/logistics.json`
  - 编辑层数据：`src/data/logistics-editable.json`（运行后生成/更新）

## 4. 跨页面“通用模块”索引

### 4.1 语音助手（全局）

- UI：`src/components/VoiceAssistantFloat.vue`、`src/components/VoiceDebugPanel.vue`
- 语音能力（ASR + TTS + 命令解析）：`src/composables/useVoiceAssistant.ts`、`src/utils/voiceCommands.ts`
- 事件总线（页面订阅语音命令）：`src/bridge/voiceBus.ts`
- AI 聊天（当前接入 DeepSeek）：`src/composables/useDeepSeekChat.ts`
  - 读取厂商库 JSON 并拼接 system prompt：`public/data/vendors*.json`
  - 默认请求：`VITE_DEEPSEEK_ENDPOINT`（默认为 `/api/deepseek/chat`，生产需 Nginx 反代到 Node）

### 4.2 地图/三维场景

- Cesium 主场景：`src/components/MapView.vue`
- 高德脚本/插件加载封装：`src/utils/amapLoader.ts`

### 4.3 样式与 UI 框架

- VFluent3 注册：`src/main.ts`
- 全局主题：`src/styles/theme.css`

## 5. 后端（Node）与接口映射（与页面关联）

> 前端用 `dist` 静态部署后，`vite.config.ts` 的 dev proxy 不会生效；生产环境需要 Nginx 反代到 Node。

- 后端主文件：`server/lke-token-server.mjs`
  - `/api/deepseek/chat`：供 `useDeepSeekChat` 使用（SSE/流式）
  - `/api/logistics/*`：供物流页面使用（CRUD/search）
  - `/getDemoToken`：供 `useLKEChat` 获取临时 token（把 `SECRET_ID/SECRET_KEY` 放在服务端）
  - `/health`：健康检查
- 可选独立物流服务：`server/logistics-server.mjs`（若单独运行）

### 5.1 后端环境变量（服务端，不进入前端构建）

放在部署机的 `.env.local`（项目根目录或后端目录）：

- `SERVER_PORT`（默认 3000）
- `SERVER_HOST`（建议 `127.0.0.1`，避免只监听 IPv6 导致 Nginx 502）
- `DEEPSEEK_API_KEY`、（可选）`DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL`
- （如用 LKE token relay）`SECRET_ID`、`SECRET_KEY`、（可选）`LKE_REGION`

