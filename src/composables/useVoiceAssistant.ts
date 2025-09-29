// 语音助手组合式：封装 Web Speech API，带降级与事件回调
import { ref, onMounted, onUnmounted } from 'vue'
import { parseCommand } from '@/utils/voiceCommands'

export interface VoiceAssistantOptions {
  lang?: string
  interimResults?: boolean
  continuous?: boolean
  profanityFilter?: boolean
}

export interface VoiceCommandEvent {
  transcript: string
  isFinal: boolean
}

export interface VoiceCommand {
  pattern: RegExp
  description: string
  action: string
  priority?: number
}

export function useVoiceAssistant(options: VoiceAssistantOptions = {}) {
  const listening = ref(false)
  const supported = ref(false)
  const error = ref<string>('')
  const interim = ref<string>('')
  const finalText = ref<string>('')
  const lastCommand = ref<string>('')
  const isProcessing = ref(false)
  // 对外暴露的 TTS 状态
  const speaking = ref(false)
  const ttsPending = ref(false)

  let recognition: any = null
  let speechQueue: string[] = []
  let shouldAutoRestart = false
  let voices: SpeechSynthesisVoice[] = []
  let voicesLoaded = false
  let listenStartAt: number | null = null
  let noSpeechHintTimer: number | null = null

  const getSynth = () => (typeof window !== 'undefined' ? window.speechSynthesis : undefined)

  const refreshVoices = () => {
    const synth = getSynth()
    if (!synth) return
    try {
      const list = synth.getVoices()
      if (list && list.length > 0) {
        voices = list
        voicesLoaded = true
      } else {
        // 部分浏览器需要等待 voiceschanged
        const handler = () => {
          const v = synth.getVoices()
          if (v && v.length > 0) {
            voices = v
            voicesLoaded = true
            synth.removeEventListener?.('voiceschanged', handler as any)
          }
        }
        synth.addEventListener?.('voiceschanged', handler as any)
        // 兜底重试
        setTimeout(() => {
          const v = synth.getVoices()
          if (v && v.length > 0) {
            voices = v
            voicesLoaded = true
          }
        }, 800)
      }
    } catch {}
  }

  const pickBestVoice = (langPref: string = options.lang || 'zh-CN'): SpeechSynthesisVoice | null => {
    if (!voices || voices.length === 0) return null
    const pref = langPref.toLowerCase()
    // 优先完全匹配
    let v = voices.find(x => x.lang?.toLowerCase() === pref)
    if (v) return v
    // 其次匹配语言族（如 zh / zh-cn / zh-Hans）
    const prefRoot = pref.split('-')[0]
    v = voices.find(x => x.lang?.toLowerCase().startsWith(prefRoot))
    if (v) return v
    // 兜底：任意包含 zh 的
    v = voices.find(x => /\bzh\b/i.test(x.lang || ''))
    if (v) return v
    // 兜底：默认或第一个
    return voices.find(x => (x as any).default) || voices[0]
  }

  const chunkText = (text: string, maxLen = 180): string[] => {
    const chunks: string[] = []
    const sentences = text
      .replace(/\s+/g, ' ')
      .split(/(?<=[。！？!?\.\n])/)
      .map(s => s.trim())
      .filter(Boolean)
    let buf = ''
    for (const s of sentences) {
      if ((buf + s).length > maxLen) {
        if (buf) chunks.push(buf)
        if (s.length > maxLen) {
          // 对超长句子做强制切片
          for (let i = 0; i < s.length; i += maxLen) {
            chunks.push(s.slice(i, i + maxLen))
          }
          buf = ''
        } else {
          buf = s
        }
      } else {
        buf += s
      }
    }
    if (buf) chunks.push(buf)
    return chunks.length ? chunks : [text]
  }

  const start = () => {
    if (!recognition) return
    if (listening.value) return
    error.value = ''
    try {
      shouldAutoRestart = true
      console.log('[Voice] Starting speech recognition')

      // 预检：主动请求麦克风权限，唤醒设备，减少 no-speech 概率
      const ensureMic = async () => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return true
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          // 立即释放资源，避免占用
          stream.getTracks().forEach(t => t.stop())
          return true
        } catch (err: any) {
          const msg = err?.name === 'NotAllowedError'
            ? '麦克风权限被拒绝，请在浏览器地址栏允许使用麦克风'
            : err?.name === 'NotFoundError'
              ? '未找到麦克风设备，请检查系统音频设置'
              : '无法访问麦克风，请检查系统与浏览器权限设置'
          error.value = msg
          console.error('[Voice] ensureMic failed:', err)
          return false
        }
      }

      ensureMic().then(ok => {
        if (!ok) {
          shouldAutoRestart = false
          return
        }
        // 启动识别
        recognition.start()
        listening.value = true
        listenStartAt = Date.now()
        // 若长时间无语音，给出引导提示
        if (noSpeechHintTimer) window.clearTimeout(noSpeechHintTimer)
        noSpeechHintTimer = window.setTimeout(() => {
          if (listening.value && !finalText.value && !interim.value) {
            error.value = '未检测到语音，请靠近麦克风并提高音量，或在浏览器中切换输入设备'
          }
        }, 8000)
      })
    } catch (e) {
      console.error('[Voice] Error starting recognition:', e)
      // 某些浏览器二次 start 会抛异常
    }
  }

  const stop = () => {
    if (!recognition) return
    try { 
      shouldAutoRestart = false
      recognition.stop() 
    } catch {}
    listening.value = false
    if (noSpeechHintTimer) { window.clearTimeout(noSpeechHintTimer); noSpeechHintTimer = null }
  }

  const toggle = () => (listening.value ? stop() : start())

  const speak = (text: string, priority: boolean = false) => {
    if (!text?.trim()) return
    
    try {
      console.log(`[TTS] Adding to queue: ${text.slice(0, 50)}${text.length > 50 ? '...' : ''}`)

      // 按句切分，减少超长文本失败概率
      const parts = chunkText(text.trim())
      const toEnqueue = priority ? parts.reverse() : parts // priority: 先播后面的
      for (const p of toEnqueue) {
        if (priority) {
          speechQueue.unshift(p)
        } else {
          speechQueue.push(p)
        }
      }
      // 队列变化，标记为待播报
      ttsPending.value = speechQueue.length > 0
      
      processSpeechQueue()
    } catch (error) {
      console.error('[TTS] Error adding to speech queue:', error)
    }
  }

  const processSpeechQueue = () => {
    if (speaking.value || speechQueue.length === 0) {
      if (speechQueue.length === 0) ttsPending.value = false
      return
    }
    
    const text = speechQueue.shift()
    if (!text?.trim()) {
      // 递归处理下一个
      setTimeout(processSpeechQueue, 50)
      return
    }
    
    try {
      if (typeof window === 'undefined') {
        console.warn('[TTS] Window undefined, skipping speech')
        return
      }
      
      const synth = getSynth()
      if (!synth) {
        console.warn('[TTS] SpeechSynthesis not supported')
        return
      }
      // 确保 voices 已加载
      if (!voicesLoaded) {
        refreshVoices()
        setTimeout(processSpeechQueue, 150)
        return
      }
      
      // Chrome 偶发暂停修复
      if (synth.paused) {
        try { synth.resume() } catch {}
      }
      
      console.log(`[TTS] Speaking: ${text.slice(0, 100)}${text.length > 100 ? '...' : ''}`)
      
      const utter = new SpeechSynthesisUtterance(text)
      const preferredLang = options.lang || 'zh-CN'
      const voice = pickBestVoice(preferredLang)
      if (voice) {
        utter.voice = voice
        utter.lang = voice.lang || preferredLang
      } else {
        utter.lang = preferredLang
      }
      utter.rate = 0.9  // 略慢一点，更清晰
      utter.pitch = 1.0
      utter.volume = 0.8
      
      utter.onstart = () => { 
        speaking.value = true
        console.log('[TTS] Speech started')
      }
      
      utter.onend = () => { 
        speaking.value = false
        console.log('[TTS] Speech ended, processing next in queue')
        ttsPending.value = speechQueue.length > 0
        setTimeout(processSpeechQueue, 100)
      }
      
      utter.onerror = (event: any) => { 
        const err = event?.error || 'unknown'
        console.error('[TTS] Speech error:', event)
        speaking.value = false
        ttsPending.value = speechQueue.length > 0
        // 针对语音不可用报错，尝试切换语言/语音后继续
        if (voice) {
          // 下次尝试使用不带 voice 的默认配置
          try { (utter as any).voice = null } catch {}
        }
        setTimeout(processSpeechQueue, err === 'interrupted' ? 80 : 250)
      }
      
      synth.speak(utter)
    } catch (error) {
      console.error('[TTS] Error in processSpeechQueue:', error)
      speaking.value = false
      ttsPending.value = speechQueue.length > 0
      setTimeout(processSpeechQueue, 200)
    }
  }

  const stopSpeaking = (clearQueue: boolean = true) => {
    try {
      const synth = getSynth()
      if (synth) {
        synth.cancel()
      }
    } catch {}
    if (clearQueue) speechQueue = []
    speaking.value = false
    ttsPending.value = false
  }

  // 解析语音命令的通用方法
  // parseCommand 已抽离为独立 util

  const onCommand = (handler: (e: VoiceCommandEvent & { parsed?: any }) => void) => {
    ;(handlers.onCommand ||= []).push(handler)
    return () => {
      handlers.onCommand = handlers.onCommand?.filter(h => h !== handler)
    }
  }

  const showHelp = () => {
    const helpText = [
      '支持的语音命令：',
      '• 查询/搜索/规划 - 执行查询',
      '• 起点北京终点上海 或 从北京到上海 - 设置起终点',
      '• 明天8点 / 8点半 - 设置出发时间',
      '• 明天上午8点到下午2点 - 设置时间窗',
      '• 小货车/面包车/中型货车/重卡 - 选择车辆类型',
      '• 载重2吨 / 500公斤 - 设置载重',
      '• 冷链 / 危化 / 易碎 / 普通 - 设置运输要求',
      '• 温控2到8度 - 设置温控范围',
      '• 撤销/回退 - 撤销上一步',
      '• 首页/路线规划/商家推荐/天气分析/视频识别/疏散/古景 - 页面导航',
      '• 全屏/退出全屏 - 切换显示模式',
      '• 天气图层 - 切换天气图层',
      '• 关闭/退出 - 关闭面板',
      '• 帮助/命令 - 打开帮助面板'
    ].join('\n')
    
    speak(helpText)
  }

  const handlers: { onCommand?: Array<(e: VoiceCommandEvent & { parsed?: any }) => void> } = {}

  onMounted(() => {
    // 预加载可用语音
    refreshVoices()
    // 兼容 Chrome/Edge/部分国产浏览器
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    console.log('[Voice] Checking Speech Recognition support:', !!SR)
    if (!SR) {
      supported.value = false
      error.value = '当前浏览器不支持语音识别'
      console.error('[Voice] Speech Recognition not supported')
      return
    }
    recognition = new SR()
    recognition.lang = options.lang || 'zh-CN'
    recognition.interimResults = options.interimResults ?? true
    recognition.continuous = options.continuous ?? true
  // 与线上可用版本对齐：限制候选为 1 提升稳定性
  try { (recognition as any).maxAlternatives = 1 } catch {}
    
    console.log('[Voice] Speech Recognition initialized:', {
      lang: recognition.lang,
      interimResults: recognition.interimResults,
      continuous: recognition.continuous
    })

    recognition.onstart = () => { 
      listening.value = true 
      console.log('[Voice] Speech recognition started')
      listenStartAt = Date.now()
      // 开始语音输入时，立即结束当前 TTS 播报，避免相互干扰
      stopSpeaking(true)
    }
    recognition.onend = () => { 
      listening.value = false 
      console.log('[Voice] Speech recognition ended')
      // 如果是用户希望持续聆听，则自动重启（避免浏览器闲置或超时导致停止）
      if (shouldAutoRestart) {
        console.log('[Voice] Auto-restarting recognition')
        setTimeout(() => {
          try { recognition.start() } catch {}
        }, 300)
      }
      if (noSpeechHintTimer) { window.clearTimeout(noSpeechHintTimer); noSpeechHintTimer = null }
    }
    recognition.onerror = (e: any) => { 
      const code = e?.error
      let msg = '语音识别错误'
      console.error('[Voice] Speech recognition error:', e)
      switch (code) {
        case 'no-speech':
          {
            const waited = listenStartAt ? Math.round((Date.now() - listenStartAt) / 1000) : 0
            msg = waited >= 5
              ? '未检测到声音：请确认麦克风工作正常，靠近麦克风并提高音量，或在浏览器地址栏切换输入设备'
              : '未检测到声音，请靠近麦克风重试'
          }
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
      listening.value = false 
      // 针对可恢复错误尝试自动重启
      const recoverable = code === 'no-speech' || code === 'aborted' || code === 'network'
      if (shouldAutoRestart && recoverable) {
        console.log('[Voice] Attempting auto-restart after recoverable error')
        setTimeout(() => {
          try { recognition.start() } catch {}
        }, 500)
      } else {
        shouldAutoRestart = false
      }
    }
    recognition.onresult = (e: any) => {
      interim.value = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const text = res[0].transcript.trim()
        if (res.isFinal) {
          finalText.value = text
          lastCommand.value = text
          const parsed = parseCommand(text)
          handlers.onCommand?.forEach(h => h({ transcript: text, isFinal: true, parsed }))
          
          // 语音反馈
          if (text.length > 0) {
            isProcessing.value = true
            setTimeout(() => { isProcessing.value = false }, 1000)
          }
          error.value = ''
        } else {
          interim.value = text
          handlers.onCommand?.forEach(h => h({ transcript: text, isFinal: false }))
        }
      }
    }

    supported.value = true
  })

  onUnmounted(() => {
    try { recognition?.stop?.() } catch {}
    try { recognition?.abort?.() } catch {}
    if (noSpeechHintTimer) { window.clearTimeout(noSpeechHintTimer); noSpeechHintTimer = null }
  })

  return { 
    listening, 
    supported, 
    error, 
    interim, 
    finalText, 
    lastCommand,
    isProcessing,
    speaking,
    ttsPending,
    start, 
    stop, 
    toggle, 
    speak, 
    stopSpeaking,
    onCommand, 
    parseCommand,
    showHelp 
  }
}
