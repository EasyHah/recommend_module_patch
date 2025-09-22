<template>
  <div class="voice-assistant" v-show="visible">
    <!-- 主要语音按钮 -->
    <button class="voice-button" :class="{ listening, processing: isProcessing }" @click="toggle">
      <span v-if="!listening && !isProcessing">🎤</span>
      <span v-else-if="listening">🟢</span>
      <span v-else-if="isProcessing">⚡</span>
    </button>

    <!-- 语音反馈面板 -->
    <div class="voice-feedback" :class="{ visible: feedbackVisible }">
      <div v-if="interim" class="interim">正在识别: {{ interim }}</div>
      <div v-if="finalText" class="final">识别结果: {{ finalText }}</div>
      <div v-if="lastCommand && lastCommand !== finalText" class="last-command">
        上次命令: {{ lastCommand }}
      </div>
      <div v-if="error" class="error">{{ error }}</div>
      <div v-if="isProcessing" class="processing">正在处理命令...</div>
    </div>

    <!-- 语音状态指示器 -->
    <div class="voice-status" :class="{ visible: statusVisible }">
      <span v-if="listening">🎤 正在聆听...</span>
      <span v-else-if="isProcessing">⚡ 处理中...</span>
      <span v-else-if="!supported">❌ 不支持语音识别</span>
    </div>

    <!-- 命令提示面板 -->
    <div class="voice-commands" :class="{ visible: showCommands }" @click.stop>
      <div class="commands-header">
        <h4>📢 语音命令帮助</h4>
        <button class="close-commands" @click="showCommands = false">×</button>
      </div>
      <div class="commands-content">
        <div class="command-category">
          <h5>🔍 查询控制</h5>
          <ul>
            <li>"查询" / "搜索" / "规划" - 执行查询</li>
            <li>"起点北京终点上海" - 设置起终点</li>
            <li>"明天8点出发" - 设置出发时间</li>
            <li>"小货车" / "大货车" - 选择车辆类型</li>
          </ul>
        </div>
        <div class="command-category">
          <h5>🌤️ 界面控制</h5>
          <ul>
            <li>"天气分析" - 打开天气页面</li>
            <li>"全屏" / "退出全屏" - 切换显示</li>
            <li>"天气图层" - 切换天气图层</li>
            <li>"关闭" / "退出" - 关闭面板</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 帮助按钮 -->
    <button class="help-button" @click="toggleCommands" title="语音命令帮助">
      ❓
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useVoiceAssistant } from '@/composables/useVoiceAssistant'
import { useAppflowChat } from '@/composables/useAppflowChat'

const props = defineProps<{ visible?: boolean }>()
const emit = defineEmits<{
  (e: 'command', payload: { transcript: string; isFinal: boolean; parsed?: any }): void
}>()

const { 
  listening, 
  supported, 
  error, 
  interim, 
  finalText, 
  lastCommand,
  isProcessing,
  toggle, 
  onCommand,
  speak,
  showHelp 
} = useVoiceAssistant({ lang: 'zh-CN', interimResults: true, continuous: true })

const feedbackVisible = ref(false)
const showCommands = ref(false)

// 计算状态可见性
const statusVisible = computed(() => listening.value || isProcessing.value || !supported.value)

// 引入 Appflow Chat：在原位置平滑替换语音模块的对话承接方
const {
  isInitializing,
  isSDKReady,
  isChatVisible,
  error: chatError,
  initialize,
  showChat,
  hideChat,
  toggleChat,
  sendMessage
} = useAppflowChat()

// 懒初始化：第一次交互时初始化 SDK，避免无感加载成本
const ensureChatInitialized = async () => {
  try {
    if (!isSDKReady.value && !isInitializing.value) {
      await initialize()
    }
  } catch (e) {
    // 已在 composable 内处理错误，这里静默
  }
}

// 语音命令联动 Appflow 聊天
const handleFinalVoice = async (text: string, parsed?: any) => {
  await ensureChatInitialized()
  if (!text || !isSDKReady.value) return

  // 基础控制：显示/隐藏聊天
  if (parsed?.isClose) {
    hideChat()
    speak('已关闭聊天窗口')
    return
  }

  // 对话承接：发送识别文本
  sendMessage(text)
  showChat()
}

// 切换命令帮助面板
const toggleCommands = () => {
  showCommands.value = !showCommands.value
  if (showCommands.value) {
    speak('语音命令帮助已打开')
  }
}

onMounted(() => {
  onCommand((e) => {
    feedbackVisible.value = true
    emit('command', e)
    
    // 智能反馈延迟
    const delay = e.isFinal ? 3000 : 1500
    window.setTimeout(() => { 
      if (!listening.value) {
        feedbackVisible.value = false 
      }
    }, delay)
    
    // 接入 Appflow Chat：在最终结果时将内容发送给 AI 聊天
    if (e.isFinal) {
      handleFinalVoice(e.transcript, e.parsed)
    }
  })
})
</script>

<style scoped>
.voice-assistant {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.voice-button {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1E88E5 0%, #1565C0 100%);
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  box-shadow: 0 6px 16px rgba(30, 136, 229, 0.4);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.voice-button:hover {
  transform: translateY(-3px) scale(1.05);
  box-shadow: 0 8px 20px rgba(30, 136, 229, 0.5);
}

.voice-button.listening {
  background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%);
  box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
  animation: pulse 2s infinite;
}

.voice-button.processing {
  background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%);
  box-shadow: 0 6px 20px rgba(255, 152, 0, 0.4);
  animation: spin 1s linear infinite;
}

.help-button {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: #1E88E5;
  border: 1px solid rgba(30, 136, 229, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.help-button:hover {
  background: #1E88E5;
  color: white;
  transform: scale(1.1);
}

/* 可选：若后续添加聊天开关按钮，可复用 help-button 的样式 */
.chat-button {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: #1E88E5;
  border: 1px solid rgba(30, 136, 229, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.chat-button:hover {
  background: #1E88E5;
  color: white;
  transform: scale(1.1);
}

.voice-feedback {
  position: fixed;
  right: 20px;
  bottom: 100px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 12px 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  max-width: 320px;
  opacity: 0;
  transform: translateY(10px);
  transition: all 0.3s ease;
  pointer-events: none;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.voice-feedback.visible {
  opacity: 1;
  transform: translateY(0);
}

.interim {
  color: #666;
  font-size: 12px;
  font-style: italic;
}

.final {
  color: #111;
  font-size: 13px;
  font-weight: 600;
  margin-top: 4px;
}

.last-command {
  color: #888;
  font-size: 11px;
  margin-top: 4px;
  border-top: 1px solid #eee;
  padding-top: 4px;
}

.processing {
  color: #FF9800;
  font-size: 12px;
  font-weight: 500;
  margin-top: 4px;
}

.error {
  color: #EF5350;
  font-size: 12px;
  font-weight: 500;
}

.voice-status {
  position: fixed;
  right: 20px;
  bottom: 160px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  backdrop-filter: blur(10px);
}

.voice-status.visible {
  opacity: 1;
}

.voice-commands {
  position: fixed;
  right: 20px;
  bottom: 100px;
  width: 350px;
  max-width: calc(100vw - 40px);
  background: rgba(255, 255, 255, 0.98);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  opacity: 0;
  transform: translateY(20px) scale(0.95);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  backdrop-filter: blur(15px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  max-height: 400px;
  overflow-y: auto;
}

.voice-commands.visible {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

.commands-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1E88E5;
  color: white;
  border-radius: 12px 12px 0 0;
}

.commands-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.close-commands {
  background: transparent;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.close-commands:hover {
  background: rgba(255, 255, 255, 0.2);
}

.commands-content {
  padding: 16px;
}

.command-category {
  margin-bottom: 16px;
}

.command-category:last-child {
  margin-bottom: 0;
}

.command-category h5 {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 6px;
}

.command-category ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.command-category li {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
  padding: 4px 8px;
  background: rgba(30, 136, 229, 0.05);
  border-radius: 4px;
  border-left: 3px solid #1E88E5;
}

@keyframes pulse {
  0% { transform: scale(1); }
  70% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 移动端适配 */
@media (max-width: 768px) {
  .voice-commands {
    width: calc(100vw - 40px);
    right: 20px;
  }
  
  .voice-feedback {
    max-width: calc(100vw - 40px);
  }
}
</style>
