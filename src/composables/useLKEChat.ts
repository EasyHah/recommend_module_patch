import { ref, computed, watch } from 'vue'
import { io, Socket } from 'socket.io-client'

// LKE (Tencent Cloud) Chat minimal client side wiring
// This is a skeleton to request token and open a WS/SSE connection later.

interface LKEConfig {
  accessType: 'ws' | 'sse'
  appKey: string
  botId: string
  tokenEndpoint: string
  apiBase: string
  wsBase: string
  sseBase: string
}

export function useLKEChat() {
  const isReady = ref(false)
  const error = ref<string | null>(null)
  const messages = ref<Array<{ role: 'user' | 'assistant'; content: string; ts?: number }>>([])
  const token = ref<string>('')
  const tokenObtainedAt = ref<number>(0)
  const socketRef = ref<Socket | null>(null)
  const sessionId = ref<string>('')
  const requestIdRef = ref<string>('')
  const streaming = ref(false)
  const lastAssistantIndex = ref<number | null>(null)
  const cancelCurrent = ref(false)
  const lastUserText = ref('')
  let sseController: AbortController | null = null

  // Advanced events for UI
  const thoughtLog = ref<string[]>([])
  const tokenStat = ref<any | null>(null)
  const references = ref<any[]>([])

  // Connection status & retry
  const status = ref<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'>('idle')
  const reconnectAttempts = ref(0)

  const cfg: LKEConfig = {
    accessType: (import.meta.env.VITE_LKE_ACCESS_TYPE as 'ws' | 'sse') || 'ws',
    appKey: import.meta.env.VITE_LKE_APP_KEY || '',
    botId: import.meta.env.VITE_LKE_BOT_ID || '',
    tokenEndpoint: import.meta.env.VITE_LKE_TOKEN_ENDPOINT || '/getDemoToken',
    apiBase: import.meta.env.VITE_LKE_API_BASE || 'https://lke.cloud.tencent.com/cgi/capi',
    wsBase: import.meta.env.VITE_LKE_WS_BASE || 'wss://wss.lke.cloud.tencent.com',
    sseBase: import.meta.env.VITE_LKE_SSE_BASE || 'https://wss.lke.cloud.tencent.com'
  }

  const configOk = computed(() => !!cfg.appKey && !!cfg.botId)

  async function getToken() {
    try {
      const resp = await fetch(cfg.tokenEndpoint)
      if (!resp.ok) throw new Error(`token http ${resp.status}`)
      const data = await resp.json()
      if (!data || !data.token) throw new Error('token missing')
      token.value = data.token
      tokenObtainedAt.value = Date.now()
      return token.value
    } catch (e: any) {
      error.value = `获取 token 失败：${e.message || e}`
      throw e
    }
  }

  async function initialize() {
    try {
      if (!configOk.value) {
        throw new Error('缺少 APP_KEY 或 BOT_ID 配置')
      }
      // 会话ID：尽量复用上次
      const savedSessionId = localStorage.getItem('lke:sessionId')
      if (savedSessionId) {
        sessionId.value = savedSessionId
        loadState()
      } else {
        sessionId.value = Math.random().toString(36).slice(2) + Date.now().toString(36)
        localStorage.setItem('lke:sessionId', sessionId.value)
      }

      if (cfg.accessType === 'ws') {
        // 1) 获取 WS token
        await getToken()
        // 2) 建立 Socket.IO 连接（注意自定义 path）
        status.value = 'connecting'
        const socket = io(cfg.wsBase, {
          path: '/v1/qbot/chat/conn',
          transports: ['websocket'],
          autoConnect: true,
          reconnection: true,
          withCredentials: true,
          auth: { token: token.value },
          query: { token: token.value }
        })
        socketRef.value = socket

        socket.on('connect', () => {
          // 2.2 传递 token 鉴权
          socket.emit('auth', { token: token.value })
          isReady.value = true
          status.value = 'connected'
          reconnectAttempts.value = 0
        })

        // 3.x 事件监听
        socket.on('reply', (data: any) => {
          if (cancelCurrent.value) return
          const content = data?.payload?.content
          if (typeof content === 'string') {
            appendAssistantChunk(content)
          }
        })
        socket.on('thought', (data: any) => {
          const t = data?.payload?.content || data?.payload?.thought || data?.thought
          if (t) thoughtLog.value.push(String(t))
        })
        socket.on('token_stat', (data: any) => {
          tokenStat.value = data?.payload || data
        })
        socket.on('reference', (data: any) => {
          const refs = data?.payload?.references || data?.references || []
          if (Array.isArray(refs)) references.value = refs
        })
        socket.on('error', (err: any) => {
          // 业务层错误
          console.warn('LKE error', err)
        })
        socket.on('connect_error', (e: any) => {
          const detail = e?.message || e?.description || e?.toString?.() || 'unknown'
          console.warn('WS connect_error:', e)
          error.value = `WS 连接失败：${detail}`
          isReady.value = false
          status.value = 'error'
          scheduleReconnect()
        })
        socket.on('disconnect', (reason) => {
          console.warn('WS disconnected:', reason)
          isReady.value = false
          status.value = 'reconnecting'
          scheduleReconnect()
        })
      } else {
        // SSE 模式无需预连接，直接标记可用
        isReady.value = true
      }
      return true
    } catch (e) {
      console.error('LKE 初始化失败', e)
      status.value = 'error'
      return false
    }
  }

  async function sendMessage(text: string) {
    if (!text?.trim()) return false
    messages.value.push({ role: 'user', content: text, ts: Date.now() })
    streaming.value = true
    lastAssistantIndex.value = null
    requestIdRef.value = Math.random().toString(36).slice(2)
    cancelCurrent.value = false
    lastUserText.value = text
    // token 续期：超过 20 分钟自动刷新
    const AGE = Date.now() - tokenObtainedAt.value
    if (tokenObtainedAt.value === 0 || AGE > 20 * 60 * 1000) {
      await refreshToken()
    }
    if (!isReady.value) {
      error.value = 'LKE 尚未就绪'
      return false
    }
    if (cfg.accessType === 'ws' && socketRef.value) {
      const payload = {
        content: text,
        session_id: sessionId.value,
        request_id: requestIdRef.value,
        incremental: true,
        stream: 'enable'
      }
      socketRef.value.emit('send', { payload })
      return true
    }
    if (cfg.accessType === 'sse') {
      await sendViaSSE(text)
      return true
    }
    return true
  }

  function appendAssistantChunk(chunk: string) {
    if (lastAssistantIndex.value == null) {
      // 过滤可能的“回显用户输入”
      let c = chunk
      const user = lastUserText.value?.trim()
      if (user) {
        const ct = c.trim()
        if (ct === user) return // 完全回显，忽略
        if (ct.startsWith(user) && ct.length > user.length) {
          c = ct.slice(user.length).trimStart()
        }
      }
      messages.value.push({ role: 'assistant', content: c, ts: Date.now() })
      lastAssistantIndex.value = messages.value.length - 1
    } else {
      messages.value[lastAssistantIndex.value].content += chunk
      messages.value[lastAssistantIndex.value].ts = Date.now()
    }
  }

  async function sendViaSSE(text: string) {
    // SSE: POST 到 /v1/qbot/chat/sse，读取事件流
    const body = {
      session_id: sessionId.value,
      bot_app_key: cfg.appKey,
      visitor_biz_id: sessionId.value,
      content: text,
      incremental: true,
      stream: 'enable',
      workflow_status: 'enable',
      streaming_throttle: 10,
      visitor_labels: [],
      custom_variables: {}
    }
    sseController = new AbortController()
    const resp = await fetch(`${cfg.sseBase}/v1/qbot/chat/sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: sseController.signal
    })
    if (!resp.ok || !resp.body) {
      throw new Error(`SSE http ${resp.status}`)
    }
    const reader = resp.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    streaming.value = true
    lastAssistantIndex.value = null
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE 以 \n\n 分隔事件
      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        handleSSEChunk(chunk)
      }
    }
    if (buffer.trim().length) handleSSEChunk(buffer)
    streaming.value = false
    lastAssistantIndex.value = null
    sseController = null
  }

  function handleSSEChunk(chunk: string) {
    // 解析形如：event:reply\ndata:{json}\n
    const lines = chunk.split('\n')
    let event = ''
    let dataStr = ''
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      if (line.startsWith('data:')) dataStr += line.slice(5).trim()
    }
    if (!event || !dataStr) return
    try {
      const obj = JSON.parse(dataStr)
      if (event === 'reply') {
        const content = obj?.payload?.content
        if (typeof content === 'string') {
          // 增量合并到同一条消息
          appendAssistantChunk(content)
        }
      }
      if (event === 'thought') {
        const t = obj?.payload?.content || obj?.payload?.thought || obj?.thought
        if (t) thoughtLog.value.push(String(t))
      }
      if (event === 'token_stat') {
        tokenStat.value = obj?.payload || obj
      }
      if (event === 'reference') {
        const refs = obj?.payload?.references || obj?.references || []
        if (Array.isArray(refs)) references.value = refs
      }
      // 可扩展 thought/token_stat/reference 同步处理
    } catch {}
  }

  function scheduleReconnect() {
    if (cfg.accessType !== 'ws') return
    const maxAttempts = 5
    if (reconnectAttempts.value >= maxAttempts) return
    reconnectAttempts.value += 1
    const delay = Math.min(1000 * 2 ** (reconnectAttempts.value - 1), 10000)
    setTimeout(async () => {
      try {
        status.value = 'reconnecting'
        await getToken()
        // 关闭旧连接
        try { socketRef.value?.close() } catch {}
        socketRef.value = null
        // 重新初始化连接
        await initialize()
      } catch (e) {
        console.warn('reconnect failed', e)
      }
    }, delay)
  }

  async function refreshToken() {
    await getToken()
    if (cfg.accessType === 'ws' && socketRef.value?.connected) {
      socketRef.value.emit('auth', { token: token.value })
    }
  }

  function stop() {
    cancelCurrent.value = true
    streaming.value = false
    if (cfg.accessType === 'sse') {
      try { sseController?.abort() } catch {}
      sseController = null
    }
    if (cfg.accessType === 'ws' && socketRef.value?.connected) {
      try {
        socketRef.value.emit('stop', { session_id: sessionId.value, request_id: requestIdRef.value })
      } catch {}
    }
  }

  // 持久化（简化：messages/thoughtLog）
  function saveState() {
    if (!sessionId.value) return
    const key = `lke:session:${sessionId.value}`
    const data = {
      messages: messages.value,
      thoughtLog: thoughtLog.value
    }
    try { localStorage.setItem(key, JSON.stringify(data)) } catch {}
  }
  function loadState() {
    if (!sessionId.value) return
    const key = `lke:session:${sessionId.value}`
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      const data = JSON.parse(raw)
      if (Array.isArray(data?.messages)) messages.value = data.messages
      if (Array.isArray(data?.thoughtLog)) thoughtLog.value = data.thoughtLog
    } catch {}
  }

  // 简易持久化监听
  const save = () => { try { saveState() } catch {} }
  ;(window as any)?.addEventListener?.('beforeunload', save)
  // 在前端运行时保存（注意频率，这里简化为 setTimeout 合并）
  let saveTimer: any = null
  function scheduleSave() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 500)
  }
  // monkey 监听：在调用方更新 messages/thoughtLog 后会触发本地保存
  const _push = messages.value.push.bind(messages.value)
  messages.value.push = (...args: any[]) => {
    const r = _push(...args)
    scheduleSave()
    return r
  }
  // 深度监听 messages 的变更（包括 assistant 增量内容）
  watch(messages, () => scheduleSave(), { deep: true })
  // 在流式结束时也做一次保存
  watch(streaming, (s) => { if (!s) scheduleSave() })

  function clearMessages() {
    messages.value = []
    thoughtLog.value = []
    references.value = []
    lastAssistantIndex.value = null
    scheduleSave()
  }

  return {
    // state
    isReady: computed(() => isReady.value),
    error: computed(() => error.value),
    messages,
    thoughtLog,
    tokenStat: computed(() => tokenStat.value),
    references,
    status: computed(() => status.value),
    streaming: computed(() => streaming.value),
    lastAssistantIndex: computed(() => lastAssistantIndex.value),

    // config (for debug)
    cfg,

    // methods
    initialize,
    sendMessage,
    getToken,
    refreshToken,
    stop,
    clearMessages
  }
}
