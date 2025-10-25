<template>
  <div class="voice-assistant" v-show="visible">
    <!-- 主要语音按钮 -->
    <button 
      v-if="supported" 
      class="voice-button" 
      :class="{ listening, processing: isProcessing, locked: aiReplyLock }" 
      @click="onVoiceButtonClick"
      :disabled="aiReplyLock"
      :title="aiReplyLock ? 'AI 正在回复，暂不接收语音' : (listening ? '点击停止语音' : '点击开始语音')"
    >
      <span v-if="!listening && !isProcessing">🎤</span>
      <span v-else-if="listening">🟢</span>
      <span v-else-if="isProcessing">⚡</span>
    </button>
    <button 
      v-else 
      class="voice-button unsupported" 
      disabled
      title="当前浏览器不支持语音识别"
    >❌</button>

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
          <h5>� 唤醒助手</h5>
          <ul>
            <li>先说“{{ WAKE_PROMPT }}”唤醒后再给其它指令</li>
          </ul>
        </div>
        <div class="command-category">
          <h5>�🔍 查询控制</h5>
          <ul>
            <li>“查询”/“搜索”/“规划” - 执行查询</li>
            <li>“起点北京终点上海” 或 “从北京到上海” - 设置起终点</li>
            <li>“明天8点”/“8点半” - 设置出发时间</li>
            <li>“明天上午8点到下午2点” - 设置时间窗</li>
            <li>“小货车/面包车/中型货车/重卡” - 选择车辆类型</li>
            <li>“载重2吨”/“500公斤” - 设置载重</li>
            <li>“冷链/危化/易碎/普通” - 设置运输要求</li>
            <li>“温控2到8度” - 设置温控范围</li>
            <li>“撤销/回退” - 撤销上一步</li>
          </ul>
        </div>
        <div class="command-category">
          <h5>🧭 页面导航</h5>
          <ul>
            <li>"首页" / "主页" - Dashboard</li>
            <li>"路线规划" / "导航规划" - 路线规划</li>
            <li>"商家推荐" / "推荐" - 商家推荐</li>
            <li>"天气分析" / "天气" - 天气分析</li>
            <li>"天气测试" - 天气测试</li>
            <li>"视频识别" / "目标识别" - 视频识别</li>
            <li>"疏散" / "消防演练" - 疏散演练</li>
            <li>"古景" / "古场景" - 古景场景</li>
          </ul>
        </div>
        <div class="command-category">
          <h5>🌤️ 界面控制</h5>
          <ul>
            <li>“全屏/退出全屏” - 切换显示</li>
            <li>“天气图层” - 切换天气图层</li>
            <li>“关闭/退出” - 关闭面板</li>
            <li>“帮助/命令” - 打开本帮助</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 帮助按钮 -->
    <button class="help-button" @click="toggleCommands" title="语音命令帮助">
      ❓
    </button>

    <!-- 聊天面板开关 -->
    <button class="chat-button" @click="toggleChatPanel" title="AI 助手">
      💬
    </button>

    <!-- LKE 聊天面板（增强：增量合并、事件折叠、状态与TTS） -->
    <div class="lke-chat" :class="{ visible: showChatPanel }" @click.stop>
      <div class="lke-chat__header">
        <span>AI 助手</span>
        <small v-if="!lkeReady">（未就绪，发送或语音将自动初始化）</small>
        <div class="hdr-actions">
          <button class="clear-chat" @click="onClearChat" title="清空聊天">🗑️</button>
          <button class="close-commands" @click="showChatPanel = false" title="关闭">×</button>
        </div>
      </div>
      <div class="lke-chat__body">
        <div class="lke-status">
          <span class="badge" :class="statusClass">{{ statusText }}</span>
          <label class="tts-toggle">
            <input type="checkbox" v-model="enableTTS" /> 语音播报
          </label>
        </div>
        <div v-if="lkeError" class="error">{{ lkeError }}</div>
        <div class="lke-msg-list">
          <div v-for="(m, i) in lkeMessages" :key="i" class="lke-msg" :class="m.role">
            <span class="role">{{ m.role === 'user' ? '我' : 'AI' }}</span>
            <div class="bubble" :class="{ typing: streaming && i === lastAssistantIndex }">
              <span class="content" :style="contentStyle(m)">{{ m.content }}</span>
              <span v-if="streaming && i === lastAssistantIndex" class="cursor">▌</span>
            </div>
          </div>
        </div>
        <!-- 事件折叠区 -->
        <details class="evt" v-if="thoughtLog.length">
          <summary>思考过程 thought ({{ thoughtLog.length }})</summary>
          <pre class="evt-pre">{{ thoughtLog.join('\n') }}</pre>
        </details>
        <details class="evt" v-if="tokenStat">
          <summary>token 统计</summary>
          <pre class="evt-pre">{{ tokenStat }}</pre>
        </details>
        <details class="evt" v-if="references && references.length">
          <summary>引用 materials ({{ references.length }})</summary>
          <ul class="refs">
            <li v-for="(r, idx) in references" :key="idx">
              <span class="ref-title">{{ r.title || r.name || '引用' }}</span>
              <a v-if="r.url" :href="r.url" target="_blank">链接</a>
            </li>
          </ul>
        </details>
      </div>
      <div class="lke-chat__footer">
        <input class="lke-input" v-model="textInput" @keyup.enter="onSendText" placeholder="输入消息并回车发送" />
        <button class="lke-send" @click="onSendText">发送</button>
        <button class="lke-stop" :disabled="!streaming" @click="onStop">停止生成</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed, getCurrentInstance, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useVoiceAssistant } from '@/composables/useVoiceAssistant'
import { useLKEChat } from '@/composables/useLKEChat'
import { emitVoiceCommand } from '@/bridge/voiceBus'
import { openRecommend } from '@/bridge/recommendUI'

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
  start,
  stop,
  toggle, 
  onCommand,
  speak,
  speaking,
  ttsPending,
  stopSpeaking,
  showHelp 
} = useVoiceAssistant({ lang: 'zh-CN', interimResults: true, continuous: true })

const feedbackVisible = ref(false)
const showCommands = ref(false)
const router = useRouter()

// 计算状态可见性
const statusVisible = computed(() => listening.value || isProcessing.value || !supported.value)

// 引入 LKE Chat：用于替换原 Appflow 聊天承接
const {
  initialize: initLKE,
  isReady: lkeReady,
  error: lkeErrorRef,
  messages: lkeMessages,
  thoughtLog,
  tokenStat,
  references,
  status,
  sendMessage: sendLKE,
  streaming,
  lastAssistantIndex,
  stop: stopGenerate,
  clearMessages
} = useLKEChat()
const wakeActive = ref(false)
const WAKE_PROMPT = '小智小智'
const WAKE_WORDS = [WAKE_PROMPT]
const normalizeWakeText = (input: string) => (input || '').replace(/[，,。\s]/g, '')
const containsWakeWord = (input: string) => {
  const normalized = normalizeWakeText(input)
  return WAKE_WORDS.some(w => normalized.includes(w))
}

function contentStyle(m: { role: 'user'|'assistant' }) {
  // 统一修改字体颜色：用户深灰、AI 蓝色
  return m.role === 'assistant' ? { color: '#0B5CAD' } : { color: '#333' }
}

const lkeError = computed(() => lkeErrorRef.value || null)
const showChatPanel = ref(false)
const textInput = ref('')
const enableTTS = ref(true) // 默认开启语音播报
const aiReplyLock = ref(false) // AI 回复期间锁定语音输入
const resumeAfterAI = ref(false) // 解锁后自动恢复聆听

const statusText = computed(() => {
  switch (status.value) {
    case 'connected': return '已连接'
    case 'connecting': return '连接中'
    case 'reconnecting': return '重连中'
    case 'error': return '错误'
    default: return '空闲'
  }
})
const statusClass = computed(() => ({
  connected: status.value === 'connected',
  connecting: status.value === 'connecting',
  reconnecting: status.value === 'reconnecting',
  error: status.value === 'error'
}))

// 懒初始化：第一次交互时初始化 LKE，避免无感加载成本
const ensureLKEInitialized = async () => {
  try {
    if (!lkeReady.value) {
      if (enableTTS.value) {
        speak('正在初始化AI助手')
      }
      await initLKE()
      if (lkeReady.value && enableTTS.value) {
        speak('AI助手已就绪')
      }
    }
  } catch (e) {
    if (enableTTS.value) {
      speak('AI助手初始化失败，请检查网络连接')
    }
    console.error('LKE初始化失败:', e)
  }
}

// 定位商家推荐页的查询表单组件实例（通过全局 DOM 查询）
function getRecFormExpose(): any | null {
  const el = document.querySelector('[data-rec-form]') as any
  if (!el) return null
  let comp = (el as any).__vueParentComponent || null
  // 向上查找直到找到暴露 applyVoiceCommand 的组件（RecQueryForm）
  while (comp && !(comp.exposed && typeof comp.exposed.applyVoiceCommand === 'function')) {
    comp = comp.parent || null
  }
  return comp?.exposed || null
}

// 语音命令联动：优先填充商家推荐表单；否则再导航、最后聊天
const handleFinalVoice = async (rawText: string, parsed?: any) => {
  const text = (rawText || '').trim()
  if (!text) {
    speak('未识别到有效语音内容')
    return
  }

  // 1) 商家推荐页：直接填充，不再跳转到 route 页
  if (parsed) {
    const isRecommend = parsed.navigation?.page === 'recommend' || /推荐|商家推荐/.test(text)
    if (isRecommend) {
      try {
        openRecommend()
        emitVoiceCommand({ transcript: text, isFinal: true, parsed })
        if (enableTTS.value) speak('已填入商家推荐表单')
        showChatPanel.value = false
        return
      } catch (e) {
        console.warn('填充推荐表单失败', e)
        if (enableTTS.value) speak('未能填入推荐表单，请稍后再试')
        return
      }
    }
  }

  // 2) 其它页面导航（route 页面已废弃：忽略）
  if (parsed?.navigation?.path && parsed.navigation.page !== 'route') {
    try {
      router.push(parsed.navigation.path)
      speak(`已跳转到${parsed.navigation.page}页面`)
    } catch (e) {
      speak('页面跳转失败')
    }
    return
  }

  await ensureLKEInitialized()
  if (!lkeReady.value) {
    speak('AI助手未就绪，正在初始化')
    return
  }

  // 对话承接：发送识别文本到 LKE，并展示面板
  try {
    speak('正在处理您的问题')
    await sendLKE(text)
    showChatPanel.value = true
  } catch (error) {
    speak('处理语音指令失败，请重试')
    console.error('Voice command error:', error)
  }
}

function toggleChatPanel() {
  showChatPanel.value = !showChatPanel.value
  if (showChatPanel.value) {
    ensureLKEInitialized()
    if (enableTTS.value) {
      speak('AI助手聊天面板已打开')
    }
  } else if (enableTTS.value) {
    speak('聊天面板已关闭')
  }
}

function onVoiceButtonClick() {
  // 若 AI 正在回复（流式或播报），拒绝开始语音输入
  if (aiReplyLock.value) return
  toggle()
}

async function onSendText() {
  const t = textInput.value.trim()
  if (!t) return
  await ensureLKEInitialized()
  if (!lkeReady.value) {
    speak('AI助手未就绪，请稍后重试')
    return
  }
  
  try {
    await sendLKE(t)
    textInput.value = ''
    showChatPanel.value = true
    // 不再播报“消息已发送”，改为在 AI 回复完成后由下方 watcher 进行 TTS 播报
  } catch (error) {
    speak('发送消息失败，请重试')
    console.error('Send message error:', error)
  }
}

// 切换命令帮助面板
const toggleCommands = () => {
  showCommands.value = !showCommands.value
  if (showCommands.value) {
    speak('语音命令帮助已打开')
  }
}

onMounted(() => {
  // 恢复 TTS 设置
  const savedTTSState = localStorage.getItem('voice-assistant-tts-enabled')
  if (savedTTSState !== null) {
    enableTTS.value = savedTTSState === 'true'
  }
  
  console.log('[VoiceAssistantFloat] Component mounted, supported:', supported.value)
  
  onCommand((e) => {
    console.log('[VoiceAssistantFloat] Voice command received:', e)
    feedbackVisible.value = true
    emit('command', e)
    
    // 智能反馈延迟
    const delay = e.isFinal ? 3000 : 1500
    window.setTimeout(() => { 
      if (!listening.value) {
        feedbackVisible.value = false 
      }
    }, delay)
    
    // 接入 LKE：在最终结果时将内容发送给 AI / 或商家推荐表单
    if (e.isFinal) {
      const text = (e.transcript || '').trim()
      if (!text) return

      // 语音直接控制：聊天开关 / 播报开关 / 停止生成 / 帮助
      if (/(打开|显示)(聊天|助手)|唤醒(助手|小智)/.test(text)) {
        if (containsWakeWord(text)) {
          wakeActive.value = true
        }
        showChatPanel.value = true
        ensureLKEInitialized()
        if (enableTTS.value) speak('AI助手聊天面板已打开')
        return
      }
      if (/(关闭|隐藏)(聊天|助手)/.test(text)) {
        showChatPanel.value = false
        if (enableTTS.value) speak('聊天面板已关闭')
        // 关闭时退出唤醒状态
        wakeActive.value = false
        return
      }
      if (/(停止|打住|别说了)(生成|回复|回答)?/.test(text)) {
        onStop()
        return
      }
      if (/((打开|开启)语音播报)/.test(text)) {
        enableTTS.value = true
        speak('语音播报已开启')
        return
      }
      if (/(关闭语音播报)/.test(text)) {
        enableTTS.value = false
        // 关闭播报时不再播语音提示
        return
      }
      if (/(帮助|命令)/.test(text)) {
        showCommands.value = true
        speak('语音命令帮助已打开')
        return
      }

      // 若聊天面板已打开，也需要唤醒词后才能向 AI 发送
      if (showChatPanel.value) {
        if (!wakeActive.value) {
          return
        }
        handleFinalVoice(text, e.parsed)
        return
      }

      // 可操作口令（无需唤醒词）：
      // - 商家推荐意图或字段（位置/时间窗/载重/需求/温区）+ 推荐上下文
      // - 明确的页面导航到 recommend
      const p = e.parsed || {}
      const hasRecommendFields = !!(p.location || p.cities || p.timeWindow || p.weightKg || p.demandType || p.temperatureRange)
      const isRecommendMention = /推荐|商家推荐/.test(text) || p?.navigation?.page === 'recommend'
      // 只有明确提到推荐，或者有推荐相关字段时才无需唤醒
      if (isRecommendMention || (hasRecommendFields && isRecommendMention)) {
        handleFinalVoice(text, p)
        return
      }
      
      // 其他页面导航也无需唤醒（排除已废弃的 route）
      if (p?.navigation?.path && p.navigation.page !== 'recommend' && p.navigation.page !== 'route') {
        handleFinalVoice(text, p)
        return
      }

      // 其余自由聊天/问答再使用唤醒词
      if (!wakeActive.value) {
        if (containsWakeWord(text)) {
          wakeActive.value = true
          speak('我在，请问您需要什么帮助？')
          return
        }
        return
      }

      // 退出唤醒
      if (/退出|结束|收工/.test(text)) {
        wakeActive.value = false
        speak('好的，已退出唤醒模式')
        return
      }

      handleFinalVoice(text, e.parsed)
    }
  })
})

// 监听最后一条 assistant 回复变化，按需进行 TTS 播报
let lastSpokenContent = ''
let lastMessageCount = 0

// 监听消息变化和流式状态
watch([lkeMessages, streaming], ([messages, isStreaming]) => {
  if (!enableTTS.value) return
  
  // 当流式输出结束且有新消息时进行播报
  if (!isStreaming && messages.length > lastMessageCount) {
    const latestMessage = messages[messages.length - 1]
    if (latestMessage?.role === 'assistant' && 
        latestMessage.content && 
        latestMessage.content.trim() !== lastSpokenContent) {
      lastSpokenContent = latestMessage.content.trim()
      speak(latestMessage.content)
    }
    lastMessageCount = messages.length
  }
}, { deep: true, immediate: false })

// 锁定/解锁逻辑：当 AI 正在流式输出或 TTS 播报时，禁止语音识别
watch([streaming, speaking, ttsPending], ([isStreaming, isSpeaking, hasPending], [pS, pSp, pP]) => {
  const lock = !!(isStreaming || isSpeaking || hasPending)
  if (lock === aiReplyLock.value) return
  aiReplyLock.value = lock
  if (lock) {
    if (listening.value) {
      resumeAfterAI.value = true
      try { stop() } catch {}
    }
  } else {
    if (resumeAfterAI.value) {
      // AI 完成后自动恢复聆听
      resumeAfterAI.value = false
      try { start() } catch {}
    }
  }
})

// 持久化 TTS 设置
watch(enableTTS, (newValue) => {
  localStorage.setItem('voice-assistant-tts-enabled', String(newValue))
  if (newValue) {
    speak('语音播报已开启')
  } else {
    speak('语音播报已关闭')
  }
})

function onStop() {
  try { 
    stop()
    if (enableTTS.value) {
      speak('已停止生成')
    }
  } catch (error) {
    console.warn('Stop generation error:', error)
  }
}

function onClearChat() {
  try {
    if (confirm('确定要清空当前聊天记录吗？')) {
      clearMessages()
    }
  } catch (e) {}
}
</script>

<style scoped>
.lke-msg.assistant .content { color: #0B5CAD; }
.lke-msg.user .content { color: #333; }
.lke-msg .bubble.typing .cursor { animation: blink 1s steps(1) infinite; margin-left: 4px; color: #0B5CAD; }
@keyframes blink { 50% { opacity: 0; } }
.lke-stop { padding: 6px 12px; background: #E53935; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
.voice-assistant {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2000;
  display: flex;
 
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

.voice-button.locked,
.voice-button:disabled {
  background: linear-gradient(135deg, #90A4AE 0%, #78909C 100%);
  box-shadow: 0 6px 16px rgba(0,0,0,0.2);
  cursor: not-allowed;
  opacity: 0.85;
}

.voice-button.unsupported {
  background: linear-gradient(135deg, #9E9E9E 0%, #757575 100%);
  box-shadow: 0 6px 16px rgba(0,0,0,0.25);
  cursor: not-allowed;
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

/* LKE 聊天面板 */
.lke-chat {
  position: fixed;
  right: 20px;
  bottom: 160px;
  width: 360px;
  max-width: calc(100vw - 40px);
  background: rgba(255, 255, 255, 0.98);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  opacity: 0;
  transform: translateY(20px) scale(0.95);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  border: 1px solid rgba(0, 0, 0, 0.1);
  max-height: 420px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.lke-chat.visible {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

.lke-chat__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #1E88E5;
  color: #fff;
}
.lke-chat__header .hdr-actions { display: inline-flex; gap: 6px; align-items: center; }
.lke-chat__header .clear-chat { background: rgba(255,255,255,0.15); color: #fff; border: none; border-radius: 6px; padding: 4px 6px; cursor: pointer; }
.lke-chat__header .clear-chat:hover { background: rgba(255,255,255,0.25); }

.lke-chat__body {
  padding: 10px 12px;
  overflow: auto;
  flex: 1;
}

.lke-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  color: #fff;
}
.badge.connected { background: #4CAF50; }
.badge.connecting { background: #1E88E5; }
.badge.reconnecting { background: #FB8C00; }
.badge.error { background: #E53935; }
.tts-toggle { font-size: 12px; color: #333; }

.lke-msg-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lke-msg {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.lke-msg .role { font-size: 12px; color: #888; min-width: 24px; text-align: right; }
.lke-msg .bubble { background: #f6f8fa; border-radius: 8px; padding: 8px 10px; max-width: 260px; white-space: pre-wrap; word-break: break-word; }
.lke-msg.assistant .bubble { background: #e8f4ff; }

.lke-chat__footer {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid rgba(0,0,0,0.06);
}
/* 事件折叠 */
.evt { margin-top: 8px; }
.evt-pre { background: #f6f8fa; padding: 8px; border-radius: 6px; max-height: 160px; overflow: auto; }
.refs { margin: 6px 0 0 16px; padding: 0; }
.refs li { font-size: 12px; color: #333; margin-bottom: 4px; }
.ref-title { margin-right: 8px; }
.lke-input { flex: 1; padding: 6px 10px; border: 1px solid #ddd; border-radius: 6px; }
.lke-send { padding: 6px 12px; background: #1E88E5; color: #fff; border: none; border-radius: 6px; cursor: pointer; }

@media (max-width: 768px) {
  .lke-chat { width: calc(100vw - 40px); right: 20px; }
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
