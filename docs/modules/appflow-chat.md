# Appflow Chat 集成模块

> 汇总自 `APPFLOW_CHAT_INTEGRATION_COMPLETE.md`、`APPFLOW_CHAT_USAGE_GUIDE.md`、`APPFLOW_TEST_GUIDE.md` 关键点。完整调试细节仍可查看原始文件（可后续下沉）。

## 1. 架构概览
- Composable: `useAppflowChat.ts` 管理生命周期 / 显隐 / 队列
- 调试：全局 `window.appflowChatDebug.*`
- 降级：初始化失败 → fallback UI + 可重试

## 2. 初始化示例
```ts
const { initialize, showChat, sendMessage } = useAppflowChat()
await initialize({ integrateId, requestDomain })
showChat()
sendMessage('你好')
```

## 3. 调试命令
```js
window.appflowChatDebug.getDebugInfo()
window.appflowChatDebug.resetSDKState()
window.appflowChatDebug.showFallbackChat()
window.appflowChatDebug.initialize()
```

## 4. 独立测试页路径
| 目的 | 页面 |
|------|------|
| 最小化 SDK 验证 | `/appflow-test-standalone.html` |
| 项目内事件/方法测试 | `/appflow-test.html` |
| 语音联动 | `/voice-ai-integration.html` |

## 5. 常见错误速查
| 症状 | 重点排查 |
|------|----------|
| 400 | integrateId / 域名白名单 / 发布状态 |
| ReadableStream 错误 | 属于 400 连带现象，先看 400 原因 |
| CORS | 域名未加入白名单 / 测试域名过期 |
| 无 show() | 版本差异，用 `initChat` 或 `open` 兜底 |

## 6. 保护与恢复
- 初始化超时（10s）
- 自动检测流锁定并重置
- 降级模式 UI 兜底

## 7. 扩展建议
- 接入真实后端对话日志埋点
- 文件/图片消息类型拓展
- 聊天窗口状态（Pinia）对外暴露

---
最后更新：2025-10-05
