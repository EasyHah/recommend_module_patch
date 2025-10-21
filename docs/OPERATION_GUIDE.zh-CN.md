# 工业园区智能可视化与 AI 平台 · 操作手册（zh-CN）

> 目标：把 README 的“功能总览/运行方式”转化为可落地的操作步骤，并补充典型示例场景与图样建议，便于新人 10 分钟完成一次完整演示。适配 Windows + PowerShell。

最后更新：2025-10-20

## 1. 快速上手

- 环境要求
  - Node.js 18 及以上（建议 LTS）
  - Chrome 或 Edge（语音/WebAssembly/Workers 体验更好）
- 克隆与安装
  - 打开 PowerShell，进入项目目录后执行：

```powershell
npm install
```

- 启动开发服务器

```powershell
npm run dev
```

默认地址：http://localhost:5173/ （如端口占用以终端提示为准）。

- 生产构建

```powershell
npm run build
```

- 可选：本地演示 Token 服务（示例）

```powershell
node server/lke-token-server.mjs
```

> 注：如你使用 VS Code 内置任务，也可以直接运行“Tasks: dev-server / build-project”。

## 2. 必备配置（.env.local 示例）

在项目根目录创建 `.env.local` 并填入：

```ini
# 和风天气
VITE_QWEATHER_KEY=你的和风天气API密钥

# 高德地图
VITE_AMAP_KEY=你的高德地图API密钥
VITE_AMAP_SECURITY=你的高德安全密钥（如需）

# Appflow Chat（如需）
VITE_APPFLOW_INTEGRATE_ID=cit-xxxxxxxxxxxxxxxxxxxx
# 可选：
# VITE_APPFLOW_REQUEST_DOMAIN=https://xxxx.appflow.aliyunnest.com
```

提醒：Vite 仅会注入以 VITE_ 开头的变量到前端。真实后端密钥请放服务器或本地私有环境变量中。

## 3. 功能入口与页面导航

- 主页与主要路由（见 `src/router/index.ts`）
  - `/` 仪表盘/总览
  - `/weather` 天气分析 + 3D 图层
  - `/weather-test` 天气与预警服务连通测试
  - `/video-recognition` 视频目标识别（YOLOv8 + ONNX Runtime Web）
  - `/fire-evacuation` 火灾疏散演示（若启用）
  - `/lke-test` LKE 相关测试（若启用）
  - `/route` 路线规划示例（若启用）
  - `/recommend` 推荐示例（若启用）
  - `/logistics` 物流可视化演示（若启用）

- 独立测试页面（本地 dev 下直接以路径访问）
  - `/tests/pages/appflow-test-standalone.html`
  - `/tests/pages/appflow-test.html`
  - `/tests/pages/voice-ai-integration.html`
  - `/tests/pages/voice-debug.html`
  - `/tests/pages/test-tts.html`

> 提示：这些 HTML 文件位于 `tests/pages/`。在开发服务器下可直接访问对应路径；生产打包时如需保留，可将其复制到 `public/` 或在部署时同步到静态目录。

## 4. 一次标准演示流（10 分钟）

1) 天气分析（/weather）
- 打开 3D 天气图层，观察省份颜色（风险等级：低/中/高/极端）。
- 点击任意点位查看 Tooltip，包含温度/风/降水等信息。
- 讲解“路线避险”：恶劣天气会降低路线评分或触发替代路线建议。

2) 语音助手
- 打开浮动语音按钮，开始/停止识别。
- 口令示例：
  - “打开天气页面” → 自动跳转 `/weather`
  - “全屏”/“退出全屏” → UI 进入/退出全屏
  - “显示天气图层”“隐藏天气图层” → 切换图层
- 如识别有误，可在 `tests/pages/voice-debug.html` 诊断：环境、权限、API 状态。

3) 聊天助手（LKE 为主，Appflow 备选）
- 主流程：内置的 LKE 聊天（useLKEChat）在“语音助手浮窗”里使用；首次打开聊天或发送消息时会自动初始化，支持 WS 或 SSE。
- 备选验证：当你需要验证 Appflow SDK 时，可使用 `/tests/pages/appflow-test-standalone.html`：
  - 填 integrateId 与 requestDomain
  - 点击“初始化 SDK”“初始化聊天界面”“显示聊天窗口”“发送测试消息”
  - 通过实时日志面板查看事件、状态与错误定位

4) 视频识别（/video-recognition）
- 选择内置或本地视频，开始播放。
- 展示：检测框、置信度曲线、统计面板；说明推理链路“主线程视频帧 → MediaPipe 推理 → 主线程绘制 overlay”。
- 默认优先使用 MediaPipe Tasks（GPU/CPU 自动回退），当环境不满足时自动降级到演示 Mock 服务；若性能不足，降低分辨率或调小 maxFPS。

## 5. 操作手册 · 按模块分步

### 5.1 天气分析与路线（Weather Module）
- 前置：配置 `VITE_QWEATHER_KEY`、`VITE_AMAP_KEY`、`VITE_AMAP_SECURITY`。
- 打开 `/weather`，等待地图与图层加载。
- 常用操作：
  - 切换图层（温度/风力等），查看对应着色变化。
  - 点击省份或关键节点查看详情。
  - 在带有路线演示的页面，触发“避险推荐”。
- 故障排查：
  - 无地图 → 检查高德 Key、控制台脚本是否加载成功。
  - 无天气数据 → 检查和风 Key、配额与网络。
  - 风险评分异常 → 可能处于 Mock 或演示分值；留意控制台日志。
- 参考文档：`docs/modules/weather.md`

### 5.2 语音助手（Voice Assistant）
- 前置：建议在 HTTPS 或本地安全上下文；浏览器允许麦克风权限。
- 打开主应用，点击语音按钮开始识别；也可到 `/tests/pages/voice-debug.html` 做专项诊断。
- 常用口令：时间/车辆/路线/查询/关闭/天气/全屏/图层 等。
- 与 Chat 联动：在 `voice-ai-integration.html` 中可观察语音文本如何进入聊天消息链路。
- 故障排查：见 `docs/troubleshooting/voice.md`；模块说明见 `docs/modules/voice.md`。

### 5.3 聊天助手（LKE 主，Appflow 备）
- LKE（主）：
  - 前置：在 `.env.local` 配置 `VITE_LKE_APP_KEY`、`VITE_LKE_BOT_ID`、`VITE_LKE_ACCESS_TYPE=ws|sse`，以及 Token 服务端点 `VITE_LKE_TOKEN_ENDPOINT`（可用 `server/lke-token-server.mjs` 作为演示）。
  - 在浮窗中点击“AI 助手”按钮打开聊天；输入或语音识别的最终文本会自动发送；支持流式回复与思考过程显示，并内置 TTS 播报与语音/AI 互斥锁。
- Appflow（备）：
  - 前置：`VITE_APPFLOW_INTEGRATE_ID`、`VITE_APPFLOW_REQUEST_DOMAIN`、`VITE_APPFLOW_SOURCE_DOMAIN`。
  - 校验方式：使用 `/tests/pages/appflow-test-standalone.html` 或在集成 Hook 中调用 `useAppflowChat().initialize()` 后 `showChat()/sendMessage()`。
  - 常见错误：400/404（integrateId 或域白名单），ReadableStream 错误（已做去抖重置/降级弹层）。

### 5.4 视频识别（MediaPipe 优先，Mock 兜底）
- 默认使用 MediaPipe Tasks Vision（efficientdet_lite0），无需本地 ONNX/WASM；若浏览器不兼容或出现纹理跨域问题，会自动回退到 CPU，再不行则降级到 Mock 服务，保障演示流畅。
- 打开 `/video-recognition`，选择视频后开始推理；页面有状态提示（initializing/warming_up/running）。
- 建议参数：confidenceThreshold≈0.25、maxFPS≈8–12（弱机型可降）。
- 常见问题：
  - 跨域视频 WebGL 错误 → 已自动 CPU 回退；必要时改用同源视频或 webcam。
  - 时间戳不单调 → 已自动平滑处理；可忽略短暂警告。
  - Mock 模式下仅演示 UI 逻辑，不代表真实检测效果。

## 6. 数据与脚本（可选）

- 物流/地理数据脚本：见 `scripts/` 目录
  - `parse:logistics`：从 CSV 解析物流线路
  - `parse:centers`：按中心解析线路
  - `gen:vendors`：生成供应商数据
  - `merge:warehouse-vendors`：仓库与供应商数据融合
  - `convert:obj`：将 OBJ 转为 glTF（配合 `obj2gltf`）

PowerShell 运行示例（以仓库根目录 CSV 为例）：

```powershell
npm run parse:logistics
npm run parse:centers
npm run gen:vendors
npm run merge:warehouse-vendors
```

> 注意：命令内部脚本路径/参数默认写死为仓库示例，可根据你的 CSV/目标路径调整脚本源代码或传参。

## 7. 典型示例场景（含讲解稿）

- 场景 A：极端天气下的路线避险
  1) 进入 `/weather`，打开风力与降水图层。
  2) 选择“北京 → 上海”的示例路线（或演示数据）。
  3) 说明评分：降水和大风导致风险分上升，推荐改道或延后时段。
  4) 强调 Tooltip 与预警点位：点击查看灾害详情。

- 场景 B：语音+聊天（LKE）调度问答
  1) 打开 `/tests/pages/voice-ai-integration.html`。
  2) 口令：“今天华东雨势如何？给我推荐一条安全路线。”
  3) 页面展示：语音转文字 → LKE 流式回复（可播报）→ 可联动推荐侧栏或页面跳转。
  4) 若需要验证 Appflow，切到 `/tests/pages/appflow-test-standalone.html` 做 SDK 连通性验证。

- 场景 C：门口摄像头的轻量识别
  1) 打开 `/video-recognition`，选择低分辨率短视频。
  2) 将 `maxFPS` 降到 6～8，确保实时性。
  3) 观察检测框与统计；如出现性能瓶颈，打开 Mock 模式说明 UI 逻辑。

- 场景 D：弱网/首屏地图加载
  1) 首次进入 `/weather` 时刻意断开/减速网络（开发者工具）
  2) 说明已做“高德地图动态加载修复”，避免弱网未定义报错
  3) 打开控制台，演示脚本按需加载与错误兜底

- 场景 E：全屏下的语音控制与图层切换
  1) 进入 `/weather`，点击“全屏”进入全屏地图。
  2) 说“天气图层”“省份色彩”“退出全屏”等口令，观察图层/全屏状态变化。
  3) 说“起点北京终点上海”触发路线设置并执行一次天气分析（当前为演示 Mock 评分）。

## 8. 常见问题（FAQ + 快速排查）

- 语音识别不起作用？
  - 在 HTTPS 或本地安全上下文访问；检查麦克风权限。
  - 使用 `voice-debug.html` 做环境与权限检测。
- Appflow Chat 报 400/404？
  - 检查 `integrateId`、请求域白名单与发布状态；可在独立测试页查看实时日志与 `window.appflowChatDebug.getDebugInfo()`。
- MediaPipe/模型加载问题？
  - 默认使用在线模型与 WASM；如网络受限可改为本地托管；若 GPU 纹理报错已自动 CPU 回退。
- 高德地图未定义？
  - 提供正确的 `VITE_AMAP_KEY`/`VITE_AMAP_SECURITY`；项目内已实现动态加载修复。

更多见：`docs/testing/README.md`、`docs/troubleshooting/*`、`docs/changelog/BUG_FIXES_REPORT.md`。另：天气页“路线天气分析”当前在 `analyzeRouteWeather()` 中包含 Mock 评估逻辑，真实灾害融合评估请对接 `services/disaster.ts` 的 assessRouteRisk。

## 9. 给图样（示意图）建议

为便于你补充图样，建议以下 6 张关键截图/示意：
- 图 1：系统总览（首页）：模块区块 + 入口位置标注。
- 图 2：天气分析页面：省份着色 + Tooltip + 预警点位。
- 图 3：语音助手浮窗：开始/停止识别与示例口令。
- 图 4：Appflow Chat 独立测试页：配置面板 + 日志区。
- 图 5：视频识别页面：检测框 + 置信度曲线 + 参数面板标注。
- 图 6：弱网地图加载流程：脚本动态加载序列时序图（或网络面板标注）。

制作要求：
- 统一配色与字体；在关键交互元素处添加编号与说明文字。
- 建议在每张图边缘预留 40–60px 白边，便于在文档中嵌入与排版。

## 10. 质量与运行自检

- 本地基本校验
  - 类型检查：`npm run typecheck`
  - 单元测试（如有）：`npm run test`
  - 构建：`npm run build`
- 通过标准：无类型错误；测试全部通过；构建产物生成成功。

---
如需我将本操作手册链接加入 `README.md` 的“深入阅读/使用指南”章节，或补充英文版（EN），告诉我即可。
