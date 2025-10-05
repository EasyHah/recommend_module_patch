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
    appflowChatDebug?: {
      getDebugInfo: () => any
      resetSDKState: () => void
      showFallbackChat: () => void
      initialize: () => Promise<boolean>
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
  // 并发/重复保护
  let initInFlight: Promise<boolean> | null = null
  let listenersAttached = false
  let isResetting = false
  let lastResetTime = 0
  
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

  // 从环境变量读取配置（按官方最小化要求）
  const APPFLOW_INTEGRATE_ID = import.meta.env.VITE_APPFLOW_INTEGRATE_ID || 'cit-44fd57644e264fecabe0'
  // 统一域名来源与规范化，防止末尾斜杠或协议缺失导致请求异常
  const rawRequestDomain = (import.meta.env.VITE_APPFLOW_REQUEST_DOMAIN || 'https://1677039950952251.appflow.aliyunnest.com') as string
  const normalizeUrl = (url: string) => {
    if (!url) return ''
    let u = url.trim()
    if (!/^https?:\/\//.test(u)) u = `https://${u}`
    // 去掉末尾斜杠，避免双斜杠请求
    if (u.endsWith('/')) u = u.slice(0, -1)
    return u
  }
  const APPFLOW_REQUEST_DOMAIN = normalizeUrl(rawRequestDomain)
  // 绑定源站域名：Appflow 官方要求需在控制台绑定或通过 sourceDomain 传入
  const APPFLOW_SOURCE_DOMAIN = (import.meta.env.VITE_APPFLOW_SOURCE_DOMAIN || (typeof window !== 'undefined' ? window.location.origin : '')) as string
  const APPFLOW_EMBED_IFRAME_URL = (import.meta.env.VITE_APPFLOW_EMBED_IFRAME_URL || '') as string

  const config = {
    integrateConfig: {
      integrateId: APPFLOW_INTEGRATE_ID,
      domain: {
        requestDomain: APPFLOW_REQUEST_DOMAIN,
        // 可选：如果使用 trial 或未完成白名单绑定，sourceDomain 有助于后端校验来源
        sourceDomain: APPFLOW_SOURCE_DOMAIN
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
    
    // 合并并发初始化请求
    if (initInFlight) return initInFlight
    if (isInitializing.value) return Promise.resolve(isSDKReady.value)

    isInitializing.value = true
    error.value = null
    
    initInFlight = (async () => {
      try {
      console.log('🔄 正在初始化 Appflow Chat SDK...')
      
      // 添加初始化超时保护
      const initPromise = window.APPFLOW_CHAT_SDK.init(config)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('初始化超时')), 10000)
      })
      
      // 使用 Promise.race 防止初始化卡死
      await Promise.race([initPromise, timeoutPromise])
      
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
      
      // 提供降级处理
      console.log('🔄 启用降级模式...')
      isSDKReady.value = true // 允许基本功能运行
      
      return false
      } finally {
        initInFlight = null
      }
    })()

    return initInFlight
  }
  
  // 设置事件监听器
  const setupEventListeners = () => {
    if (listenersAttached) return
    listenersAttached = true
    // 监听 SDK 错误事件
    document.addEventListener('appflowChatError', (event: AppflowEvent) => {
      console.error('🚨 Appflow Chat 错误:', event.detail)
      error.value = event.detail?.message || '未知错误'
      
      // 如果是 API 请求错误，尝试重新初始化
      if (event.detail?.type === 'api_error' && event.detail?.statusCode === 400) {
        console.log('🔄 检测到 API 错误，尝试重新初始化...')
        debouncedReset()
      }

      // 针对 ReadableStream 错误：仅去抖重置一次，避免循环
      const msg: string = event.detail?.message || ''
      if (msg.includes('ReadableStream') && msg.includes('locked')) {
        console.log('⚠️ 捕获 SDK ReadableStream 错误事件，触发去抖重置')
        debouncedReset()
      }
    })
    
    // 监听网络错误
    document.addEventListener('appflowChatNetworkError', (event: AppflowEvent) => {
      console.error('🌐 网络错误:', event.detail)
      error.value = '网络连接出现问题，请检查网络设置'
    })

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
  
  // 去抖重置：10 秒内只允许触发一次
  const debouncedReset = () => {
    const now = Date.now()
    if (isResetting) {
      console.log('⏳ 已在重置流程中，跳过本次重置')
      return
    }
    if (now - lastResetTime < 10000) {
      console.log('⏱️ 距上次重置过近，忽略本次重置')
      return
    }
    lastResetTime = now
    resetSDKState()
  }

  // 重置 SDK 状态
  const resetSDKState = () => {
    if (isResetting) {
      console.log('⏳ 正在重置中，跳过重复调用')
      return
    }
    isResetting = true
    console.log('🔄 重置 SDK 状态...')
    isSDKReady.value = false
    isChatVisible.value = false
    error.value = null
    
    // 清理可能存在的流状态
    try {
      if (window.APPFLOW_CHAT_SDK && typeof window.APPFLOW_CHAT_SDK.reset === 'function') {
        window.APPFLOW_CHAT_SDK.reset()
      }
    } catch (err) {
      console.warn('⚠️ SDK 重置失败:', err.message)
    }
    
    // 延迟重新初始化
    setTimeout(() => {
      console.log('🔄 尝试重新初始化 SDK...')
      initializeSDK()
        .catch(err => {
          console.error('❌ 重新初始化失败:', err)
        })
        .finally(() => {
          // 重置重入保护标志
          isResetting = false
        })
    }, 2000)
  }
  
  // 显示聊天窗口
  const showChat = async () => {
    if (!isSDKReady.value) {
      console.warn('⚠️ SDK 未就绪，使用降级方案')
      // 降级方案：显示一个简单的提示
      showFallbackChat()
      return false
    }
    
    try {
      console.log('🔍 检查 SDK 方法:', {
        sdk: !!window.APPFLOW_CHAT_SDK,
        show: !!window.APPFLOW_CHAT_SDK?.show,
        methods: window.APPFLOW_CHAT_SDK ? Object.keys(window.APPFLOW_CHAT_SDK) : []
      })
      
      if (window.APPFLOW_CHAT_SDK && typeof window.APPFLOW_CHAT_SDK.show === 'function') {
        await window.APPFLOW_CHAT_SDK.show()
        isChatVisible.value = true
        console.log('👁️ 聊天窗口已显示')
        return true
      } else if (window.APPFLOW_CHAT_SDK && typeof window.APPFLOW_CHAT_SDK.open === 'function') {
        // 有些 SDK 可能使用 open 方法
        await window.APPFLOW_CHAT_SDK.open()
        isChatVisible.value = true
        console.log('👁️ 聊天窗口已显示 (使用 open 方法)')
        return true
      } else {
        console.warn('⚠️ show 或 open 方法不存在，使用降级方案')
        showFallbackChat()
        return false
      }
    } catch (err) {
      console.error('❌ 显示聊天窗口失败:', err)
      
      // 如果出现 ReadableStream 或其他错误，使用降级方案
      if (err.message && (err.message.includes('ReadableStream') || err.message.includes('400'))) {
        console.log('🔄 使用降级方案...')
        showFallbackChat()
      }
      
      return false
    }
  }
  
  // 降级聊天方案
  const showFallbackChat = () => {
    console.log('📢 显示降级聊天界面')

    // 如果已有轻量提示，直接闪烁提示而不是再创建
    const existingTip = document.getElementById('appflow-fallback-tip')
    if (existingTip) {
      existingTip.classList.add('flash-tip')
      setTimeout(()=> existingTip.classList.remove('flash-tip'), 600)
      isChatVisible.value = true
      return
    }

    // 如果提供了完整的嵌入 URL，优先使用 iframe 作为降级方案
    const embedUrl = APPFLOW_EMBED_IFRAME_URL && APPFLOW_EMBED_IFRAME_URL.trim().length > 0 ? APPFLOW_EMBED_IFRAME_URL.trim() : ''
    if (embedUrl) {
      const overlayId = 'appflow-fallback-overlay'
      if (document.getElementById(overlayId)) {
        // 已存在则直接显示
        const el = document.getElementById(overlayId)!
        el.style.display = 'block'
        isChatVisible.value = true
        return
      }

      const overlay = document.createElement('div')
      overlay.id = overlayId
      overlay.style.position = 'fixed'
      overlay.style.right = '20px'
      overlay.style.bottom = '100px'
      overlay.style.width = '420px'
      overlay.style.height = '600px'
      overlay.style.background = 'white'
      overlay.style.border = '1px solid rgba(0,0,0,0.12)'
      overlay.style.borderRadius = '12px'
      overlay.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)'
      overlay.style.overflow = 'hidden'
      overlay.style.zIndex = '10000'

      const header = document.createElement('div')
      header.style.height = '40px'
      header.style.background = '#1E88E5'
      header.style.color = 'white'
      header.style.display = 'flex'
      header.style.alignItems = 'center'
      header.style.justifyContent = 'space-between'
      header.style.padding = '0 12px'
      header.style.fontSize = '14px'
      header.innerHTML = `<span>AI 聊天</span>`

      const closeBtn = document.createElement('button')
      closeBtn.textContent = '×'
      closeBtn.style.background = 'transparent'
      closeBtn.style.color = 'white'
      closeBtn.style.border = 'none'
      closeBtn.style.cursor = 'pointer'
      closeBtn.style.fontSize = '18px'
      closeBtn.onclick = () => {
        overlay.style.display = 'none'
        isChatVisible.value = false
      }
      header.appendChild(closeBtn)

      const iframe = document.createElement('iframe')
      iframe.src = embedUrl
      iframe.style.width = '100%'
      iframe.style.height = 'calc(100% - 40px)'
      iframe.style.border = '0'
      iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade')
      iframe.setAttribute('allow', 'microphone; clipboard-read; clipboard-write')

      overlay.appendChild(header)
      overlay.appendChild(iframe)
      document.body.appendChild(overlay)

      isChatVisible.value = true
      return
    }

    // 否则回退为轻量提示
  const tip = document.createElement('div')
  tip.id = 'appflow-fallback-tip'
    tip.style.position = 'fixed'
    tip.style.top = '50%'
    tip.style.left = '50%'
    tip.style.transform = 'translate(-50%, -50%)'
    tip.style.background = 'white'
    tip.style.border = '2px solid #007bff'
    tip.style.borderRadius = '8px'
    tip.style.padding = '20px'
    tip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
    tip.style.zIndex = '10000'
    tip.style.maxWidth = '400px'
    tip.style.textAlign = 'center'
    tip.innerHTML = `
      <h3 style="margin-top: 0; color: #007bff;">AI 助手暂时不可用</h3>
      <p>当前处于试用或未绑定域名状态，已启用降级模式。</p>
      <button id="appflow-fallback-close" style="background:#007bff;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">确定</button>
    `
    // 动画 class
    const styleId = 'appflow-fallback-style'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `#appflow-fallback-tip.flash-tip{animation: appflow-flash .6s;}@keyframes appflow-flash{0%{box-shadow:0 0 0 0 rgba(0,123,255,.7);}100%{box-shadow:0 0 0 12px rgba(0,123,255,0);}}`
      document.head.appendChild(style)
    }

    document.body.appendChild(tip)
    isChatVisible.value = true
    const btn = document.getElementById('appflow-fallback-close')
    const close = () => {
      try { tip.remove() } catch {}
      isChatVisible.value = false
    }
    btn?.addEventListener('click', close)
    // 允许 ESC 关闭
    const keyHandler = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { close(); window.removeEventListener('keydown', keyHandler) } }
    window.addEventListener('keydown', keyHandler)
    ;(window as any).closeAppflowFallback = close
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
      
      // 特殊处理 ReadableStream 错误
      if (err.message && err.message.includes('ReadableStream')) {
        console.warn('🔄 检测到 ReadableStream 错误，尝试重新发送...')
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 2000))
        try {
          await window.APPFLOW_CHAT_SDK.sendMessage(message)
          console.log('✅ 重试发送成功:', message)
          return true
        } catch (retryErr) {
          console.error('❌ 重试发送失败:', retryErr)
        }
      }
      
      // 如果是 400 错误，可能是来源域未绑定或 integrateId/域名不匹配
      const msg = (err && (err.message || err.toString())) || ''
      const status400 = (err && (err.status === 400 || err.statusCode === 400)) || msg.includes('400')
      if (status400) {
        console.error('🚨 400 错误：可能未绑定域名或配置不匹配。', {
          integrateId: APPFLOW_INTEGRATE_ID,
          requestDomain: APPFLOW_REQUEST_DOMAIN,
          sourceDomain: APPFLOW_SOURCE_DOMAIN
        })
        error.value = 'AI 聊天配置异常（400）。将尝试使用降级聊天…'
        // 使用降级方案保障可用
        showFallbackChat()
      }
      
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
  
  // 验证 API 配置（移除健康检查避免 CORS 问题）
  const validateConfig = async () => {
    console.log('🔍 跳过 API 健康检查（避免 CORS 问题）')
    console.log('📋 使用配置:', {
      integrateId: config.integrateConfig.integrateId,
      domain: config.integrateConfig.domain.requestDomain,
      sourceDomain: config.integrateConfig.domain.sourceDomain
    })
  }

  // 初始化流程
  const initialize = async () => {
    try {
      console.log('🚀 开始初始化 Appflow Chat 集成...')
      
      // 环境变量校验与提示
      if (!APPFLOW_INTEGRATE_ID || APPFLOW_INTEGRATE_ID.startsWith('cit-') === false) {
        console.warn('⚠️ VITE_APPFLOW_INTEGRATE_ID 看起来不正确，请在 .env 中配置。例如: VITE_APPFLOW_INTEGRATE_ID=cit-xxxxxxxxxxxxxxxxxxxx')
      }
      if (!APPFLOW_REQUEST_DOMAIN || !/^https?:\/\//.test(APPFLOW_REQUEST_DOMAIN)) {
        console.warn('⚠️ VITE_APPFLOW_REQUEST_DOMAIN 不合法，请在 .env 中配置完整的域名。例如: VITE_APPFLOW_REQUEST_DOMAIN=https://xxxx.appflow.aliyunnest.com')
      }

      // 检查兼容性
      const compatibility = checkCompatibility()
      if (!compatibility.isCompatible) {
        throw new Error('浏览器不兼容')
      }
      
      // 验证配置（不阻塞）
      validateConfig().catch(() => {})
      
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
  
  // 调试工具
  const getDebugInfo = () => {
    return {
      sdkLoaded: isSDKLoaded.value,
      sdkReady: isSDKReady.value,
      chatVisible: isChatVisible.value,
      initializing: isInitializing.value,
      error: error.value,
      queueLength: messageQueue.value.length,
      sdkMethods: window.APPFLOW_CHAT_SDK ? Object.keys(window.APPFLOW_CHAT_SDK) : [],
      config: config
    }
  }

  // 暴露到全局，方便调试
  if (typeof window !== 'undefined') {
    window.appflowChatDebug = {
      getDebugInfo,
      resetSDKState,
      showFallbackChat,
      initialize
    }
    console.log('🔧 Appflow Chat 调试工具已加载到 window.appflowChatDebug')
  }

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
    checkCompatibility,
    resetSDKState,
    showFallbackChat,
    getDebugInfo
  }
}