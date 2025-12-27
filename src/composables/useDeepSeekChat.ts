import { ref, computed } from 'vue'

type Role = 'system' | 'user' | 'assistant'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  ts?: number
}

type DeepSeekConfig = {
  endpoint: string
  stream: boolean
  maxHistory: number
}

function sseParseEvents(buffer: string) {
  const events: Array<{ data: string }> = []
  let idx: number
  while ((idx = buffer.indexOf('\n\n')) !== -1) {
    const raw = buffer.slice(0, idx)
    buffer = buffer.slice(idx + 2)
    const lines = raw.split('\n')
    const dataLines = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart())
    if (dataLines.length) {
      events.push({ data: dataLines.join('\n') })
    }
  }
  return { events, rest: buffer }
}

export function useDeepSeekChat() {
  const isReady = ref(false)
  const error = ref<string | null>(null)
  const messages = ref<ChatMessage[]>([])
  const streaming = ref(false)
  const lastAssistantIndex = ref<number | null>(null)
  const cancelCurrent = ref(false)
  const status = ref<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'>('idle')

  // Keep VoiceAssistantFloat UI compatible
  const thoughtLog = ref<string[]>([])
  const tokenStat = ref<any | null>(null)
  const references = ref<any[]>([])

  const cfg: DeepSeekConfig = {
    endpoint: (import.meta.env.VITE_DEEPSEEK_ENDPOINT as string) || '/api/deepseek/chat',
    stream: true,
    maxHistory: 16
  }

  const configOk = computed(() => !!cfg.endpoint)

  let controller: AbortController | null = null

  async function initialize() {
    try {
      if (!configOk.value) throw new Error('缺少 DeepSeek endpoint 配置')
      isReady.value = true
      status.value = 'connected'
      return true
    } catch (e: any) {
      error.value = String(e?.message || e || '初始化失败')
      status.value = 'error'
      isReady.value = false
      return false
    }
  }

  function buildPayload() {
    const history = messages.value.slice(-cfg.maxHistory)
    const apiMessages: Array<{ role: Role; content: string }> = []
    for (const m of history) {
      apiMessages.push({ role: m.role, content: m.content })
    }
    return apiMessages
  }

  function appendAssistantChunk(chunk: string) {
    if (!chunk) return
    if (lastAssistantIndex.value == null) {
      messages.value.push({ role: 'assistant', content: chunk, ts: Date.now() })
      lastAssistantIndex.value = messages.value.length - 1
    } else {
      messages.value[lastAssistantIndex.value].content += chunk
      messages.value[lastAssistantIndex.value].ts = Date.now()
    }
  }

  async function sendMessage(text: string) {
    const t = String(text || '').trim()
    if (!t) return false
    error.value = null
    tokenStat.value = null
    references.value = []
    thoughtLog.value = []
    cancelCurrent.value = false
    messages.value.push({ role: 'user', content: t, ts: Date.now() })
    streaming.value = true
    lastAssistantIndex.value = null

    if (!isReady.value) {
      const ok = await initialize()
      if (!ok) return false
    }

    controller = new AbortController()
    try {
      const resp = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          stream: true,
          messages: buildPayload()
        }),
        signal: controller.signal
      })
      if (!resp.ok) {
        let detail = ''
        try {
          const txt = await resp.text()
          detail = txt || ''
          try {
            const json = JSON.parse(detail)
            detail = String(json?.message || json?.error || json?.detail || detail)
          } catch {}
        } catch {}
        const hint =
          detail.includes('ECONNREFUSED') || detail.includes('Could not connect') || detail.includes('connect ECONNREFUSED')
            ? '（后端未启动？请先运行 `npm run lke:server`，再运行 `npm run dev`）'
            : ''
        throw new Error(`HTTP ${resp.status} ${detail ? `- ${detail}` : ''}${hint}`)
      }
      if (!resp.body) throw new Error('Empty response body')

      status.value = 'connected'
      const reader = resp.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parsed = sseParseEvents(buffer)
        buffer = parsed.rest
        for (const evt of parsed.events) {
          const data = evt.data.trim()
          if (!data) continue
          if (data === '[DONE]') {
            streaming.value = false
            controller = null
            return true
          }
          try {
            const obj = JSON.parse(data)
            if (obj?.type === 'delta' && typeof obj?.content === 'string') {
              appendAssistantChunk(obj.content)
            } else if (obj?.type === 'usage') {
              tokenStat.value = obj.usage || obj
            } else if (typeof obj?.content === 'string') {
              appendAssistantChunk(obj.content)
            }
          } catch {
            // Best effort: treat as plain text delta
            appendAssistantChunk(data)
          }
        }
      }
      streaming.value = false
      controller = null
      return true
    } catch (e: any) {
      if (cancelCurrent.value) {
        streaming.value = false
        controller = null
        return false
      }
      error.value = `DeepSeek 请求失败：${e?.message || e}`
      status.value = 'error'
      streaming.value = false
      controller = null
      return false
    }
  }

  function stop() {
    cancelCurrent.value = true
    try { controller?.abort() } catch {}
    controller = null
    streaming.value = false
    lastAssistantIndex.value = null
  }

  function clearMessages() {
    messages.value = []
    thoughtLog.value = []
    tokenStat.value = null
    references.value = []
    error.value = null
    lastAssistantIndex.value = null
    streaming.value = false
  }

  return {
    cfg,
    initialize,
    isReady,
    error,
    messages,
    thoughtLog,
    tokenStat,
    references,
    status,
    sendMessage,
    streaming,
    lastAssistantIndex,
    stop,
    clearMessages
  }
}
