# 多模态交互式物流调度指挥平台 - 软件著作权申请材料草案

## 1. 软件基本信息

*   **软件全称**：多模态交互式物流调度指挥平台
*   **软件简称**：智能物流语音指挥平台
*   **版本号**：V1.0
*   **开发完成日期**：2025年11月18日

## 2. 开发目的

为了解决传统物流调度系统操作复杂、菜单层级深、移动办公不便的问题，开发本平台。系统引入“语音+文本+触控”的多模态交互方式，结合大语言模型（LLM）的语义理解能力，让调度员可以通过自然语言指令完成复杂的查询、调度与控制任务，极大地降低了系统使用门槛，提升了人机交互效率。

## 3. 技术特点

1.  **大语言模型驱动 (LLM-Driven)**：集成 **LKE (Logistics Knowledge Engine)** 或同类大模型服务，具备强大的自然语言理解能力，能解析模糊指令（如“帮我找一辆去上海的车”）并转化为结构化操作。
2.  **Web Speech API 深度应用**：利用浏览器原生的语音识别与合成技术，实现零插件的语音交互体验，支持实时语音转文字（STT）与文字转语音（TTS）播报。
3.  **上下文感知交互**：系统具备多轮对话记忆能力，能够理解“起点北京”、“终点上海”、“明天出发”等分段指令，并自动组合成完整的调度任务。
4.  **悬浮式智能助手**：采用全局悬浮球设计（VoiceAssistantFloat），无论用户处于哪个业务界面，均可随时唤醒助手进行跨模块操作。
5.  **智能预处理机制**：在发送给大模型前，前端对语音指令进行本地预处理与关键词匹配，提高响应速度并减少无效请求。

## 4. 软件功能描述

### 4.1 智能语音助手
*   **唤醒与聆听**：支持点击唤醒或关键词唤醒（如“你好小易”），实时反馈聆听状态（波纹动画）。
*   **指令解析**：自动识别并执行导航跳转（“去仪表盘”）、数据查询（“查询今日订单”）、地图控制（“切换天气图层”）等指令。
*   **语音反馈**：操作完成后，助手会通过语音播报执行结果，实现“眼不离屏”的操作体验。

### 4.2 自然语言聊天交互 (Chat Integration)
*   **多轮对话**：用户可通过文字或语音与 AI 进行自由对话，咨询物流政策、天气情况或系统使用方法。
*   **业务意图识别**：AI 自动识别用户意图，如检测到“运输规划”意图时，自动调用路径规划模块并填充参数。
*   **混合输入**：支持在对话过程中随时切换语音或键盘输入，适应不同办公环境。

### 4.3 快捷指令系统
*   **可视化帮助**：提供动态更新的“语音命令帮助”面板，引导用户掌握常用指令（如“车型选择”、“时间窗设置”）。
*   **状态反馈**：实时显示识别到的中间结果（Interim Results）与最终结果（Final Results），便于用户纠正识别错误。

## 5. 运行环境

*   **客户端**：
    *   浏览器：Chrome / Edge / Safari (需支持 Web Speech API)
    *   麦克风：标准音频输入设备
*   **服务端**：
    *   Node.js (Token Server)
    *   WebSocket 服务 (用于实时消息推送)
    *   LLM 推理服务接口

## 6. 代码规模
*   **代码行数**：约 12,000 行（含语音逻辑、IM通讯模块及界面组件）

## 7. 核心代码摘录

### 7.1 语音助手与大模型集成 (VoiceAssistantFloat.vue)
```typescript
// 引入 LKE Chat：用于替换原 Appflow 聊天承接
const {
  initialize: initLKE,
  isReady: lkeReady,
  messages: lkeMessages,
  sendMessage: sendLKE,
  streaming,
} = useLKEChat()

const { 
  listening, 
  supported, 
  start,
  stop,
  onCommand,
  speak
} = useVoiceAssistant({ lang: 'zh-CN', interimResults: true, continuous: true })

// 监听语音命令
onCommand((cmd) => {
  // 唤醒词检测
  if (containsWakeWord(cmd.transcript)) {
    wakeActive.value = true
    speak('我在，请吩咐')
    return
  }
  
  // 如果已唤醒，则将语音转文字发送给大模型
  if (wakeActive.value && cmd.isFinal) {
    sendLKE(cmd.transcript)
  }
})
```

### 7.2 聊天界面渲染 (VoiceAssistantFloat.vue Template)
```vue
<div class="lke-chat__body">
  <div class="lke-msg-list">
    <div v-for="(m, i) in lkeMessages" :key="i" class="lke-msg" :class="m.role">
      <span class="role">{{ m.role === 'user' ? '我' : 'AI' }}</span>
      <div class="bubble" :class="{ typing: streaming && i === lastAssistantIndex }">
        <span class="content" :style="contentStyle(m)">{{ m.content }}</span>
        <span v-if="streaming && i === lastAssistantIndex" class="cursor">▌</span>
      </div>
    </div>
  </div>
  <!-- 思考过程折叠 -->
  <details class="evt" v-if="thoughtLog.length">
    <summary>思考过程 thought ({{ thoughtLog.length }})</summary>
    <pre class="evt-pre">{{ thoughtLog.join('\n') }}</pre>
  </details>
</div>
```
