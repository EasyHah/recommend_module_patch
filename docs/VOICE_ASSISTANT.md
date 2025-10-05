# 语音助手模块说明

## 组成文件
| 文件 | 作用 |
|------|------|
| `src/composables/useVoiceAssistant.ts` | Web Speech API + TTS + 状态/事件 |
| `src/utils/voiceCommands.ts` | 纯函数命令解析（可测试） |
| `src/components/VoiceAssistantFloat.vue` | 悬浮 UI 与 Chat 联动 |
| `src/bridge/voiceBus.ts` | 全局语音事件广播 |
| `src/composables/useAppflowChat.ts` | 聊天 SDK 及语音消息发送 |

## 解析能力
时间 / 车辆 / 路线 / 查询 / 关闭 / 天气 / 全屏 / 图层。

## 使用示例
```ts
import { onVoiceCommand } from '@/bridge/voiceBus'
onVoiceCommand(e => {
  if (e.isFinal && e.parsed?.isQuery) {
    // 执行搜索逻辑
  }
})
```

## 测试
```bash
npm install
npm run test
```

## 扩展建议
1. LLM 语义增强  2. 多语种  3. 去重防抖  4. Pinia 全局状态。
