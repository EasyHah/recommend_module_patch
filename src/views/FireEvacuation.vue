<template>
  <div class='screen'>
    <TopBar />
    <div class='body' :class='{ full: ui.fullscreen }'>
      <!-- 页面标题 -->
      <div class='page-header'>
        <h2 class='page-title'>🔥 火灾疏散模拟视频</h2>
        <p class='page-description'>观看不同场景下的火灾疏散模拟演示</p>
      </div>
      
      <!-- 视频网格容器 -->
      <div class='video-grid'>
        <div 
          v-for="video in evacuationVideos" 
          :key="video.id"
          class='video-card'
          :class="{ active: selectedVideo?.id === video.id }"
        >
          <div class='video-thumbnail' @click="selectVideo(video)">
            <div class='video-icon'>
              {{ video.icon }}
            </div>
            <div class='video-info'>
              <h3 class='video-title'>{{ video.title }}</h3>
              <p class='video-desc'>{{ video.description }}</p>
              <div class='video-meta'>
                <span class='duration'>{{ video.duration }}</span>
                <span class='category'>{{ video.category }}</span>
              </div>
            </div>
            <div class='play-button'>
              <span>▶️</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 视频播放器 -->
      <div class='video-player-section' v-if="selectedVideo">
        <div class='player-header'>
          <h3>{{ selectedVideo.title }}</h3>
          <button class='close-btn' @click="closePlayer">✕</button>
        </div>
        <div class='video-wrapper'>
          <video 
            ref="videoPlayerRef"
            class='video-player' 
            :src="currentVideoSrc"
            :poster="selectedVideo.poster"
            playsinline
            muted
            autoplay
          >
            您的浏览器不支持视频播放。
          </video>
          <!-- 自定义最小控件：隐藏原生进度条 -->
          <div class="custom-controls">
            <button class="ctrl-btn" @click="togglePlay">
              {{ isPlaying ? '暂停' : '播放' }}
            </button>
            <button class="ctrl-btn" @click="toggleMute">
              {{ isMuted ? '取消静音' : '静音' }}
            </button>
          </div>
          <!-- 加载指示器 -->
          <div v-if="isVideoLoading" class="video-loading">
            <div class="loading-spinner"></div>
            <p>正在加载视频...</p>
          </div>
        </div>
        <div class='video-details'>
          <p class='video-description'>{{ selectedVideo.fullDescription }}</p>
          <!-- 视角切换 -->
          <div class="view-switcher">
            <span class="label">视角：</span>
            <div class="views">
              <button
                v-for="view in selectedVideo.views"
                :key="view.id"
                class="view-btn"
                :class="{ active: currentViewId === view.id }"
                @click="switchView(view.id)"
              >
                {{ view.name }}
              </button>
            </div>
          </div>
          <div class='video-tags'>
            <span class='tag' v-for="tag in selectedVideo.tags" :key="tag">{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang='ts'>
import { ref, onMounted, computed } from 'vue'
import TopBar from '@/components/TopBar.vue'
import { useUIStore } from '@/stores/ui'

const ui = useUIStore()

interface VideoItem {
  id: string
  title: string
  description: string
  fullDescription: string
  poster?: string
  duration: string
  category: string
  icon: string
  tags: string[]
  views: Array<{ id: string; name: string; src: string; default?: boolean }>
}

const selectedVideo = ref<VideoItem | null>(null)
const videoPlayerRef = ref<HTMLVideoElement | null>(null)
const isVideoLoading = ref(false)
const currentViewId = ref<string | null>(null)
const isPlaying = ref(false)
const isMuted = ref(true)
const currentVideoSrc = computed(() => {
  if (!selectedVideo.value) return ''
  const view = selectedVideo.value.views.find(v => v.id === currentViewId.value) || selectedVideo.value.views[0]
  return view?.src || ''
})

const evacuationVideos: VideoItem[] = [
  {
    id: 'personnel',
    title: '人员疏散',
    description: '火灾场景下人员有序疏散的模拟演示',
    fullDescription: '本视频展示了在火灾紧急情况下，人员如何通过安全出口进行有序疏散的完整过程。包括疏散路线选择、人流控制和安全防护措施。',
    duration: '未知',
    category: '人员安全',
    icon: '🚶‍♂️',
    tags: ['人员疏散', '安全出口', '紧急避险', '消防安全'],
    views: [
      { id: 'default', name: '默认视角', src: '/FireEvacuation/人员疏散.mp4', default: true },
      { id: 'north-gate', name: '北门视角', src: '/FireEvacuation/人员北门视角.mp4' }
    ]
  },
  {
    id: 'vehicle',
    title: '车辆疏散',
    description: '火灾场景下车辆快速疏散的模拟演示',
    fullDescription: '本视频模拟了停车场或道路发生火灾时，车辆如何快速有序地撤离现场，避免交通拥堵，确保疏散通道畅通。',
    duration: '未知',
    category: '交通管理',
    icon: '🚗',
    tags: ['车辆疏散', '交通管制', '应急撤离', '道路安全'],
    views: [
      { id: 'default', name: '默认视角', src: '/FireEvacuation/车辆疏散.mp4', default: true }
    ]
  },
  {
    id: 'mixed',
    title: '人车混流',
    description: '人员与车辆混合疏散的复杂场景模拟',
    fullDescription: '本视频展示了最复杂的疏散场景：人员和车辆需要同时疏散的情况。演示了如何协调人车混流，确保疏散效率和安全性。',
    duration: '未知',
    category: '综合疏散',
    icon: '🚶‍♂️🚗',
    tags: ['人车混流', '协调疏散', '复合场景', '应急管理'],
    views: [
      { id: 'default', name: '默认视角', src: '/FireEvacuation/人车混流.mp4', default: true },
      { id: 'north-gate', name: '北门视角', src: '/FireEvacuation/人车混流北门视角.mp4' }
    ]
  }
]

const selectVideo = (video: VideoItem) => {
  if (selectedVideo.value?.id === video.id) {
    // 如果点击的是当前正在播放的视频，不需要重新加载
    return
  }
  
  selectedVideo.value = video
  isVideoLoading.value = true
  // 初始化当前视角
  currentViewId.value = video.views.find(v => v.default)?.id || video.views[0]?.id || null
  
  // 等待DOM更新后重新加载视频
  setTimeout(() => {
    if (videoPlayerRef.value) {
      // 添加事件监听器
      const handleLoadedData = () => {
        isVideoLoading.value = false
        videoPlayerRef.value?.removeEventListener('loadeddata', handleLoadedData)
        isPlaying.value = !videoPlayerRef.value?.paused
        isMuted.value = !!videoPlayerRef.value?.muted
      }
      
      const handleError = () => {
        isVideoLoading.value = false
        console.error('视频加载失败')
        videoPlayerRef.value?.removeEventListener('error', handleError)
      }
      
      videoPlayerRef.value.addEventListener('loadeddata', handleLoadedData)
      videoPlayerRef.value.addEventListener('error', handleError)
      
      videoPlayerRef.value.load() // 重新加载视频源
      videoPlayerRef.value.play().catch(err => {
        console.log('视频自动播放失败，需要用户手动播放:', err)
        isVideoLoading.value = false
      })
    }
    
    // 滚动到播放器区域
    const playerSection = document.querySelector('.video-player-section')
    if (playerSection) {
      playerSection.scrollIntoView({ behavior: 'smooth' })
    }
  }, 100)
}

const closePlayer = () => {
  if (videoPlayerRef.value) {
    videoPlayerRef.value.pause()
    videoPlayerRef.value.currentTime = 0
  }
  selectedVideo.value = null
  isVideoLoading.value = false
  currentViewId.value = null
}

onMounted(() => {
  // 页面加载时可以执行一些初始化操作
  console.log('火灾疏散页面已加载')
})

// 视角切换：按进度比例保持时间点
const switchView = (viewId: string) => {
  if (!selectedVideo.value || !videoPlayerRef.value) return
  if (currentViewId.value === viewId) return

  const videoEl = videoPlayerRef.value
  const oldDuration = Math.max(videoEl.duration || 0, 0.00001)
  const progress = videoEl.currentTime / oldDuration

  currentViewId.value = viewId
  isVideoLoading.value = true

  // 重新绑定一次 loadedmetadata 以便跳转进度
  const onLoadedMeta = () => {
    const newDuration = Math.max(videoEl.duration || 0, 0.00001)
    videoEl.currentTime = Math.min(newDuration * progress, newDuration - 0.05)
    videoEl.play().catch(() => {})
    isVideoLoading.value = false
    isPlaying.value = !videoEl.paused
    isMuted.value = !!videoEl.muted
    videoEl.removeEventListener('loadedmetadata', onLoadedMeta)
  }
  videoEl.addEventListener('loadedmetadata', onLoadedMeta)
  // 触发重新加载
  videoEl.load()
}

// 播放控制
const togglePlay = () => {
  const el = videoPlayerRef.value
  if (!el) return
  if (el.paused) {
    el.play().then(() => {
      isPlaying.value = true
    }).catch(() => {})
  } else {
    el.pause()
    isPlaying.value = false
  }
}

const toggleMute = () => {
  const el = videoPlayerRef.value
  if (!el) return
  el.muted = !el.muted
  isMuted.value = el.muted
}
</script>

<style scoped>
.screen {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #fff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.5;
}

.body {
  flex: 1;
  min-height: 0;
  padding: clamp(12px, 2.2vw, 20px);
  overflow-y: auto;
}

.body.full {
  padding: 8px;
}

.page-header {
  text-align: center;
  margin-bottom: 30px;
  padding: 20px;
}

.page-title {
  font-size: clamp(1.6rem, 4vw, 2.5rem);
  font-weight: bold;
  margin-bottom: 10px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.page-description {
  font-size: clamp(0.95rem, 2vw, 1.1rem);
  color: #b0b0b0;
  margin: 0;
}

/* 视频网格布局 */
.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: clamp(12px, 2vw, 20px);
  margin: 0 auto 40px;
  max-width: 1200px;
}

.video-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.video-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  background: rgba(255, 255, 255, 0.08);
}

.video-card.active {
  border-color: #ff6b35;
  box-shadow: 0 0 20px rgba(255, 107, 53, 0.3);
}

.video-thumbnail {
  padding: 20px;
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  gap: 15px;
}

.video-icon {
  font-size: 3rem;
  min-width: 80px;
  text-align: center;
}

.video-info {
  flex: 1;
}

.video-title {
  font-size: 1.4rem;
  font-weight: bold;
  color: #fff;
  margin: 0 0 8px 0;
}

.video-desc {
  color: #b0b0b0;
  font-size: 0.95rem;
  margin: 0 0 10px 0;
  line-height: 1.4;
}

.video-meta {
  display: flex;
  gap: 15px;
}

.duration, .category {
  font-size: 0.85rem;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.play-button {
  font-size: 1.5rem;
  opacity: 0.7;
  transition: opacity 0.3s ease;
}

.video-card:hover .play-button {
  opacity: 1;
}

/* 视频播放器样式 */
.video-player-section {
  max-width: 1000px;
  margin: 0 auto;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 16px;
  padding: 20px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.player-header h3 {
  color: #fff;
  font-size: 1.5rem;
  margin: 0;
}

.close-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  font-size: 1.2rem;
  width: 35px;
  height: 35px;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.3s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.video-wrapper {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 15px;
}

.video-player {
  width: 100%;
  height: auto;
  max-height: 60vh;
  background: #000;
}

/* 自定义控制条 */
.custom-controls {
  position: absolute;
  left: 10px;
  bottom: 10px;
  display: flex;
  gap: 8px;
  z-index: 2;
}

.ctrl-btn {
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.ctrl-btn:hover {
  background: rgba(0, 0, 0, 0.65);
}

.video-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  border-radius: 12px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top: 3px solid #ff6b35;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.video-details {
  padding: 15px 0;
}

.view-switcher {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.view-switcher .label {
  color: #fff;
  opacity: 0.8;
}

.views {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.view-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.9rem;
}

.view-btn.active, .view-btn:hover {
  background: rgba(255, 107, 53, 0.25);
  border-color: rgba(255, 107, 53, 0.5);
}

.video-description {
  color: #d0d0d0;
  font-size: 1rem;
  line-height: 1.6;
  margin-bottom: 15px;
}

.video-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  background: rgba(255, 107, 53, 0.2);
  color: #ff6b35;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.85rem;
  border: 1px solid rgba(255, 107, 53, 0.3);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .video-grid {
    grid-template-columns: 1fr;
    gap: 15px;
  }
  
  .page-title {
    font-size: 2rem;
  }
  
  .video-thumbnail {
    flex-direction: column;
    text-align: center;
    gap: 10px;
  }
  
  .video-icon {
    min-width: auto;
  }
  
  .body {
    padding: 15px;
  }
}

@media (max-width: 480px) {
  .page-title {
    font-size: 1.5rem;
  }
  
  .video-card {
    margin: 0 -5px;
  }
  
  .body {
    padding: 10px;
  }
}
</style>
