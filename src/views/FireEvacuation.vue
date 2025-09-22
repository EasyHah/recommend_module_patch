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
            controls 
            :src="selectedVideo.src"
            :poster="selectedVideo.poster"
          >
            您的浏览器不支持视频播放。
          </video>
          <!-- 加载指示器 -->
          <div v-if="isVideoLoading" class="video-loading">
            <div class="loading-spinner"></div>
            <p>正在加载视频...</p>
          </div>
        </div>
        <div class='video-details'>
          <p class='video-description'>{{ selectedVideo.fullDescription }}</p>
          <div class='video-tags'>
            <span class='tag' v-for="tag in selectedVideo.tags" :key="tag">{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang='ts'>
import { ref, onMounted } from 'vue'
import TopBar from '@/components/TopBar.vue'
import { useUIStore } from '@/stores/ui'

const ui = useUIStore()

interface VideoItem {
  id: string
  title: string
  description: string
  fullDescription: string
  src: string
  poster?: string
  duration: string
  category: string
  icon: string
  tags: string[]
}

const selectedVideo = ref<VideoItem | null>(null)
const videoPlayerRef = ref<HTMLVideoElement | null>(null)
const isVideoLoading = ref(false)

const evacuationVideos: VideoItem[] = [
  {
    id: 'personnel',
    title: '人员疏散',
    description: '火灾场景下人员有序疏散的模拟演示',
    fullDescription: '本视频展示了在火灾紧急情况下，人员如何通过安全出口进行有序疏散的完整过程。包括疏散路线选择、人流控制和安全防护措施。',
    src: '/FireEvacuation/人员疏散.mp4',
    duration: '未知',
    category: '人员安全',
    icon: '🚶‍♂️',
    tags: ['人员疏散', '安全出口', '紧急避险', '消防安全']
  },
  {
    id: 'vehicle',
    title: '车辆疏散',
    description: '火灾场景下车辆快速疏散的模拟演示',
    fullDescription: '本视频模拟了停车场或道路发生火灾时，车辆如何快速有序地撤离现场，避免交通拥堵，确保疏散通道畅通。',
    src: '/FireEvacuation/车辆疏散.mp4',
    duration: '未知',
    category: '交通管理',
    icon: '🚗',
    tags: ['车辆疏散', '交通管制', '应急撤离', '道路安全']
  },
  {
    id: 'mixed',
    title: '人车混流',
    description: '人员与车辆混合疏散的复杂场景模拟',
    fullDescription: '本视频展示了最复杂的疏散场景：人员和车辆需要同时疏散的情况。演示了如何协调人车混流，确保疏散效率和安全性。',
    src: '/FireEvacuation/人车混流.mp4',
    duration: '未知',
    category: '综合疏散',
    icon: '🚶‍♂️🚗',
    tags: ['人车混流', '协调疏散', '复合场景', '应急管理']
  }
]

const selectVideo = (video: VideoItem) => {
  if (selectedVideo.value?.id === video.id) {
    // 如果点击的是当前正在播放的视频，不需要重新加载
    return
  }
  
  selectedVideo.value = video
  isVideoLoading.value = true
  
  // 等待DOM更新后重新加载视频
  setTimeout(() => {
    if (videoPlayerRef.value) {
      // 添加事件监听器
      const handleLoadedData = () => {
        isVideoLoading.value = false
        videoPlayerRef.value?.removeEventListener('loadeddata', handleLoadedData)
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
}

onMounted(() => {
  // 页面加载时可以执行一些初始化操作
  console.log('火灾疏散页面已加载')
})
</script>

<style scoped>
.screen {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

.body {
  flex: 1;
  min-height: 0;
  padding: 20px;
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
  font-size: 2.5rem;
  font-weight: bold;
  color: #fff;
  margin-bottom: 10px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.page-description {
  font-size: 1.1rem;
  color: #b0b0b0;
  margin: 0;
}

/* 视频网格布局 */
.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
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