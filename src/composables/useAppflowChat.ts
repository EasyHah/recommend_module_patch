import { ref, computed, onMounted, onUnmounted, watchEffect } from 'vue'

// 扩展 Window 接口以包含 Appflow SDK
declare global {
  interface Window {
    APPFLOW_CHAT_SDK?: {
      init: (config: any) => Promise<void>
      show: () => Promise<void>
      hide: () => Promise<void>
      sendMessage: (message: string) => Promise<void>
      version?: string
      [key: string]: any
    }
  }
}

// 自定义事件接口
interface AppflowEvent extends Event {
  detail?: any
}

// Appflow Chat SDK 集成 Hook
export function useAppflowChat() {
  // 状态管理
  const isSDKLoaded = ref(false)
  const isSDKReady = ref(false)
  const isChatVisible = ref(false)
  const isInitializing = ref(false)
  const error = ref(null)
  let sdkLoadingPromise: Promise<void> | null = null
  
  // SDK 配置
  // 动态加载 SDK 脚本，避免首次使用时超时
  const loadSDKScript = (): Promise<void> => {
    if (window.APPFLOW_CHAT_SDK) {
      isSDKLoaded.value = true
      return Promise.resolve()
    }
    if (sdkLoadingPromise) return sdkLoadingPromise

    sdkLoadingPromise = new Promise((resolve, reject) => {
      const existing = document.getElementById('appflow-chat-sdk') as HTMLScriptElement | null
      if (existing) {
        if (window.APPFLOW_CHAT_SDK) {
          isSDKLoaded.value = true
          resolve()
          return
        }
        existing.addEventListener('load', () => {
          isSDKLoaded.value = true
          resolve()
        })
        existing.addEventListener('error', () => reject(new Error('SDK 脚本加载失败')))
        // 兜底超时
        setTimeout(() => {
          if (!window.APPFLOW_CHAT_SDK) reject(new Error('SDK 脚本加载超时'))
        }, 15000)
        return
      }

      const script = document.createElement('script')
      script.id = 'appflow-chat-sdk'
      script.src = 'https://o.alicdn.com/appflow/chatbot/v1/AppflowChatSDK.js'
      script.async = true
      script.crossOrigin = 'anonymous'
      script.onload = () => {
        isSDKLoaded.value = true
        resolve()
      }
      script.onerror = () => reject(new Error('SDK 脚本加载失败'))
      document.head.appendChild(script)

      // 兜底超时
      setTimeout(() => {
        if (!window.APPFLOW_CHAT_SDK) reject(new Error('SDK 脚本加载超时'))
      }, 15000)
    })
    return sdkLoadingPromise
  }

  const config = {
    integrateConfig: {
      integrateId: 'cit-44fd57644e264fecabe0',
      domain: {
        requestDomain: 'https://1677039950952251.appflow.aliyunnest.com'
      }
    }
  }
  
  // 聊天消息队列
  const messageQueue = ref([])
  const isProcessingQueue = ref(false)
  
  // SDK 状态计算属性
  const sdkStatus = computed(() => {
    if (error.value) return 'error'
    if (isSDKReady.value) return 'ready'
    if (isInitializing.value) return 'initializing'
    if (isSDKLoaded.value) return 'loaded'
    return 'loading'
  })
  
  // 检查 SDK 是否已加载
  const checkSDKLoaded = () => {
    return new Promise((resolve, reject) => {
      let attempts = 0
      const maxAttempts = 20
      
      const checkInterval = setInterval(() => {
        attempts++
        
        if (window.APPFLOW_CHAT_SDK) {
          clearInterval(checkInterval)
          isSDKLoaded.value = true
          console.log('✅ Appflow Chat SDK 已加载')
          resolve(true)
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval)
          const errorMsg = 'SDK 加载超时'
          error.value = errorMsg
          console.error('❌', errorMsg)
          reject(new Error(errorMsg))
        }
      }, 500)
    })
  }
  
  // 初始化 SDK
  const initializeSDK = async () => {
    if (!isSDKLoaded.value) {
      throw new Error('SDK 未加载')
    }
    
    isInitializing.value = true
    error.value = null
    
    try {
      console.log('🔄 正在初始化 Appflow Chat SDK...')
      
      // 初始化 SDK
      await window.APPFLOW_CHAT_SDK.init(config)
      
      // 设置事件监听器
      setupEventListeners()
      
      isSDKReady.value = true
      isInitializing.value = false
      
      console.log('✅ Appflow Chat SDK 初始化成功')
      console.log('📋 配置信息:', config)
      
      return true
    } catch (err) {
      const errorMsg = `SDK 初始化失败: ${err.message}`
      error.value = errorMsg
      isInitializing.value = false
      console.error('❌', errorMsg)
      throw err
    }
  }
  
  // 设置事件监听器
  const setupEventListeners = () => {
    // 监听聊天准备就绪事件
    window.addEventListener('appflowChatReady', (event: Event) => {
      const appflowEvent = event as AppflowEvent
      console.log('🎉 AI聊天机器人已准备就绪:', appflowEvent.detail)
    })
    
    // 监听聊天消息事件
    window.addEventListener('appflowChatMessage', (event: Event) => {
      const appflowEvent = event as AppflowEvent
      console.log('💬 收到AI消息:', appflowEvent.detail)
    })
    
    // 监听聊天错误事件
    window.addEventListener('appflowChatError', (event: Event) => {
      const appflowEvent = event as AppflowEvent
      console.error('❌ AI聊天错误:', appflowEvent.detail)
      error.value = `AI聊天错误: ${appflowEvent.detail}`
    })
    
    // 监听聊天窗口状态变化
    window.addEventListener('appflowChatVisibilityChange', (event: Event) => {
      const appflowEvent = event as AppflowEvent
      isChatVisible.value = appflowEvent.detail?.visible
      console.log('👁️ 聊天窗口可见性:', appflowEvent.detail?.visible)
    })
  }
  
  // 显示聊天窗口
  const showChat = async () => {
    if (!isSDKReady.value) {
      console.warn('⚠️ SDK 未就绪，无法显示聊天窗口')
      return false
    }
    
    try {
      if (window.APPFLOW_CHAT_SDK.show) {
        await window.APPFLOW_CHAT_SDK.show()
        isChatVisible.value = true
        console.log('👁️ 聊天窗口已显示')
        return true
      } else {
        console.warn('⚠️ show 方法不存在')
        return false
      }
    } catch (err) {
      console.error('❌ 显示聊天窗口失败:', err)
      return false
    }
  }
  
  // 隐藏聊天窗口
  const hideChat = async () => {
    if (!isSDKReady.value) {
      console.warn('⚠️ SDK 未就绪，无法隐藏聊天窗口')
      return false
    }
    
    try {
      if (window.APPFLOW_CHAT_SDK.hide) {
        await window.APPFLOW_CHAT_SDK.hide()
        isChatVisible.value = false
        console.log('🙈 聊天窗口已隐藏')
        return true
      } else {
        console.warn('⚠️ hide 方法不存在')
        return false
      }
    } catch (err) {
      console.error('❌ 隐藏聊天窗口失败:', err)
      return false
    }
  }
  
  // 切换聊天窗口显示状态
  const toggleChat = async () => {
    return isChatVisible.value ? await hideChat() : await showChat()
  }
  
  // 发送消息
  const sendMessage = async (message) => {
    if (!isSDKReady.value) {
      console.warn('⚠️ SDK 未就绪，消息已加入队列')
      messageQueue.value.push(message)
      return false
    }
    
    try {
      if (window.APPFLOW_CHAT_SDK.sendMessage) {
        await window.APPFLOW_CHAT_SDK.sendMessage(message)
        console.log('💬 消息已发送:', message)
        return true
      } else {
        console.warn('⚠️ sendMessage 方法不存在')
        return false
      }
    } catch (err) {
      console.error('❌ 发送消息失败:', err)
      return false
    }
  }
  
  // 发送语音识别结果
  const sendVoiceMessage = async (voiceText, isCommand = false) => {
    if (!voiceText || !voiceText.trim()) return false
    
    // 预处理语音文本
    const processedText = isCommand ? 
      `🎤 语音命令: ${voiceText}` : 
      `🗣️ ${voiceText.trim()}`
    
    console.log('🎤 处理语音输入:', processedText)
    
    return await sendMessage(processedText)
  }
  
  // 处理排队的消息
  const processMessageQueue = async () => {
    if (!isSDKReady.value || isProcessingQueue.value || messageQueue.value.length === 0) {
      return
    }
    
    isProcessingQueue.value = true
    console.log(`📤 处理 ${messageQueue.value.length} 条排队消息`)
    
    try {
      while (messageQueue.value.length > 0) {
        const message = messageQueue.value.shift()
        await sendMessage(message)
        // 添加延迟避免过于频繁的请求
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (err) {
      console.error('❌ 处理消息队列失败:', err)
    } finally {
      isProcessingQueue.value = false
    }
  }
  
  // 获取 SDK 信息
  const getSDKInfo = () => {
    if (!window.APPFLOW_CHAT_SDK) return null
    
    return {
      version: window.APPFLOW_CHAT_SDK.version || 'unknown',
      methods: Object.getOwnPropertyNames(window.APPFLOW_CHAT_SDK)
        .filter(name => typeof window.APPFLOW_CHAT_SDK[name] === 'function'),
      config: config,
      status: sdkStatus.value
    }
  }
  
  // 重置状态
  const reset = () => {
    isSDKLoaded.value = false
    isSDKReady.value = false
    isChatVisible.value = false
    isInitializing.value = false
    error.value = null
    messageQueue.value = []
    isProcessingQueue.value = false
  }
  
  // 检测浏览器兼容性
  const checkCompatibility = () => {
    const compatibility = {
      fetch: typeof fetch !== 'undefined',
      promise: typeof Promise !== 'undefined',
      localStorage: typeof localStorage !== 'undefined',
      eventListener: typeof addEventListener !== 'undefined'
    }
    
    const isCompatible = Object.values(compatibility).every(Boolean)
    
    console.log('🔍 浏览器兼容性检查:', compatibility)
    
    return {
      ...compatibility,
      isCompatible
    }
  }
  
  // 初始化流程
  const initialize = async () => {
    try {
      console.log('🚀 开始初始化 Appflow Chat 集成...')
      
      // 检查兼容性
      const compatibility = checkCompatibility()
      if (!compatibility.isCompatible) {
        throw new Error('浏览器不兼容')
      }
      
      // 加载并等待 SDK 可用
      await loadSDKScript()
      await checkSDKLoaded()
      
      // 初始化 SDK
      await initializeSDK()
      
      // 处理排队消息
      processMessageQueue()
      
      console.log('✅ Appflow Chat 集成初始化完成')
      return true
    } catch (err) {
      console.error('❌ 初始化失败:', err)
      throw err
    }
  }
  
  // 监听 SDK 就绪状态变化，自动处理排队消息
  const unwatchSDKReady = watchEffect(() => {
    if (isSDKReady.value) {
      processMessageQueue()
    }
  })
  
  // 组件卸载时清理
  onUnmounted(() => {
    if (unwatchSDKReady) {
      unwatchSDKReady()
    }
  })
  
  return {
    // 状态
    isSDKLoaded: computed(() => isSDKLoaded.value),
    isSDKReady: computed(() => isSDKReady.value),
    isChatVisible: computed(() => isChatVisible.value),
    isInitializing: computed(() => isInitializing.value),
    error: computed(() => error.value),
    sdkStatus,
    messageQueueCount: computed(() => messageQueue.value.length),
    
    // 方法
    initialize,
    showChat,
    hideChat,
    toggleChat,
    sendMessage,
    sendVoiceMessage,
    getSDKInfo,
    reset,
    checkCompatibility
  }
}