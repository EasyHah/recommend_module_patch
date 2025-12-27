import { ref, computed } from 'vue'

type Role = 'system' | 'user' | 'assistant'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  ts?: number
}

type VendorRow = {
  id?: string
  name?: string
  centerName?: string
  sequence?: string
  logisticsName?: string
  route?: string
  phone?: string
  serviceRadiusKm?: number
  capabilities?: {
    types?: string[]
    maxWeightKg?: number
    cold?: { min: number; max: number } | null
    certifications?: string[]
  }
  metrics?: {
    rating?: number
    onTimeRate?: number
    priceIndex?: number
    capacityUtilization?: number
  }
  tags?: string[]
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

  const BASE_SYSTEM_PROMPT =
    '你是园区厂家/供应商查询助手。请优先使用我提供的“厂家数据库”字段回答（如名称、线路、电话、能力、评分等），不要编造；若数据库无匹配，请明确说明并给出需要用户补充的关键信息（如公司全名/关键词/线路/中心）。'

  let vendorDbLoaded = false
  let vendorDbLoadError: string | null = null
  let vendorDbPromise: Promise<void> | null = null
  let vendorDb: VendorRow[] = []

  async function ensureVendorDbLoaded() {
    if (vendorDbLoaded || vendorDbLoadError) return
    if (vendorDbPromise) return vendorDbPromise
    vendorDbPromise = (async () => {
      const sources = ['/data/vendors-with-warehouse.json', '/data/vendors.json']
      for (const url of sources) {
        try {
          const resp = await fetch(url, { cache: 'force-cache' })
          if (!resp.ok) continue
          const json = await resp.json()
          if (Array.isArray(json)) {
            vendorDb = json
            vendorDbLoaded = true
            vendorDbLoadError = null
            return
          }
        } catch (e: any) {
          vendorDbLoadError = String(e?.message || e || '加载厂家数据库失败')
        }
      }
      if (!vendorDbLoaded) {
        vendorDbLoadError = vendorDbLoadError || '厂家数据库不存在或格式不正确'
      }
    })().finally(() => {
      vendorDbPromise = null
    })
    return vendorDbPromise
  }

  function parseDemand(text: string) {
    const t = text || ''
    const demand: { type?: 'normal' | 'cold' | 'hazmat' | 'fragile'; minWeightKg?: number } = {}
    if (/冷链|温控|冷藏/.test(t)) demand.type = 'cold'
    else if (/危化|危险品/.test(t)) demand.type = 'hazmat'
    else if (/易碎/.test(t)) demand.type = 'fragile'
    else if (/普通/.test(t)) demand.type = 'normal'

    const m = /载重\s*([\d.]+)\s*(吨|t|公斤|千克|kg)/i.exec(t)
    if (m) {
      const value = Number(m[1])
      if (isFinite(value)) {
        const unit = m[2].toLowerCase()
        demand.minWeightKg = unit === '吨' || unit === 't' ? value * 1000 : value
      }
    }
    return demand
  }

  function extractTokens(text: string) {
    const raw = String(text || '')
    const tokens = raw.match(/[\u4e00-\u9fa5]{2,}|[A-Za-z0-9]{2,}/g) || []
    return Array.from(new Set(tokens)).slice(0, 12)
  }

  function scoreVendor(v: VendorRow, tokens: string[]) {
    const hay =
      `${v.name || ''} ${v.logisticsName || ''} ${v.route || ''} ${v.centerName || ''} ${(v.tags || []).join(' ')}`
        .toLowerCase()
    let score = 0
    for (const tk of tokens) {
      const needle = tk.toLowerCase()
      if (needle && hay.includes(needle)) score += 2
    }
    return score
  }

  function getTopVendorsByQuery(query: string) {
    if (!vendorDbLoaded) return []

    const demand = parseDemand(query)
    const tokens = extractTokens(query)
    const wantsVendor = /厂家|厂商|供应商|物流|公司|电话|联系方式|推荐|商家|线路/.test(query) || tokens.length > 0

    if (!wantsVendor) return []

    let rows = vendorDb
    if (demand.type) {
      rows = rows.filter((v) => Array.isArray(v.capabilities?.types) && v.capabilities!.types!.includes(demand.type!))
    }
    if (typeof demand.minWeightKg === 'number') {
      rows = rows.filter((v) => {
        const max = v.capabilities?.maxWeightKg
        return typeof max === 'number' && max >= demand.minWeightKg!
      })
    }

    const scored = rows
      .map((v) => ({ v, score: scoreVendor(v, tokens) }))
      .filter((x) => x.score > 0 || demand.type || demand.minWeightKg)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.v)

    return scored
  }

  async function buildSystemPrompt(userText: string) {
    const parts: string[] = [BASE_SYSTEM_PROMPT]
    await ensureVendorDbLoaded()
    const top = getTopVendorsByQuery(userText)
    if (top.length) {
      const lines = top.map((v, idx) => {
        const types = (v.capabilities?.types || []).join('|')
        const maxW = v.capabilities?.maxWeightKg ? `${v.capabilities.maxWeightKg}kg` : ''
        return `${idx + 1}. 名称:${v.name || ''} 物流:${v.logisticsName || ''} 中心:${v.centerName || ''} 线路:${v.route || ''} 电话:${v.phone || ''} 能力:${types} ${maxW} 标签:${(v.tags || []).slice(0, 6).join('|')}`
      })
      parts.push(`厂家数据库（按相关度Top ${top.length}）：\n${lines.join('\n')}`)
    } else if (vendorDbLoadError) {
      parts.push(`注意：厂家数据库加载失败：${vendorDbLoadError}`)
    }
    return parts.join('\n\n')
  }

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

  function buildPayload(systemPrompt?: string) {
    const history = messages.value.slice(-cfg.maxHistory)
    const apiMessages: Array<{ role: Role; content: string }> = []
    if (systemPrompt) apiMessages.push({ role: 'system', content: systemPrompt })
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
      const systemPrompt = await buildSystemPrompt(t)
      const resp = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          stream: true,
          messages: buildPayload(systemPrompt)
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
