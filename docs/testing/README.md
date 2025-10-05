# 测试页面文档 (Test Pages Documentation)

> 统一测试页面入口与使用指南

## 📍 访问入口
- **统一测试首页**: `/tests/pages/index.html`
- **主应用入口**: `/index.html`

## 🧪 测试页面分类

### 1. Appflow Chat 测试
| 页面 | 用途 | 访问路径 |
|------|------|----------|
| `appflow-test-standalone.html` | 最小环境 SDK 验证，排除框架干扰 | `/tests/pages/appflow-test-standalone.html` |
| `appflow-test.html` | 项目环境内 SDK 方法/事件测试 | `/tests/pages/appflow-test.html` |

### 2. 语音功能测试
| 页面 | 用途 | 访问路径 |
|------|------|----------|
| `voice-debug.html` | 全流程语音诊断（权限/环境/实时结果） | `/tests/pages/voice-debug.html` |
| `test-tts.html` | TTS 文本转语音参数测试 | `/tests/pages/test-tts.html` |
| `voice-test.html` | 基础语音识别快速验证 | `/tests/pages/voice-test.html` |

### 3. 集成功能测试
| 页面 | 用途 | 访问路径 |
|------|------|----------|
| `voice-ai-integration.html` | 语音识别 + AI Chat 完整联动演示 | `/tests/pages/voice-ai-integration.html` |

## 🚀 使用建议

### 快速诊断流程
1. **语音问题**: `voice-debug.html` → 检查支持/权限 → `test-tts.html` 验证输出
2. **Chat 问题**: `appflow-test-standalone.html` → 最小环境验证配置
3. **集成问题**: `voice-ai-integration.html` → 端到端功能测试

### 开发调试流程
1. 在 `tests/pages/index.html` 选择相应测试页面
2. 使用浏览器开发者工具查看详细日志
3. 参考对应的故障排查文档（`docs/troubleshooting/`）

## 🔗 相关文档
- 语音故障排查: `docs/troubleshooting/voice.md`
- Appflow Chat 集成: `docs/modules/appflow-chat.md`
- 主文档索引: `docs/README.md`

## 📝 维护说明
- 所有测试页面已整合到 `tests/pages/` 目录
- 删除了重复和冗余的测试文件
- 统一了导航栏和路径引用
- 测试页面独立于主应用，可单独访问

---
最后更新: 2025-10-05