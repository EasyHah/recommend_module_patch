# 工业园区智能可视化与 AI 平台 · 功能总览与演示指南

本项目基于 Vue 3 + Vite 构建，集成了 3D 地图可视化、天气分析与智能推荐、语音助手与 Appflow Chat、以及基于 ONNX Runtime Web 的视频目标识别，面向园区监控与决策辅助场景。

## 🚀 主要功能

- 3D 地图与场景
  - Cesium 三维场景，支持地上/地下演示（路径：`/scene/gu`）
  - 高德地图 API 动态加载修复，避免弱网/懒加载导致的未定义错误
- 天气分析与推荐（路径：`/weather`、`/weather-test`）
  - 接入和风天气 API，提供全国概览、路径天气分析、灾害预警联动
  - 3D 天气图层叠加（温度/风力等），点击点位显示 Tooltip 详情
  - 天气因素融入路线推荐，优先避开恶劣天气区域
- 语音助手与多模态交互
  - 基于 Web Speech API 的语音识别与 TTS 播报
  - 命令解析（时间/车辆/路线/天气/全屏/图层/关闭等），与 UI/地图联动
- Appflow Chat 集成（AI 助手）
  - Vue Composable（`useAppflowChat`）管理 SDK 生命周期、显隐、消息队列与错误兜底
  - 提供降级方案与独立测试页，保障在配置未就绪时仍可演示
- 视频识别（路径：`/video-recognition`）
  - YOLOv8 模型 + ONNX Runtime Web + Web Worker 实时推理
  - 检测框叠加、统计面板与置信度曲线，支持选择内置/本地视频

## 🧩 目录与重要文件

- 前端入口：`index.html`、`src/main.ts`、`src/App.vue`
- 路由：`src/router/index.ts`
- 天气服务：`src/services/weather.ts`、`src/services/disaster.ts`
- 语音助手：`src/composables/useVoiceAssistant.ts`、`src/components/VoiceAssistantFloat.vue`
- Appflow Chat 集成：`src/composables/useAppflowChat.ts`
- 视频识别：`src/views/VideoRecognition.vue`、`src/workers/yoloWorker.ts`、`public/models/yolov8n.onnx`
- 独立演示/测试页：
  - `appflow-test.html`、`appflow-test-standalone.html`（Chat 单页测试）
  - `voice-ai-integration.html`、`voice-debug.html`、`test-tts.html`（语音/联动演示）

## 🏁 快速开始

### 环境要求
- Node.js 18+（建议）
- Chrome/Edge（语音与 WebAssembly 表现更佳）

### 安装与启动

```bash
npm install
npm run dev
```

启动后默认打开 `http://localhost:5173/`。

### 构建

```bash
npm run build
```

如需本地演示 Token（用于 `vite.config.ts` 中 `/getDemoToken` 代理示例），可选启动：

```bash
node server/lke-token-server.mjs
```

## 🧭 路由与独立页面

- 页面路由
  - `/` 仪表盘/总览
  - `/weather` 天气分析与 3D 图层
  - `/weather-test` 天气/预警服务测试与连通性检测
  - `/video-recognition` 视频目标识别演示（YOLOv8 + ORT）
  - `/fire-evacuation` 火灾疏散演示（如项目中启用）
  - `/scene/gu` 地上/地下场景演示
  - `/lke-test` LKE 相关测试（如项目中启用）

- 独立 HTML 页面（开发服务器下可直接访问）
  - `/appflow-test-standalone.html`：Appflow Chat 最小复现与日志面板
  - `/appflow-test.html`：Chat SDK 方法检查与事件监听演示
  - `/voice-ai-integration.html`：语音识别 + Chat 联动完整演示
  - `/voice-debug.html`、`/test-tts.html`：语音调试与 TTS 测试

## ⚙️ 配置（环境变量）

在项目根目录创建 `.env.local`（示例）：

```ini
# 和风天气
VITE_QWEATHER_KEY=你的和风天气API密钥

# 高德地图
VITE_AMAP_KEY=你的高德地图API密钥
VITE_AMAP_SECURITY=你的高德安全密钥（如需）

# Appflow Chat（如需接入生产环境）
VITE_APPFLOW_INTEGRATE_ID=cit-xxxxxxxxxxxxxxxxxxxx
# 可按你的集成配置选择是否需要：
# VITE_APPFLOW_REQUEST_DOMAIN=https://xxxx.appflow.aliyunnest.com
```

注意：语音识别与部分浏览器 API 需要在 HTTPS 或“本地安全上下文”下使用。

## 🧪 演示建议（视频脚本要点）

1) 天气分析（`/weather`）
- 打开 3D 天气图层，点击点位查看详情；展示灾害预警与路径避险逻辑。

2) 语音助手
- 开始/停止识别；示例口令：“打开天气页面”“全屏”“显示/隐藏天气图层”。

3) Appflow Chat
- 正常接入：展示初始化、显隐、发送消息；
- 若接口未就绪：转至 `appflow-test-standalone.html`，展示日志与降级 UI（`window.appflowChatDebug` 调试）。

4) 视频识别（`/video-recognition`）
- 选择内置/本地视频，播放后展示检测框、统计与截图功能；
- 说明 YOLOv8 + ONNX Runtime Web + Worker 的实时推理链路。

## 🧯 常见问题（FAQ）

- 语音识别不起作用？
  - 请在 HTTPS 或本地安全上下文中访问；允许浏览器麦克风权限。
- Appflow Chat 报 400/404？
  - 检查 `integrateId`、请求域名白名单与“发布”状态；可用 `appflow-test-standalone.html` 快速定位；也可在控制台调用 `window.appflowChatDebug.getDebugInfo()` 查看状态。
- ONNX Runtime/WASM 加载失败？
  - 确认 `public/onnxruntime-web/` 运行时文件与 `public/models/yolov8n.onnx` 存在；使用现代浏览器并避免跨域路径。
- 高德地图报未定义？
  - 已实现动态加载修复；请提供正确的 `VITE_AMAP_KEY`/`VITE_AMAP_SECURITY`。

## 📚 深入阅读

- 天气集成完成报告：`README_INTEGRATION_COMPLETE.md`
- Appflow Chat 集成方案（含使用、调试与降级）：`APPFLOW_CHAT_INTEGRATION_COMPLETE.md`、`APPFLOW_CHAT_USAGE_GUIDE.md`、`APPFLOW_TEST_GUIDE.md`
- 视频识别演示说明：`VIDEO_RECOGNITION_DEMO.md`
- 高德地图 API 修复总结：`AMAP_API_FIX.md`
- 语音助手模块说明：`docs/VOICE_ASSISTANT.md`

---

如需 3–4 分钟的“精简演示脚本”或 10–12 分钟的“扩展版演示脚本”，可在上述演示建议基础上压缩/扩展相应镜头。
