// 语音助手组合式：封装 Web Speech API，带降级与事件回调
import { ref, onMounted, onUnmounted } from 'vue'

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

  let recognition: any = null
  let speechQueue: string[] = []
  let isSpeaking = false

  const start = () => {
    if (!recognition) return
    if (listening.value) return
    error.value = ''
    try {
      recognition.start()
      listening.value = true
    } catch (e) {
      // 某些浏览器二次 start 会抛异常
    }
  }

  const stop = () => {
    if (!recognition) return
    try { recognition.stop() } catch {}
    listening.value = false
  }

  const toggle = () => (listening.value ? stop() : start())

  const speak = (text: string, priority: boolean = false) => {
    try {
      if (priority) {
        speechQueue.unshift(text)
      } else {
        speechQueue.push(text)
      }
      processSpeechQueue()
    } catch {}
  }

  const processSpeechQueue = () => {
    if (isSpeaking || speechQueue.length === 0) return
    
    const text = speechQueue.shift()
    if (!text) return
    
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = options.lang || 'zh-CN'
      utter.rate = 1.0
      utter.pitch = 1.0
      utter.volume = 0.8
      
      utter.onstart = () => { isSpeaking = true }
      utter.onend = () => { 
        isSpeaking = false
        setTimeout(processSpeechQueue, 100) // 处理队列中下一个
      }
      utter.onerror = () => { 
        isSpeaking = false
        setTimeout(processSpeechQueue, 200)
      }
      
      synth.speak(utter)
    } catch {
      isSpeaking = false
      setTimeout(processSpeechQueue, 200)
    }
  }

  // 解析语音命令的通用方法
  const parseCommand = (text: string) => {
    const normalizedText = text.replace(/，/g, ',').toLowerCase().trim()
    
    // 时间解析
    const timePatterns = [
      { pattern: /(?:明天|明日)\s*([0-9]{1,2})[点时]/, description: '明天X点' },
      { pattern: /(?:后天)\s*([0-9]{1,2})[点时]/, description: '后天X点' },
      { pattern: /([0-9]{1,2})[点时](?:([0-9]{1,2})分)?/, description: 'X点Y分' },
      { pattern: /([0-9]{1,2})月([0-9]{1,2})[日号]\s*([0-9]{1,2})[点时]/, description: 'X月Y日Z点' }
    ]
    
    // 车辆类型解析
    const vehiclePatterns = [
      { pattern: /小[货]?车|面包车|van/i, type: 'van' },
      { pattern: /中[型]?货车|卡车|truck/i, type: 'smallTruck' },
      { pattern: /大[型]?货车|重卡|大卡/i, type: 'largeTruck' }
    ]
    
    // 地点解析
    const locationPattern = /(?:起点|出发地|从)\s*([\u4e00-\u9fa5a-z\s]+)(?:[,，]\s*)?(?:终点|目的地|到)\s*([\u4e00-\u9fa5a-z\s]+)/i
    
    return {
      text: normalizedText,
      time: timePatterns.find(p => p.pattern.test(normalizedText)),
      vehicle: vehiclePatterns.find(p => p.pattern.test(normalizedText)),
      location: locationPattern.exec(normalizedText),
      isQuery: /查询|搜索|开始|执行|规划/.test(normalizedText),
      isClose: /关闭|收起|隐藏|退出/.test(normalizedText),
      isWeather: /天气|气象|预报/.test(normalizedText),
      isFullscreen: /全屏|放大|最大/.test(normalizedText),
      isLayer: /图层|天气图层|省份/.test(normalizedText)
    }
  }

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
      '• 关闭/退出 - 关闭面板',
      '• 天气分析 - 打开天气页面',
      '• 起点北京终点上海 - 设置路线',
      '• 明天8点 - 设置出发时间',
      '• 小货车/大货车 - 设置车辆类型',
      '• 全屏/退出全屏 - 切换显示模式',
      '• 天气图层 - 切换天气图层'
    ].join('\n')
    
    speak(helpText)
  }

  const handlers: { onCommand?: Array<(e: VoiceCommandEvent & { parsed?: any }) => void> } = {}

  onMounted(() => {
    // 兼容 Chrome/Edge/部分国产浏览器
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      supported.value = false
      error.value = '当前浏览器不支持语音识别'
      return
    }
    recognition = new SR()
    recognition.lang = options.lang || 'zh-CN'
    recognition.interimResults = options.interimResults ?? true
    recognition.continuous = options.continuous ?? true

    recognition.onstart = () => { listening.value = true }
    recognition.onend = () => { listening.value = false }
    recognition.onerror = (e: any) => { error.value = e?.error || '语音识别错误'; listening.value = false }
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
  })

  return { 
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
    speak, 
    onCommand, 
    parseCommand,
    showHelp 
  }
}
