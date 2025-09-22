<template>
  <div class="chat-integration-demo">
    <div class="status-panel">
      <h3>🤖 AI聊天助手集成状态</h3>
      
      <!-- SDK 状态 -->
      <div class="status-item">
        <span class="label">SDK状态:</span>
        <span :class="['status', { 'ready': isSDKReady, 'error': error }]">
          {{ error ? '错误' : isSDKReady ? '已就绪' : '加载中...' }}
        </span>
      </div>
      
      <!-- 聊天窗口状态 -->
      <div class="status-item">
        <span class="label">聊天窗口:</span>
        <span :class="['status', { 'visible': isChatVisible }]">
          {{ isChatVisible ? '已显示' : '已隐藏' }}
        </span>
      </div>
      
      <!-- 错误信息 -->
      <div v-if="error" class="error-message">
        <span class="error-icon">⚠️</span>
        {{ error }}
      </div>
    </div>

    <div class="control-panel">
      <h3>🎛️ 控制面板</h3>
      
      <div class="button-group">
        <button 
          @click="initialize" 
          :disabled="isInitializing"
          class="btn btn-primary"
        >
          {{ isInitializing ? '初始化中...' : '初始化聊天' }}
        </button>
        
        <button 
          @click="showChat" 
          :disabled="!isSDKReady"
          class="btn btn-secondary"
        >
          显示聊天窗口
        </button>
        
        <button 
          @click="hideChat" 
          :disabled="!isSDKReady"
          class="btn btn-secondary"
        >
          隐藏聊天窗口
        </button>
        
        <button 
          @click="toggleChat" 
          :disabled="!isSDKReady"
          class="btn btn-accent"
        >
          切换聊天窗口
        </button>
      </div>
    </div>

    <div class="message-panel">
      <h3>💬 发送消息</h3>
      
      <div class="message-input-group">
        <input 
          v-model="messageText"
          @keyup.enter="sendTextMessage"
          placeholder="输入消息..."
          class="message-input"
        />
        <button 
          @click="sendTextMessage"
          :disabled="!messageText.trim()"
          class="btn btn-primary"
        >
          发送
        </button>
      </div>
      
      <div class="voice-controls">
        <button 
          @click="() => { sendVoiceMessage(messageText.trim(), false); messageText = ''; }"
          :disabled="!messageText.trim()"
          class="btn btn-voice"
        >
          🎤 发送语音消息
        </button>
        
        <button 
          @click="() => { sendVoiceMessage(messageText.trim(), true); messageText = ''; }"
          :disabled="!messageText.trim()"
          class="btn btn-voice"
        >
          🧠 智能预处理发送
        </button>
      </div>
    </div>

    <div class="feature-panel">
      <h3>✨ 高级功能测试</h3>
      
      <div class="feature-buttons">
        <button @click="testDirectMessage" class="btn btn-feature">
          直接消息模式
        </button>
        
        <button @click="testVoiceControl" class="btn btn-feature">
          语音控制模式
        </button>
        
        <button @click="testIntelligentMode" class="btn btn-feature">
          智能预处理模式
        </button>
        
        <button @click="testMultiModal" class="btn btn-feature">
          多模态交互模式
        </button>
      </div>
    </div>

    <div class="compatibility-panel">
      <h3>🔧 兼容性检查</h3>
      
      <div class="compatibility-grid">
        <div v-for="(status, feature) in compatibility" :key="String(feature)" class="compatibility-item">
          <span class="feature-name">{{ getFeatureName(String(feature)) }}:</span>
          <span :class="['compatibility-status', { 'supported': status, 'unsupported': !status }]">
            {{ status ? '✅ 支持' : '❌ 不支持' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAppflowChat } from '../composables/useAppflowChat'

// 使用 composable
const {
  isInitializing,
  isSDKReady,
  isChatVisible,
  error,
  initialize,
  showChat,
  hideChat,
  toggleChat,
  sendMessage,
  sendVoiceMessage,
  checkCompatibility
} = useAppflowChat()

// 获取兼容性信息
const compatibility = checkCompatibility()

// 本地状态
const messageText = ref('')

// 发送文本消息
const sendTextMessage = () => {
  if (messageText.value.trim()) {
    sendMessage(messageText.value.trim())
    messageText.value = ''
  }
}

// 测试功能
const testDirectMessage = () => {
  sendMessage('这是一条直接发送的测试消息')
}

const testVoiceControl = () => {
  sendVoiceMessage('语音控制：显示聊天窗口', false)
}

const testIntelligentMode = () => {
  sendVoiceMessage('请帮我查询今天的天气情况', true)
}

const testMultiModal = () => {
  sendMessage('启动多模态交互模式')
}

// 获取功能名称
const getFeatureName = (feature: string): string => {
  const names: Record<string, string> = {
    'speech': '语音识别',
    'fetch': 'Fetch API',
    'promise': 'Promise',
    'localStorage': '本地存储',
    'addEventListener': '事件监听'
  }
  return names[feature] || feature
}
</script>

<style scoped>
.chat-integration-demo {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.status-panel,
.control-panel,
.message-panel,
.feature-panel,
.compatibility-panel {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.status-panel h3,
.control-panel h3,
.message-panel h3,
.feature-panel h3,
.compatibility-panel h3 {
  margin: 0 0 15px 0;
  color: #495057;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #e9ecef;
}

.status-item:last-child {
  border-bottom: none;
}

.label {
  font-weight: 600;
  color: #6c757d;
}

.status {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  background: #6c757d;
  color: white;
}

.status.ready {
  background: #28a745;
}

.status.visible {
  background: #007bff;
}

.status.error {
  background: #dc3545;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
  color: #721c24;
  margin-top: 15px;
}

.button-group,
.feature-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn {
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #545b62;
}

.btn-accent {
  background: #28a745;
  color: white;
}

.btn-accent:hover:not(:disabled) {
  background: #1e7e34;
}

.btn-voice {
  background: #17a2b8;
  color: white;
}

.btn-voice:hover:not(:disabled) {
  background: #117a8b;
}

.btn-feature {
  background: #6f42c1;
  color: white;
}

.btn-feature:hover:not(:disabled) {
  background: #5a32a3;
}

.message-input-group {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.message-input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 14px;
}

.message-input:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.voice-controls {
  display: flex;
  gap: 10px;
}

.compatibility-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.compatibility-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background: white;
  border-radius: 4px;
  border: 1px solid #dee2e6;
}

.feature-name {
  font-weight: 500;
  color: #495057;
}

.compatibility-status {
  font-size: 12px;
  font-weight: 600;
}

.compatibility-status.supported {
  color: #28a745;
}

.compatibility-status.unsupported {
  color: #dc3545;
}

@media (max-width: 768px) {
  .chat-integration-demo {
    padding: 15px;
  }
  
  .button-group,
  .feature-buttons,
  .voice-controls {
    flex-direction: column;
  }
  
  .btn {
    width: 100%;
  }
  
  .message-input-group {
    flex-direction: column;
  }
  
  .compatibility-grid {
    grid-template-columns: 1fr;
  }
}
</style>