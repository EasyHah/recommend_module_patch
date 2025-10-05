# 语音输入功能故障排除指南

## 问题诊断检查清单

### 1. 基础环境检查
- [ ] 浏览器支持检查
- [ ] HTTPS环境检查  
- [ ] 麦克风权限检查
- [ ] 设备硬件检查

### 2. 可能的问题及解决方案

#### 问题1：浏览器不支持语音识别
**症状：** 语音按钮显示为❌或禁用状态
**原因：** 浏览器不支持Web Speech API
**解决方案：**
```javascript
// 检查浏览器支持
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
    console.error('浏览器不支持语音识别');
}
```
**建议：** 使用Chrome、Edge、Safari等现代浏览器

#### 问题2：麦克风权限被拒绝
**症状：** 点击语音按钮后提示权限错误
**原因：** 用户拒绝了麦克风权限或浏览器设置问题
**解决方案：**
1. 检查浏览器地址栏是否有麦克风图标
2. 点击麦克风图标，选择"允许"
3. 在浏览器设置中检查网站权限

#### 问题3：HTTPS环境问题
**症状：** 在HTTP环境下语音功能不可用
**原因：** Web Speech API要求HTTPS环境（localhost除外）
**解决方案：**
- 开发环境：使用localhost
- 生产环境：必须使用HTTPS

#### 问题4：语音识别无响应
**症状：** 点击按钮后没有反应或一直显示"正在监听"
**可能原因：**
1. 麦克风硬件问题
2. 系统音频设备被其他程序占用
3. 环境噪音过大
4. 语音识别服务网络问题

**解决方案：**
1. 检查系统麦克风设备
2. 关闭其他音频应用
3. 在安静环境下测试
4. 检查网络连接

#### 问题5：语音识别精度差
**症状：** 识别结果不准确或频繁出错
**解决方案：**
1. 说话声音要清晰、标准
2. 避免方言和口音过重
3. 减少环境噪音
4. 检查语言设置是否正确（zh-CN）

### 3. 代码层面检查

#### 检查useVoiceAssistant配置
```typescript
const { 
  listening, 
  supported, 
  error, 
  toggle 
} = useVoiceAssistant({ 
  lang: 'zh-CN',           // 确保语言设置正确
  interimResults: true,    // 显示实时结果
  continuous: true         // 持续监听
})
```

#### 检查组件导入
```vue
<!-- App.vue -->
<template>
  <router-view />
  <VoiceAssistantFloat :visible="true" @command="onVoiceCommand" />
</template>

<script setup lang="ts">
import VoiceAssistantFloat from '@/components/VoiceAssistantFloat.vue'
</script>
```

#### 检查错误处理
```typescript
recognition.onerror = (e: any) => { 
  const code = e?.error
  let msg = '语音识别错误'
  switch (code) {
    case 'no-speech':
      msg = '未检测到声音，请靠近麦克风重试'
      break
    case 'audio-capture':
      msg = '未发现麦克风或无权限，请检查设备与权限设置'
      break
    case 'not-allowed':
      msg = '麦克风权限被拒绝，请在浏览器中允许使用麦克风'
      break
    default:
      msg = code ? `语音识别错误：${code}` : '语音识别出现未知错误'
  }
  error.value = msg
}
```

### 4. 调试工具

#### 使用浏览器开发者工具
1. 打开F12开发者工具
2. 查看Console标签页的错误信息
3. 查看Network标签页的网络请求
4. 查看Application标签页的权限设置

#### 测试页面
创建了以下测试页面来诊断问题：
- `/voice-test.html` - 基础语音功能测试
- `/voice-debug.html` - 详细诊断工具

### 5. 常见错误码说明

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| `no-speech` | 未检测到语音 | 检查麦克风，说话更清晰 |
| `audio-capture` | 无法访问音频设备 | 检查麦克风连接和权限 |
| `not-allowed` | 权限被拒绝 | 在浏览器中允许麦克风权限 |
| `network` | 网络错误 | 检查网络连接 |
| `service-not-allowed` | 服务不可用 | 检查浏览器设置或换个浏览器 |

### 6. 快速修复建议

如果语音功能完全无法使用，请按以下步骤逐一检查：

1. **立即检查**：
   - 浏览器类型和版本
   - 是否为HTTPS环境
   - 麦克风权限状态

2. **简单测试**：
   - 访问 `http://localhost:5175/voice-test.html`
   - 点击测试按钮
   - 查看错误信息

3. **权限重置**：
   - 清除浏览器缓存和Cookie
   - 重新加载页面
   - 重新授权麦克风权限

4. **环境切换**：
   - 尝试不同的浏览器
   - 检查系统麦克风设置
   - 使用耳机麦克风测试