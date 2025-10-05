import { ref, onMounted } from 'vue'

// 语音功能诊断工具
export function useVoiceDiagnostics() {
  const diagnostics = ref({
    browserSupport: false,
    httpsEnvironment: false,
    speechApi: false,
    microphonePermission: false,
    webAudioApi: false,
    userAgent: '',
    errors: [] as string[]
  })

  const isRunning = ref(false)
  const results = ref('')

  function log(message: string, type: 'info' | 'error' | 'success' = 'info') {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${type.toUpperCase()}: ${message}`
    
    console.log(logMessage)
    results.value += logMessage + '\n'
    
    if (type === 'error') {
      diagnostics.value.errors.push(message)
    }
  }

  async function runDiagnostics() {
    isRunning.value = true
    results.value = ''
    diagnostics.value.errors = []

    log('开始语音功能诊断...')

    // 1. 检查浏览器基本信息
    diagnostics.value.userAgent = navigator.userAgent
    log(`用户代理: ${navigator.userAgent}`)
    
    const browserName = getBrowserName()
    log(`浏览器: ${browserName}`)

    // 2. 检查HTTPS环境
    const isHttps = location.protocol === 'https:' || location.hostname === 'localhost'
    diagnostics.value.httpsEnvironment = isHttps
    
    if (isHttps) {
      log('✅ HTTPS环境检查通过', 'success')
    } else {
      log('❌ 需要HTTPS环境才能使用语音识别（localhost除外）', 'error')
    }

    // 3. 检查Web Speech API支持
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    diagnostics.value.speechApi = !!SpeechRecognition
    
    if (SpeechRecognition) {
      log('✅ Web Speech API 支持检查通过', 'success')
      
      // 测试语音识别初始化
      try {
        const testRecognition = new SpeechRecognition()
        testRecognition.lang = 'zh-CN'
        log('✅ 语音识别对象创建成功', 'success')
      } catch (error) {
        log(`❌ 语音识别对象创建失败: ${error}`, 'error')
      }
    } else {
      log('❌ 浏览器不支持Web Speech API', 'error')
    }

    // 4. 检查Web Audio API支持
    const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext
    diagnostics.value.webAudioApi = !!AudioContext
    
    if (AudioContext) {
      log('✅ Web Audio API 支持检查通过', 'success')
    } else {
      log('❌ 浏览器不支持Web Audio API', 'error')
    }

    // 5. 检查麦克风权限
    await checkMicrophonePermission()

    // 6. 检查TTS支持
    checkTTSSupport()

    // 7. 生成诊断报告
    generateReport()

    isRunning.value = false
  }

  async function checkMicrophonePermission() {
    log('检查麦克风权限...')
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      log('❌ 浏览器不支持媒体设备访问', 'error')
      return
    }

    try {
      // 检查权限状态（如果支持）
      if ('permissions' in navigator) {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName })
        log(`麦克风权限状态: ${permissionStatus.state}`)
      }

      // 尝试访问麦克风
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      diagnostics.value.microphonePermission = true
      log('✅ 麦克风权限获取成功', 'success')
      
      // 立即释放资源
      stream.getTracks().forEach(track => track.stop())
      
      // 检查音频输入设备
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(device => device.kind === 'audioinput')
      log(`发现 ${audioInputs.length} 个音频输入设备`)
      
      audioInputs.forEach((device, index) => {
        log(`设备 ${index + 1}: ${device.label || '未知设备'}`)
      })
      
    } catch (error: any) {
      diagnostics.value.microphonePermission = false
      
      let errorMsg = '未知错误'
      switch (error.name) {
        case 'NotAllowedError':
          errorMsg = '用户拒绝了麦克风权限'
          break
        case 'NotFoundError':
          errorMsg = '未找到麦克风设备'
          break
        case 'NotReadableError':
          errorMsg = '麦克风被其他应用占用'
          break
        case 'OverconstrainedError':
          errorMsg = '麦克风约束条件无法满足'
          break
        default:
          errorMsg = error.message || '未知错误'
      }
      
      log(`❌ 麦克风权限检查失败: ${errorMsg}`, 'error')
    }
  }

  function checkTTSSupport() {
    log('检查语音合成支持...')
    
    if ('speechSynthesis' in window) {
      log('✅ 语音合成API支持检查通过', 'success')
      
      const voices = speechSynthesis.getVoices()
      log(`发现 ${voices.length} 个语音`)
      
      const chineseVoices = voices.filter(voice => 
        voice.lang.startsWith('zh') || voice.lang.includes('Chinese')
      )
      log(`中文语音数量: ${chineseVoices.length}`)
      
      if (chineseVoices.length > 0) {
        chineseVoices.forEach((voice, index) => {
          log(`中文语音 ${index + 1}: ${voice.name} (${voice.lang})`)
        })
      }
      
    } else {
      log('❌ 浏览器不支持语音合成API', 'error')
    }
  }

  function getBrowserName(): string {
    const userAgent = navigator.userAgent
    
    if (userAgent.includes('Chrome')) return 'Chrome'
    if (userAgent.includes('Firefox')) return 'Firefox'
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari'
    if (userAgent.includes('Edge')) return 'Edge'
    if (userAgent.includes('Opera')) return 'Opera'
    
    return 'Unknown'
  }

  function generateReport() {
    log('\n=== 诊断报告 ===')
    log(`浏览器支持: ${diagnostics.value.speechApi ? '✅' : '❌'}`)
    log(`HTTPS环境: ${diagnostics.value.httpsEnvironment ? '✅' : '❌'}`)
    log(`麦克风权限: ${diagnostics.value.microphonePermission ? '✅' : '❌'}`)
    log(`Web Audio API: ${diagnostics.value.webAudioApi ? '✅' : '❌'}`)
    
    if (diagnostics.value.errors.length > 0) {
      log('\n=== 发现的问题 ===')
      diagnostics.value.errors.forEach((error, index) => {
        log(`${index + 1}. ${error}`)
      })
      
      log('\n=== 解决建议 ===')
      provideSolutions()
    } else {
      log('\n✅ 所有检查都通过了，语音功能应该可以正常使用！', 'success')
    }
  }

  function provideSolutions() {
    const errors = diagnostics.value.errors
    
    errors.forEach(error => {
      if (error.includes('不支持Web Speech API')) {
        log('💡 建议使用Chrome、Edge或Safari浏览器')
      }
      
      if (error.includes('HTTPS环境')) {
        log('💡 在生产环境中使用HTTPS，开发环境使用localhost')
      }
      
      if (error.includes('麦克风权限')) {
        log('💡 点击浏览器地址栏的麦克风图标，选择"允许"')
        log('💡 检查浏览器设置中的网站权限')
      }
      
      if (error.includes('麦克风设备')) {
        log('💡 检查麦克风硬件连接')
        log('💡 在系统设置中检查音频输入设备')
      }
    })
  }

  // 测试语音识别功能
  async function testSpeechRecognition() {
    log('\n=== 开始语音识别测试 ===')
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    
    if (!SpeechRecognition) {
      log('❌ 无法进行语音识别测试：浏览器不支持', 'error')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = true
    recognition.continuous = false

    return new Promise((resolve) => {
      recognition.onstart = () => {
        log('🎤 语音识别已启动，请说话...', 'success')
      }

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const transcript = result[0].transcript
          
          if (result.isFinal) {
            log(`✅ 识别结果: "${transcript}"`, 'success')
          } else {
            log(`🔄 临时结果: "${transcript}"`)
          }
        }
      }

      recognition.onerror = (event: any) => {
        log(`❌ 语音识别错误: ${event.error}`, 'error')
        resolve(false)
      }

      recognition.onend = () => {
        log('⏹️ 语音识别结束')
        resolve(true)
      }

      try {
        recognition.start()
      } catch (error) {
        log(`❌ 启动语音识别失败: ${error}`, 'error')
        resolve(false)
      }
    })
  }

  return {
    diagnostics,
    isRunning,
    results,
    runDiagnostics,
    testSpeechRecognition
  }
}