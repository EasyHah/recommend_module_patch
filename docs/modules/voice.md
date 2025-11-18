# 语音助手模块 (Voice Assistant)

> 面向产品化落地的完整指引：架构/契约/权限/集成/测试/排障。详细程度与地图/管线类模块保持一致。

## 1. 使用场景与目标
- 免手动输入的业务控制：查询路线、切换页面、打开天气图层、全屏展示、关闭面板等。
- 物流语义增强：识别城市起止、时间点/时间窗、车辆类型、载重、冷链/危化/温控范围等。
- 对话联动：识别后的文本与意图进入聊天/推荐引擎，获得更自然的人机交互体验。

## 2. 架构与数据流
```
Web Speech API (ASR) → useVoiceAssistant → parseCommand → voiceBus(事件) → 业务处理/导航/Chat
                                               ↘ SpeechSynthesis (TTS) 回应/引导
```

关键点：
- 识别采用浏览器原生 Web Speech API（Chromium/Safari 族），自动错误恢复与自动重启监听。
- 解析与 UI/业务解耦：`parseCommand` 输出稳定的 ParsedCommand 契约，便于单元测试与后续 LLM 接入。
- 事件总线 `voiceBus` 提供全局订阅，避免跨组件强耦合。
- TTS 队列化播报，句子切分与语音选择，减少超长文本失败与打断问题。

## 3. 文件一览（职责映射）
| 作用 | 文件 |
|------|------|
| 识别+TTS+状态管理（组合式） | `src/composables/useVoiceAssistant.ts` |
| 纯函数命令解析（可测试） | `src/utils/voiceCommands.ts` |
| 浮动 UI 与入口按钮 | `src/components/VoiceAssistantFloat.vue` |
| 全局语音事件总线 | `src/bridge/voiceBus.ts` |
| Chat 发送桥接（可选） | `src/composables/useAppflowChat.ts` |
| 故障排查 | `docs/troubleshooting/voice.md` |

## 4. 契约（Contract）
### 4.1 ParsedCommand（语义解析输出）
字段要点：
- `text`：归一化文本；`changed`：解析到的要点字段列表（用于 UI 高亮/撤销）。
- 物流语义：`cities`、`location`、`vehicle`、`weightKg`、`demandType`、`temperatureRange`、`time`、`timeWindow`。
- 控制/导航：`navigation`、`isQuery`、`isClose`、`isWeather`、`isFullscreen`、`isLayer`、`isUndo`。

来源实现：`src/utils/voiceCommands.ts`（已配套测试 `tests/voiceCommands*.test.ts`）。

### 4.2 事件总线
```
type VoiceCommandPayload = {
  transcript: string
  isFinal: boolean
  parsed?: ParsedCommand
}

onVoiceCommand((e) => { /* 处理 */ })
emitVoiceCommand(payload)
```

### 4.3 组合式返回（节选）
```
useVoiceAssistant() → {
  listening, supported, error, interim, finalText, lastCommand,
  speaking, ttsPending,
  start, stop, toggle,
  speak(text, priority?), stopSpeaking(clearQueue?),
  onCommand(handler), parseCommand, showHelp
}
```

## 5. 权限、安全与兼容性
- 需要麦克风权限（HTTPS 或 localhost）。首次启动会进行 `getUserMedia({audio:true})` 预检以减少无语音错误。
- 浏览器支持：Chrome/Edge/Opera/部分国产 Chromium，Safari 有效；Firefox 对 ASR 支持较弱。
- 多标签/多页同时识别可能争抢音频设备，建议仅一个活动页启用。
- 隐私：仅在本地调用浏览器 ASR，不上传音频；若引入云识别需补充隐私合规说明。

## 6. 开发与集成
### 6.1 指令监听示例（全局订阅）
```ts
import { onVoiceCommand } from '@/bridge/voiceBus'
onVoiceCommand(e => {
  if (e.isFinal && e.parsed?.isQuery) {
    // 触发搜索/规划/调用后端接口
  }
  if (e.isFinal && e.parsed?.navigation) {
    // 使用 Router 跳转到 e.parsed.navigation.path
  }
})
```

### 6.2 在组件中直接使用组合式
```ts
import { useVoiceAssistant } from '@/composables/useVoiceAssistant'
const voice = useVoiceAssistant({ lang: 'zh-CN', interimResults: true, continuous: true })
voice.onCommand(({ transcript, isFinal, parsed }) => {
  if (isFinal && parsed?.isClose) /* 关闭面板 */
})
```

### 6.3 与 Chat 联动
- 语音最终文本 → 发送到 `useAppflowChat().sendMessage`。
- 解析结果可先经业务语义层/LLM 预处理，再入 Chat，得到更丰富回复。
- 建议：TTS 对关键反馈做播报（如“已切换到天气分析页面”）。

## 7. 错误处理与恢复
`useVoiceAssistant` 已内置：
- `no-speech`：长时间无输入给出提示，且在持续监听时自动重启。
- `audio-capture`/`not-allowed`：提供可读错误并停止自动重启，提示用户检查权限/设备。
- 识别开始时自动终止当前 TTS，避免麦克风回灌形成干扰。

更多见：`docs/troubleshooting/voice.md`（包括诊断清单、错误映射、SOP）。

## 8. 测试与验证
- 单元测试：`tests/voiceCommands.test.ts`、`tests/voiceCommands.enhanced.test.ts` 覆盖重量/温控/时间窗/城市/撤销等。
- 手动测试建议：
  - 在 HTTPS 环境或 localhost 打开主应用，授权麦克风。
  - 依次说出“从上海到北京 冷链10吨；明天上午8点到下午3点；查询”。
  - 观察 UI 高亮与导航/接口触发，查看控制台无错误日志。

## 9. 性能与体验建议
- 语音播放：分句切片、语音优选、自动 resume 修复 Chrome 偶发暂停。
- 输入防抖：对重复最终结果做 hash 去重，避免 UI 抖动（可在事件层实现）。
- 状态集中：如需跨页控制，建议引入 Pinia 全局 voice store（当前通过事件总线已足够）。

## 10. 后续规划
- 多语种自动识别与切换；
- 与 LLM 的意图抽取/纠错/补全；
- 指令模板可视化引导（帮助面板可 TTS 朗读）。

---
维护：语音子系统 Owner｜参考：`docs/VOICE_ASSISTANT.md`、`docs/troubleshooting/voice.md`
最后更新：2025-10-28
