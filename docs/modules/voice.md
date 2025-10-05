# 语音助手模块 (Voice Assistant)

> 精炼自 `docs/VOICE_ASSISTANT.md` 与故障排查文件，突出组成 / 解析 / 集成。

## 1. 组件与文件
| 作用 | 文件 |
|------|------|
| 识别 + TTS + 状态 | `src/composables/useVoiceAssistant.ts` |
| 指令解析纯函数 | `src/utils/voiceCommands.ts` |
| 浮动 UI | `src/components/VoiceAssistantFloat.vue` |
| 事件总线 | `src/bridge/voiceBus.ts` |
| Chat 发送桥接 | `src/composables/useAppflowChat.ts` |

## 2. 解析能力关键词
时间 / 车辆 / 路线 / 查询 / 关闭 / 天气 / 全屏 / 图层。

## 3. 指令监听示例
```ts
import { onVoiceCommand } from '@/bridge/voiceBus'
onVoiceCommand(e => {
  if (e.isFinal && e.parsed?.isQuery) {
    // 执行搜索逻辑
  }
})
```

## 4. 与 Chat 联动
- 语音文本最终结果 → `sendMessage`
- 识别中间态可用于 UI 实时展示
- 可加入“语义预处理”阶段（LLM）

## 5. 常见问题速查
详见：`docs/troubleshooting/voice.md`

## 6. 扩展路线
- 多语种支持
- 结果去重 / 防抖
- LLM 意图解析增强
- 全局 Pinia store

---
最后更新：2025-10-05
