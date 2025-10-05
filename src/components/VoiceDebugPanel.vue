<template>
  <div class="voice-debug-panel" v-if="showDebug">
    <div class="debug-header">
      <h3>🎤 语音功能调试</h3>
      <button @click="showDebug = false" class="close-btn">×</button>
    </div>
    
    <div class="debug-content">
      <div class="status-grid">
        <div class="status-item" :class="{ success: browserSupported, error: !browserSupported }">
          <span class="label">浏览器支持:</span>
          <span class="value">{{ browserSupported ? '✅ 支持' : '❌ 不支持' }}</span>
        </div>
        
        <div class="status-item" :class="{ success: httpsSecure, error: !httpsSecure }">
          <span class="label">HTTPS环境:</span>
          <span class="value">{{ httpsSecure ? '✅ 安全' : '❌ 需要HTTPS' }}</span>
        </div>
        
        <div class="status-item" :class="{ success: micPermission, error: !micPermission }">
          <span class="label">麦克风权限:</span>
          <span class="value">{{ micPermission ? '✅ 已授权' : '❌ 未授权' }}</span>
        </div>
        
        <div class="status-item" :class="{ success: voiceSupported, error: !voiceSupported }">
          <span class="label">语音助手:</span>
          <span class="value">{{ voiceSupported ? '✅ 就绪' : '❌ 未就绪' }}</span>
        </div>
      </div>
      
      <div class="action-buttons">
        <button @click="requestMicPermission" class="debug-btn" :disabled="micPermission">
          🎤 请求麦克风权限
        </button>
        <button @click="testVoice" class="debug-btn primary" :disabled="!canTest">
          🗣️ 测试语音识别
        </button>
      </div>
      
      <div class="test-result" v-if="testResult">
        <h4>测试结果:</h4>
        <div class="result-content">{{ testResult }}</div>
      </div>
      
      <div class="error-log" v-if="errors.length > 0">
        <h4>错误日志:</h4>
        <div class="log-content">
          <div v-for="(error, index) in errors" :key="index" class="error-item">
            {{ error }}
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <!-- 调试按钮 -->
  <button 
    v-if="!showDebug" 
    @click="showDebugPanel" 
    class="debug-trigger"
    title="语音功能调试"
  >
    🐛
  </button>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const showDebug = ref(false)
const browserSupported = ref(false)
const httpsSecure = ref(false)
const micPermission = ref(false)
const voiceSupported = ref(false)
const testResult = ref('')
const errors = ref<string[]>([])

const canTest = computed(() => browserSupported.value && httpsSecure.value)

const showDebugPanel = () => {
  showDebug.value = true
  runDiagnostics()
}

const runDiagnostics = async () => {
  errors.value = []
  
  // 检查浏览器支持
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  browserSupported.value = !!SpeechRecognition
  
  if (!browserSupported.value) {
    errors.value.push('浏览器不支持Web Speech API，请使用Chrome、Edge或Safari')
  }
  
  // 检查HTTPS环境
  httpsSecure.value = location.protocol === 'https:' || location.hostname === 'localhost'
  
  if (!httpsSecure.value) {
    errors.value.push('需要HTTPS环境才能使用语音识别（localhost除外）')
  }
  
  // 检查麦克风权限
  await checkMicPermission()
  
  // 检查语音助手状态
  checkVoiceAssistant()
}

const checkMicPermission = async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    errors.value.push('浏览器不支持媒体设备访问')
    return
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    micPermission.value = true
    stream.getTracks().forEach(track => track.stop())
  } catch (error: any) {
    micPermission.value = false
    
    switch (error.name) {
      case 'NotAllowedError':
        errors.value.push('麦克风权限被拒绝，请在浏览器中允许访问')
        break
      case 'NotFoundError':
        errors.value.push('未找到麦克风设备')
        break
      default:
        errors.value.push(`麦克风访问失败: ${error.message}`)
    }
  }
}

const checkVoiceAssistant = () => {
  // 这里可以检查语音助手组件的状态
  voiceSupported.value = browserSupported.value && httpsSecure.value && micPermission.value
}

const requestMicPermission = async () => {
  await checkMicPermission()
}

const testVoice = async () => {
  if (!canTest.value) return
  
  testResult.value = '正在启动语音识别测试...'
  
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  const recognition = new SpeechRecognition()
  
  recognition.lang = 'zh-CN'
  recognition.interimResults = true
  recognition.continuous = false

  recognition.onstart = () => {
    testResult.value = '🎤 语音识别已启动，请说话...'
  }

  recognition.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (result.isFinal) {
        testResult.value = `✅ 识别成功: "${result[0].transcript}"`
      } else {
        testResult.value = `🔄 正在识别: "${result[0].transcript}"`
      }
    }
  }

  recognition.onerror = (event: any) => {
    testResult.value = `❌ 识别失败: ${event.error}`
    errors.value.push(`语音识别错误: ${event.error}`)
  }

  recognition.onend = () => {
    if (testResult.value.includes('正在识别') || testResult.value.includes('已启动')) {
      testResult.value = '⏹️ 识别结束，未检测到语音'
    }
  }

  try {
    recognition.start()
  } catch (error: any) {
    testResult.value = `❌ 启动失败: ${error.message}`
    errors.value.push(`启动语音识别失败: ${error.message}`)
  }
}

onMounted(() => {
  // 自动检测基本状态，但不显示面板
  runDiagnostics()
})
</script>

<style scoped>
.voice-debug-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 500px;
  max-width: 90vw;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  overflow: hidden;
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  background: #1E88E5;
  color: white;
}

.debug-header h3 {
  margin: 0;
  font-size: 16px;
}

.close-btn {
  background: transparent;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.debug-content {
  padding: 20px;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 20px;
}

.status-item {
  display: flex;
  flex-direction: column;
  padding: 12px;
  border-radius: 6px;
  border-left: 4px solid;
}

.status-item.success {
  background: #d4edda;
  border-color: #28a745;
}

.status-item.error {
  background: #f8d7da;
  border-color: #dc3545;
}

.status-item .label {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.status-item .value {
  font-size: 14px;
  font-weight: 600;
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.debug-btn {
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.debug-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.debug-btn.primary {
  background: #1E88E5;
  color: white;
}

.debug-btn.primary:hover:not(:disabled) {
  background: #1565C0;
}

.test-result {
  margin-bottom: 20px;
}

.test-result h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
}

.result-content {
  padding: 10px;
  background: #f8f9fa;
  border-radius: 6px;
  font-family: monospace;
}

.error-log h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #dc3545;
}

.log-content {
  max-height: 150px;
  overflow-y: auto;
}

.error-item {
  padding: 6px 10px;
  margin: 4px 0;
  background: #f8d7da;
  border-radius: 4px;
  color: #721c24;
  font-size: 13px;
}

.debug-trigger {
  position: fixed;
  bottom: 100px;
  right: 100px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #FF9800;
  color: white;
  border: none;
  font-size: 16px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(255, 152, 0, 0.4);
  transition: all 0.3s;
  z-index: 1999;
}

.debug-trigger:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(255, 152, 0, 0.6);
}

@media (max-width: 768px) {
  .voice-debug-panel {
    width: 100%;
    height: 100%;
    max-width: none;
    border-radius: 0;
  }
  
  .status-grid {
    grid-template-columns: 1fr;
  }
}
</style>