<template>
  <div class='screen'>
    <TopBar />
    <div class='body' :class='{ full: ui.fullscreen }' :style="{'--left-w': ui.drawer.leftWidth + 'px', '--right-w': ui.drawer.rightWidth + 'px'}">
      <!-- 视频播放区域 -->
      <div class='video-container'>
  <div class='video-wrapper' ref="videoWrapperRef">
          <video ref="videoRef" class='video-player' controls autoplay muted crossorigin="anonymous" playsinline>
            <source src="" type="video/mp4">
            您的浏览器不支持视频播放。
          </video>
          <!-- 识别框叠加层 -->
          <div class='recognition-overlay'>
            <div 
              v-for="detection in detections" 
              :key="detection.id"
              class='detection-box'
              :style="getBoxStyle(detection)"
            >
              <div class='detection-label'>
                {{ detection.label }} ({{ detection.confidence }}%)
              </div>
            </div>
          </div>
        </div>
        
        <!-- 视频控制面板 -->
        <div class='video-controls'>
          <select @change="loadTestVideo" v-model="selectedVideoId" class='video-selector'>
            <option value="">🎬 选择测试视频...</option>
            <option v-for="video in testVideos" :key="video.id" :value="video.id">
              {{ video.name }} - {{ video.description }}
            </option>
          </select>
          <button @click="selectVideoFile" class='control-btn'>
            <span>📁</span> 选择本地视频
          </button>
          <button 
            @click="toggleRecognition" 
            class='control-btn' 
            :class="{ 
              active: isRecognizing,
              loading: recognitionState === 'initializing' || recognitionState === 'warming_up'
            }"
            :disabled="recognitionState === 'initializing' || recognitionState === 'warming_up'"
          >
            <span v-if="recognitionState === 'initializing'">⏳</span>
            <span v-else-if="recognitionState === 'warming_up'">🔥</span>
            <span v-else>{{ isRecognizing ? '⏸️' : '▶️' }}</span>
            {{ getRecognitionButtonText() }}
          </button>
          <button @click="captureFrame" class='control-btn' :disabled="!videoRef">
            <span>📷</span> 截取帧
          </button>
          
          <!-- 状态指示器 -->
          <div class='status-indicator'>
            <div class='status-item'>
              <span class='status-label'>状态:</span>
              <span class='status-value' :class='`status-${recognitionState}`'>
                {{ getStatusText() }}
              </span>
            </div>
            <div class='status-item'>
              <span class='status-label'>模式:</span>
              <span class='status-value' :class='getModeClass()'>
                {{ getModeText() }}
              </span>
            </div>
            <div v-if="recognitionStats.fps > 0" class='status-item'>
              <span class='status-label'>FPS:</span>
              <span class='status-value'>{{ recognitionStats.fps }}</span>
            </div>
            <div v-if="recognitionStats.inferenceTime > 0" class='status-item'>
              <span class='status-label'>延迟:</span>
              <span class='status-value'>{{ recognitionStats.inferenceTime }}ms</span>
            </div>
          </div>
          
          <!-- 错误信息 -->
          <div v-if="errorMessage" class='error-message'>
            <span>⚠️</span> {{ errorMessage }}
            <button @click="errorMessage = ''" class='close-error'>×</button>
          </div>
        </div>
      </div>

      <!-- 左侧信息栏 -->
      <div class='drawer left' :class='{ open: ui.drawer.leftOpen || ui.drawer.leftPinned, pinned: ui.drawer.leftPinned }' 
           @mouseenter="ui.hover('left', true)" @mouseleave="ui.hover('left', false)">
        <div class='drawer-inner fluent-acrylic-strong'>
          <header class='drawer-header'>
            <h3>识别统计</h3>
            <button class='pin' @click="ui.togglePin('left')">
              {{ ui.drawer.leftPinned ? '取消固定' : '固定' }}
            </button>
          </header>
          <VideoRecognitionLeft class='panel' :detections="detections" :stats="recognitionStats" />
        </div>
        <button class='handle' @click="ui.toggleOpen('left')" @dblclick="ui.togglePin('left')" 
                aria-label='toggle left drawer'></button>
      </div>

      <!-- 右侧信息栏 -->
      <div class='drawer right' :class='{ open: ui.drawer.rightOpen || ui.drawer.rightPinned, pinned: ui.drawer.rightPinned }' 
           @mouseenter="ui.hover('right', true)" @mouseleave="ui.hover('right', false)">
        <div class='drawer-inner fluent-acrylic-strong'>
          <header class='drawer-header'>
            <h3>实时分析</h3>
            <button class='pin' @click="ui.togglePin('right')">
              {{ ui.drawer.rightPinned ? '取消固定' : '固定' }}
            </button>
          </header>
          <div class='panel'>
            <div class='fluent-card' style='padding:10px; border:1px solid rgba(255,255,255,.15); border-radius:10px; margin-bottom:8px;'>
              <h4 style='margin:6px 0 10px 0;'>跟踪设置</h4>
              <TrackingSettings />
            </div>
          </div>
          <VideoRecognitionRight class='panel' :detections="detections" :confidenceData="confidenceData" />
        </div>
        <button class='handle' @click="ui.toggleOpen('right')" @dblclick="ui.togglePin('right')" 
                aria-label='toggle right drawer'></button>
      </div>
    </div>
  </div>
</template>

<script setup lang='ts'>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import TopBar from '@/components/TopBar.vue'
import VideoRecognitionLeft from '@/components/VideoRecognitionLeft.vue'
import VideoRecognitionRight from '@/components/VideoRecognitionRight.vue'
import TrackingSettings from '@/components/TrackingSettings.vue'
import { useUIStore } from '@/stores/ui'
import { getRecognitionService, RecognitionState, type DetectionResult, type InferenceStats } from '@/services/recognition'
import { TestVideoManager } from '@/utils/testVideo'

const ui = useUIStore()
const route = useRoute()
const videoRef = ref<HTMLVideoElement>()
const videoWrapperRef = ref<HTMLDivElement>()
const isRecognizing = ref(false)
const recognitionService = getRecognitionService()
const recognitionState = ref<RecognitionState>(RecognitionState.UNINITIALIZED)
const errorMessage = ref<string>('')

// 测试视频数据
const testVideos = ref(TestVideoManager.getTestVideos())
const selectedVideoId = ref<string>('')
const DEFAULT_FIXED_VIDEO_SRC = '/Assets/data/b055d0c1228c117ae9f52286c92d706f.mp4'

// 检测结果数据
const detections = ref<DetectionResult[]>([])

// 识别统计数据
const recognitionStats = reactive({
  totalDetections: 0,
  peopleCount: 0,
  vehicleCount: 0,
  objectCount: 0,
  averageConfidence: 0,
  inferenceTime: 0,
  fps: 0,
  entered: 0,
  exited: 0,
})

// 置信度数据 (保持最近30个数据点)
const confidenceData = ref<Array<{ time: string, confidence: number }>>([])
const maxConfidencePoints = 30

// 推理循环
let inferenceLoop: number | null = null
let cancelVideoFrame: (()=>void) | null = null

// 加载测试视频
const loadTestVideo = async () => {
  if (!selectedVideoId.value || !videoRef.value) return
  
  try {
    // 切换源前优先停止上一源（特别是摄像头）
    TestVideoManager.stopVideo(videoRef.value)
    await TestVideoManager.loadTestVideo(videoRef.value, selectedVideoId.value)
    console.log(`已加载测试视频: ${selectedVideoId.value}`)
  } catch (error) {
    console.error('加载测试视频失败:', error)
    errorMessage.value = error instanceof Error ? error.message : '加载视频失败'
  }
}

function waitVideoCanPlay(video: HTMLVideoElement) {
  if (video.readyState >= 2) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      resolve()
    }, 8000)

    const onCanPlay = () => {
      cleanup()
      resolve()
    }

    const onError = () => {
      cleanup()
      reject(new Error('视频加载失败'))
    }

    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('error', onError)
    }

    video.addEventListener('canplay', onCanPlay, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

const loadFixedVideo = async () => {
  if (!videoRef.value) return
  TestVideoManager.stopVideo(videoRef.value)

  const currentSrc = videoRef.value.currentSrc || videoRef.value.src || ''
  if (!currentSrc.endsWith(DEFAULT_FIXED_VIDEO_SRC)) {
    videoRef.value.src = DEFAULT_FIXED_VIDEO_SRC
    videoRef.value.load()
  }

  await waitVideoCanPlay(videoRef.value)

  try {
    await videoRef.value.play()
  } catch {
    // 某些浏览器策略下可能被阻止；忽略，识别仍可执行
  }
}

const selectVideoFile = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'video/*'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file && videoRef.value) {
      // 如果之前是摄像头，先停止
      TestVideoManager.stopVideo(videoRef.value)
      const url = URL.createObjectURL(file)
      videoRef.value.src = url
      videoRef.value.load()
    }
  }
  input.click()
}

const toggleRecognition = async () => {
  if (isRecognizing.value) {
    stopRecognition()
  } else {
    await ensureRecognitionInitialized()
    startRecognition()
  }
}

let initPromise: Promise<void> | null = null

function syncRecognitionState() {
  try {
    recognitionState.value = recognitionService.getState()
  } catch {}
}

function waitForRecognitionReady(timeoutMs = 12000) {
  const current = recognitionService.getState()
  if (current === RecognitionState.READY || current === RecognitionState.RUNNING) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    const off = recognitionService.onStateChange((s) => {
      recognitionState.value = s
      if (s === RecognitionState.READY || s === RecognitionState.RUNNING) {
        cleanup()
        resolve()
      }
      if (s === RecognitionState.ERROR) {
        cleanup()
        reject(new Error('识别服务初始化失败'))
      }
    })

    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('识别服务初始化超时'))
    }, timeoutMs)

    const cleanup = () => {
      window.clearTimeout(timer)
      try { off?.() } catch {}
    }
  })
}

const ensureRecognitionInitialized = async () => {
  syncRecognitionState()
  const current = recognitionService.getState()

  if (current === RecognitionState.READY || current === RecognitionState.RUNNING) return
  if (current === RecognitionState.INITIALIZING || current === RecognitionState.WARMING_UP) {
    await waitForRecognitionReady()
    return
  }

  if (initPromise) {
    await initPromise
    return
  }

  initPromise = (async () => {
    try {
      errorMessage.value = ''
      const s = recognitionService.getState()
      if (s === RecognitionState.UNINITIALIZED) {
        await recognitionService.initialize()
      }
      // warmup 只允许 READY 状态
      if (recognitionService.getState() === RecognitionState.READY) {
        await recognitionService.warmup()
      }
      await waitForRecognitionReady()
    } catch (error) {
      errorMessage.value = `初始化失败: ${error instanceof Error ? error.message : String(error)}`
      console.error('Recognition initialization failed:', error)
      throw error
    } finally {
      initPromise = null
      syncRecognitionState()
    }
  })()

  await initPromise
}

const startRecognition = () => {
  syncRecognitionState()
  if (recognitionState.value !== RecognitionState.READY) {
    errorMessage.value = '推理服务未就绪'
    return
  }
  
  if (!videoRef.value) {
    errorMessage.value = '请先选择视频文件'
    return
  }
  
  isRecognizing.value = true
  
  const useRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype

  if (useRVFC && videoRef.value?.requestVideoFrameCallback) {
    const loop = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (!isRecognizing.value || !videoRef.value) return
      // 某些实现会将 metadata.mediaTime 提供为秒，传递给服务更稳
      ;(recognitionService as any)._rvfcTs = (metadata && typeof metadata.mediaTime === 'number') ? metadata.mediaTime * 1000 : undefined
      recognitionService.inferFrame(videoRef.value)
      videoRef.value.requestVideoFrameCallback(loop)
    }
    videoRef.value.requestVideoFrameCallback(loop)
    cancelVideoFrame = () => {
      // 无直接 cancel API；通过状态位退出
      cancelVideoFrame = null
    }
  } else {
    const runInference = () => {
      if (!isRecognizing.value || !videoRef.value) return
      recognitionService.inferFrame(videoRef.value)
      inferenceLoop = requestAnimationFrame(runInference)
    }
    runInference()
  }
}

const stopRecognition = () => {
  isRecognizing.value = false
  recognitionService.stop()
  
  if (inferenceLoop) {
    cancelAnimationFrame(inferenceLoop)
    inferenceLoop = null
  }
  if (cancelVideoFrame) {
    cancelVideoFrame()
    cancelVideoFrame = null
  }
}

const updateStats = (stats?: InferenceStats) => {
  recognitionStats.totalDetections = detections.value.length
  recognitionStats.peopleCount = detections.value.filter(d => d.label === '人员').length
  recognitionStats.vehicleCount = detections.value.filter(d => 
    d.label === '汽车' || d.label === '卡车' || d.label === '公交车' || d.label === '摩托车'
  ).length
  recognitionStats.objectCount = detections.value.length - recognitionStats.peopleCount - recognitionStats.vehicleCount
  
  if (detections.value.length > 0) {
    recognitionStats.averageConfidence = Math.round(
      detections.value.reduce((sum, d) => sum + d.confidence, 0) / detections.value.length
    )
  } else {
    recognitionStats.averageConfidence = 0
  }
  
  if (stats) {
    recognitionStats.inferenceTime = stats.timeMs
    recognitionStats.fps = stats.fps
    
    // 更新置信度趋势数据
    const now = new Date()
    const timeStr = now.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    })
    
    confidenceData.value.push({
      time: timeStr,
      confidence: recognitionStats.averageConfidence
    })
    
    // 保持最近30个数据点
    if (confidenceData.value.length > maxConfidencePoints) {
      confidenceData.value.shift()
    }
  }
}

const captureFrame = () => {
  if (videoRef.value) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = videoRef.value.videoWidth
    canvas.height = videoRef.value.videoHeight
    ctx?.drawImage(videoRef.value, 0, 0)
    
    // 下载截图
    const link = document.createElement('a')
    link.download = `capture_${Date.now()}.png`
    link.href = canvas.toDataURL()
    link.click()
  }
}

// 计算视频在容器中的实际显示矩形（考虑 object-fit: contain 的留黑）
function getDisplayedRect() {
  const video = videoRef.value
  const wrapper = videoWrapperRef.value
  if (!video || !wrapper || !video.videoWidth || !video.videoHeight) {
    return { x: 0, y: 0, w: wrapper?.clientWidth ?? 0, h: wrapper?.clientHeight ?? 0 }
  }
  const vw = video.videoWidth
  const vh = video.videoHeight
  const cw = wrapper.clientWidth
  const ch = wrapper.clientHeight
  const videoAR = vw / vh
  const containerAR = cw / ch
  if (containerAR > videoAR) {
    // 高度贴合，左右留边
    const h = ch
    const w = Math.round(h * videoAR)
    const x = Math.round((cw - w) / 2)
    const y = 0
    return { x, y, w, h }
  } else {
    // 宽度贴合，上下留边
    const w = cw
    const h = Math.round(w / videoAR)
    const x = 0
    const y = Math.round((ch - h) / 2)
    return { x, y, w, h }
  }
}

// 将检测结果（以原始帧百分比）映射到容器像素坐标
function getBoxStyle(d: DetectionResult) {
  const rect = getDisplayedRect()
  const left = rect.x + (d.x / 100) * rect.w
  const top = rect.y + (d.y / 100) * rect.h
  const width = (d.width / 100) * rect.w
  const height = (d.height / 100) * rect.h
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  }
}

// 获取识别按钮文本
const getRecognitionButtonText = () => {
  switch (recognitionState.value) {
    case RecognitionState.INITIALIZING:
      return '初始化中...'
    case RecognitionState.WARMING_UP:
      return '预热中...'
    case RecognitionState.RUNNING:
      return '停止识别'
    case RecognitionState.READY:
      return isRecognizing.value ? '停止识别' : '开始识别'
    case RecognitionState.ERROR:
      return '重新初始化'
    default:
      return '初始化识别'
  }
}

// 获取状态文本
const getStatusText = () => {
  switch (recognitionState.value) {
    case RecognitionState.UNINITIALIZED:
      return '未初始化'
    case RecognitionState.INITIALIZING:
      return '初始化中'
    case RecognitionState.WARMING_UP:
      return '预热中'
    case RecognitionState.READY:
      return isRecognizing.value ? '运行中' : '就绪'
    case RecognitionState.RUNNING:
      return '推理中'
    case RecognitionState.ERROR:
      return '错误'
    default:
      return '未知状态'
  }
}

// 获取模式文本
const getModeText = () => {
  const options = recognitionService.getOptions()
  return options.mockMode ? '演示模式' : 'AI模式'
}

// 获取模式样式类
const getModeClass = () => {
  const options = recognitionService.getOptions()
  return options.mockMode ? 'mode-demo' : 'mode-ai'
}

// 设置事件监听器
const setupRecognitionListeners = () => {
  recognitionService.onStateChange((state) => {
    recognitionState.value = state
  })
  syncRecognitionState()
  
  recognitionService.onResult((results, stats) => {
    detections.value = results
    updateStats(stats)
  })
  // 监听跟踪进入/离开事件
  // @ts-ignore 获取具体实现的 onTrackEvent
  if (typeof (recognitionService as any).onTrackEvent === 'function') {
    ;(recognitionService as any).onTrackEvent((ev: { entered: number; exited: number }) => {
      recognitionStats.entered += ev.entered
      recognitionStats.exited += ev.exited
    })
  }
  
  recognitionService.onError((error) => {
    errorMessage.value = error
    isRecognizing.value = false
  })
}

onMounted(() => {
  setupRecognitionListeners()
  updateStats()
  // 如果通过 URL 参数指定了测试源（如 ?source=webcam），则自动加载并启动识别
  const source = (route.query.source as string | undefined)?.toString()

  // 异步串行执行：加载视频/摄像头 -> 初始化/预热 -> 开始识别
  ;(async () => {
    try {
      if (source) {
        selectedVideoId.value = source
        await loadTestVideo()
      } else {
        // 默认固定视频：public/Assets/data/... -> /Assets/data/...
        await loadFixedVideo()
      }

      await ensureRecognitionInitialized()
      startRecognition()
    } catch (e) {
      console.error('自动启动失败:', e)
      errorMessage.value = e instanceof Error ? e.message : '自动启动失败'
    }
  })()
})

onUnmounted(() => {
  stopRecognition()
  // 注意：不销毁service，因为它是单例，可能被其他组件使用
})
</script>

<style scoped>
.screen {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.5;
}

.body {
  position: relative;
  flex: 1;
  min-height: 0;
}

.body.full > :not(.video-container) {
  display: none;
}

.body.full .video-container {
  margin: 8px;
}

.video-container {
  position: absolute;
  inset: 8px;
  border-radius: 14px;
  overflow: hidden;
  background: #000;
  display: flex;
  flex-direction: column;
}

.video-wrapper {
  position: relative;
  flex: 1;
  min-height: 0;
}

.video-player {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.recognition-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.detection-box {
  position: absolute;
  border: 2px solid #4C8BF5;
  border-radius: 4px;
  background: rgba(76, 139, 245, 0.1);
}

.detection-label {
  position: absolute;
  top: -28px;
  left: 0;
  background: #4C8BF5;
  color: white;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 13px;
  white-space: nowrap;
}

.video-controls {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  flex-wrap: wrap;
  align-items: center;
}

.video-selector {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: white;
  cursor: pointer;
  font-size: 14px;
  min-width: 150px;
  transition: all 0.3s ease;
}

.video-selector:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.video-selector option {
  background: #2a2a2a;
  color: white;
}

.control-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 14px;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.control-btn.active {
  background: #4C8BF5;
  border-color: #4C8BF5;
}

.control-btn.loading {
  background: #FFC107;
  border-color: #FFC107;
  cursor: not-allowed;
}

.control-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-indicator {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.status-label {
  opacity: 0.7;
}

.status-value {
  font-weight: bold;
}

.status-uninitialized {
  color: #666;
}

.status-initializing,
.status-warming_up {
  color: #FFC107;
}

.status-ready {
  color: #00BFA5;
}

.status-running {
  color: #4C8BF5;
}

.status-error {
  color: #F44336;
}

.mode-demo {
  color: #FF9800;
}

.mode-ai {
  color: #4CAF50;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid rgba(244, 67, 54, 0.3);
  border-radius: 6px;
  color: #F44336;
  font-size: 13px;
  flex: 1;
  min-width: 200px;
}

.close-error {
  background: none;
  border: none;
  color: #F44336;
  cursor: pointer;
  font-size: 16px;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-error:hover {
  background: rgba(244, 67, 54, 0.1);
  border-radius: 50%;
}

.drawer {
  position: absolute;
  top: 8px;
  bottom: 8px;
  transition: transform .25s ease, opacity .25s ease;
  z-index: 50;
  opacity: .98;
  pointer-events: none;
}

.drawer.left {
  left: 8px;
  width: var(--left-w, 360px);
  transform: translateX(calc(-100% + 10px));
}

.drawer.right {
  right: 8px;
  width: var(--right-w, 360px);
  transform: translateX(calc(100% - 10px));
}

.drawer .drawer-inner {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
  box-sizing: border-box;
  overflow: hidden;
}

.drawer .drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.drawer .pin {
  border: 1px solid rgba(255, 255, 255, .15);
  background: transparent;
  color: #fff;
  padding: 6px 10px;
  border-radius: 10px;
  cursor: pointer;
}

.drawer .pin:hover {
  background: rgba(255, 255, 255, .08);
}

.drawer.open,
.drawer.pinned {
  pointer-events: auto;
  transform: translateX(0);
}

.handle {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 72px;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, .35);
  border: none;
  border-radius: 5px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, .25);
  pointer-events: auto;
}

.drawer.left .handle {
  right: -10px;
}

.drawer.right .handle {
  left: -10px;
}

.handle:hover {
  background: rgba(255, 255, 255, .55);
}

.panel {
  flex: 1;
  min-height: 0;
}

@media (max-width: 768px) {
  .video-controls {
    gap: 10px;
    padding: 12px;
  }

  .video-selector {
    min-width: 0;
    flex: 1;
  }

  .status-indicator {
    gap: 12px;
  }
}
</style>
