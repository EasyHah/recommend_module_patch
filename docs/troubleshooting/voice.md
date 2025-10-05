# 语音功能故障排查与修复统一指南

> 合并自 `VOICE_FIX_GUIDE.md` 与 `VOICE_TROUBLESHOOTING.md`（原文件将保留暂存，建议后续标记“已迁移”后删除）。

## 1. 快速诊断清单
| 检查项 | 说明 | OK 标志 |
|--------|------|---------|
| 浏览器支持 | Chromium / Safari (Web Speech API) | 支持状态为 ✓ |
| 协议 | HTTPS 或 localhost | 识别按钮可点击 |
| 麦克风权限 | 浏览器地址栏授权 | 未出现 not-allowed 错误 |
| 设备可用 | 系统声音设置正常 | 能录制其它应用语音 |
| 语音 API 初始化 | `SpeechRecognition` 实例成功 | 无初始化异常日志 |

## 2. 常见问题 → 现象 → 解决
| 问题 | 典型症状 | 解决步骤 |
|------|----------|----------|
| 未授权麦克风 | 立即报错或无声音 | 浏览器地址栏图标 → 允许 → 刷新 |
| 浏览器不支持 | 控件禁用 / 控制台报不支持 | 更换 Chrome / Edge / Safari；移动端需特定版本 |
| 非安全上下文 | `getUserMedia` 拒绝 | 使用 HTTPS 或 localhost |
| no-speech | 长时间无结果 | 靠近麦克风 / 降噪 / 减少停顿 |
| audio-capture | 设备不可用 | 检查系统层麦克风权限，关闭其它占用程序 |
| not-allowed | 权限拒绝 | 重置浏览器权限设置并重新授权 |
| 识别精度差 | 结果乱跳或片段化 | 设 `continuous=true` + 安静环境 + 标准普通话 |
| 长时间监听失效 | onend 被触发 | 在 onend 中自动重启（带节流） |

## 3. 推荐代码片段
```ts
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
if (!SpeechRecognition) throw new Error('当前浏览器不支持语音识别')

const recognition = new SpeechRecognition()
recognition.lang = 'zh-CN'
recognition.continuous = true
recognition.interimResults = true
recognition.onresult = e => {
  let final = '', interim = ''
  for (let i=e.resultIndex; i<e.results.length; i++) {
    const r = e.results[i]
    ;(r.isFinal? final: interim) += r[0].transcript
  }
  // 更新 UI / 发送指令
}
recognition.onerror = e => handleError(e.error)
recognition.onend = () => shouldAutoRestart && recognition.start()
```

### 错误处理映射
```ts
function handleError(code?: string){
  const map: Record<string,string> = {
    'no-speech':'未检测到语音，请靠近麦克风重试',
    'audio-capture':'未发现可用麦克风或被占用',
    'not-allowed':'麦克风权限被拒绝，请在浏览器设置中允许',
    'network':'网络异常，语音服务不可用',
    'service-not-allowed':'浏览器禁用了语音服务'
  }
  const message = map[code||''] || `语音识别错误: ${code||'未知'}`
  console.warn(message)
}
```

## 4. 测试页面与用途
| 页面 | 用途 | 入口 |
|------|------|------|
| `voice-debug.html` | 全流程诊断（权限/环境/实时结果/错误） | `/voice-debug.html` |
| `test-tts.html` | 文本转语音参数试听 | `/test-tts.html` |
| `voice-ai-integration.html` | 语音 + Chat 联动与命令控制 | `/voice-ai-integration.html` |

## 5. 排查流程（建议 SOP）
1. 打开 `voice-debug.html` 确认支持、权限、HTTPS 3 项全部绿 ✅
2. 说出简单词语（“你好”）验证基础识别
3. 检查控制台是否有 `not-allowed` / `audio-capture`
4. 切到主应用测试悬浮语音按钮
5. 在 `voice-ai-integration.html` 验证命令解析与 Chat 联动
6. 若失败：切换浏览器 → 重启系统音频服务 → 清除缓存

## 6. 提升建议
| 方向 | 建议 | 价值 |
|------|------|------|
| 语义增强 | 引入 LLM 二次解析 | 更自然的命令理解 |
| 多语种 | 识别 `en-US` / 自动检测 | 增强国际化 |
| 防抖去重 | 对重复最终结果 hash 去重 | 降低 UI 闪烁 |
| 状态集中 | Pinia 全局 voice store | 降低跨组件耦合 |
| 日志持久化 | localStorage buffer + 导出 | 远程排障更方便 |

## 7. FAQ 精选
| 问题 | 答案 |
|------|------|
| Firefox 可以吗？ | Web Speech 识别支持差，建议 Chromium 家族 |
| 必须 HTTPS 吗？ | 是，除 localhost 以外都需安全上下文 |
| 可同时多个标签页识别吗？ | 谨慎，不同标签可能争抢音频设备 |
| 识别结果有延迟？ | 关闭其它占用音频的程序，保持网络稳定 |

## 8. 旧文件迁移状态
- 已合并：`VOICE_FIX_GUIDE.md`、`VOICE_TROUBLESHOOTING.md`
- 计划：两迭代后删除旧文件并在 PR 模板中强制引用本文件

---
**维护负责人**：语音子系统 Owner  
**最后更新**：2025-10-05
