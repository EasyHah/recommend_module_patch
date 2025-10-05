<template>
  <div class="panorama-modal" v-if="visible" @click="closeModal">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h3>全景查看器</h3>
        <button class="close-btn" @click="closeModal">×</button>
      </div>
      <div class="panorama-container" ref="panoContainer">
        <!-- 加载状态 -->
        <div class="loading-indicator" v-if="loading">
            <div class="spinner"></div>
            <p>正在加载全景图像...</p>
        </div>
        <!-- 错误提示 -->
        <div class="error-message" v-else-if="error">
            <p>{{ error }}</p>
            <button @click="retryLoad">重试</button>
        </div>
        <!-- 外部 iframe 模式 -->
        <div v-else-if="mode==='external'" class="external-panorama">
          <div class="external-info">
            <h4>外部全景链接</h4>
            <p>下方为嵌入预览，可点击按钮新窗口打开</p>
            <a class="external-btn" :href="externalUrl" target="_blank" rel="noopener">🌐 打开全景查看器</a>
            <div class="preview-frame">
              <iframe :src="externalUrl" frameborder="0" allowfullscreen></iframe>
            </div>
          </div>
        </div>
        <!-- Marzipano / 图片模式容器（Marzipano 会往里插入 DOM） -->
        <div v-else-if="mode==='marzi' || mode==='image'" class="marzipano-wrapper" />
        <!-- 初始/空状态 -->
        <div v-else class="marzipano-placeholder">
          <div class="placeholder-content">
            <div class="panorama-icon">🛰️</div>
            <h4>全景查看器</h4>
            <p>请选择地图中的全景点</p>
            <small>支持本地立方体全景与外部 URL</small>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <div class="controls">
          <button @click="resetView" :disabled="!viewer" title="重置视角">重置视角</button>
          <button @click="toggleFullscreen" title="全屏" :disabled="!panoContainer">{{ fullscreen ? '退出全屏' : '全屏' }}</button>
        </div>
        <div class="info">
          <p v-if="currentPanoInfo">{{ currentPanoInfo.name || '全景点位' }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue'

// Props
defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['close'])

// 状态
const panoContainer = ref(null)
const loading = ref(false)
const error = ref('')
const fullscreen = ref(false)
const currentPanoInfo = ref(null)
// 渲染模式：'' | external | marzi | image
const mode = ref('')
const externalUrl = ref('')
let loadCounter = 0
let isAlive = true

// Marzipano viewer 实例
let viewer = null

// 关闭弹窗
function closeModal() {
  // 先通知父组件关闭modal（这会触发v-if=false）
  emit('close')
  // 延迟清理内部状态，确保DOM销毁前完成清理
  requestAnimationFrame(() => {
    if (viewer) {
      try { viewer.destroy() } catch { /* ignore */ }
      viewer = null
    }
    mode.value = ''
    externalUrl.value = ''
    error.value = ''
    loading.value = false
    loadCounter++ // 取消所有pending的加载
  })
}

// 加载全景图像
async function loadPanorama(panoUrl, info = null) {
  loadCounter++
  const token = loadCounter
  if (!panoContainer.value || !isAlive) return
  loading.value = true
  error.value = ''
  currentPanoInfo.value = info
  mode.value = ''
  externalUrl.value = ''

  try {
    // 销毁旧 viewer
    if (viewer) { try { viewer.destroy() } catch {} viewer = null }

    await nextTick()
    if (token !== loadCounter || !isAlive) return

    if (panoUrl.startsWith('http')) {
      // 外部链接模式
      externalUrl.value = panoUrl
      mode.value = 'external'
    } else {
      // 本地全景或图片
      await createMarzipanoViewer(panoUrl, token)
    }
  } catch (err) {
    if (token === loadCounter) {
      console.error('加载全景失败:', err)
      error.value = '加载全景图像失败，请检查资源是否存在'
    }
  } finally {
    if (token === loadCounter) loading.value = false
  }
}

// 已弃用的直接 DOM 注入被移除，改为模板分支渲染 external 模式

// 创建 Marzipano 查看器
async function createMarzipanoViewer(imagePath, token) {
  try {
    // 动态加载 Marzipano 库
    await loadMarzipanoScript()
    
    if (token !== loadCounter || !isAlive) return
    const container = panoContainer.value
    if (!container) return
    // 找到模板里为 Marzipano 预留的 wrapper
    const wrapper = container.querySelector('.marzipano-wrapper')
    if (!wrapper) return
    // 清空 wrapper
    while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild)
    
    // 创建 Marzipano viewer
    viewer = new window.Marzipano.Viewer(wrapper)
    
    // 检查是否是本地全景资源路径
    if (imagePath.includes('project-title')) {
      // 使用现有的全景数据
      await loadLocalPanorama()
    } else {
      // 尝试作为单张全景图片加载
      await loadImagePanorama(imagePath)
    }
    mode.value = imagePath.includes('project-title') ? 'marzi' : 'image'
  } catch (error) {
    console.error('Marzipano 初始化失败:', error)
    throw new Error('全景查看器初始化失败')
  }
}

// 加载 Marzipano 脚本
function loadMarzipanoScript() {
  return new Promise((resolve, reject) => {
    if (window.Marzipano) {
      resolve()
      return
    }
    
    const script = document.createElement('script')
    script.src = '/Assets/data/project-title/app-files/vendor/marzipano.js'
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

// 加载本地全景数据
async function loadLocalPanorama() {
  try {
    // 动态加载全景数据
    const response = await fetch('/Assets/data/project-title/app-files/data.js')
    const dataScript = await response.text()
    
    // 执行数据脚本
    eval(dataScript)
    
    if (window.APP_DATA && window.APP_DATA.scenes && window.APP_DATA.scenes.length > 0) {
      const scene = window.APP_DATA.scenes[0] // 使用第一个场景
      
      // 创建几何体和纹理
      const geometry = new window.Marzipano.CubeGeometry(scene.levels)
      const source = window.Marzipano.ImageUrlSource.fromString(
        `/Assets/data/project-title/app-files/tiles/${scene.id}/{z}/{f}/{y}/{x}.jpg`
      )
      const texture = new window.Marzipano.Texture(source)
      
      // 创建场景
      const marzipanoScene = viewer.createScene({
        source: source,
        geometry: geometry,
        view: window.Marzipano.RectilinearView.limit.traditional(
          scene.faceSize, 
          100 * Math.PI / 180
        ),
        pinFirstLevel: true
      })
      
      // 设置初始视角
      marzipanoScene.view().setParameters(scene.initialViewParameters)
      
      // 切换到这个场景
      marzipanoScene.switchTo()
      
      console.log('本地全景加载成功')
    } else {
      throw new Error('全景数据格式错误')
    }
  } catch (error) {
    console.error('加载本地全景失败:', error)
    throw error
  }
}

// 加载单张全景图片
async function loadImagePanorama(imagePath) {
  try {
    const source = window.Marzipano.ImageUrlSource.fromString(imagePath)
    const geometry = new window.Marzipano.EquirectGeometry([{ width: 4096 }])
    
    const scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: window.Marzipano.RectilinearView.limit.traditional(1024, 120 * Math.PI / 180),
      pinFirstLevel: true
    })
    
    scene.switchTo()
    console.log('全景图片加载成功')
  } catch (error) {
    console.error('加载全景图片失败:', error)
    throw error
  }
}

// 重试加载
function retryLoad() {
  if (currentPanoInfo.value && currentPanoInfo.value.url) {
    loadPanorama(currentPanoInfo.value.url, currentPanoInfo.value)
  }
}

// 重置视角
function resetView() {
  if (viewer && viewer.scene) {
    viewer.scene.view().setYaw(0)
    viewer.scene.view().setPitch(0)
    viewer.scene.view().setFov(Math.PI / 4)
  }
}

// 切换全屏
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    panoContainer.value?.requestFullscreen()
    fullscreen.value = true
  } else {
    document.exitFullscreen()
    fullscreen.value = false
  }
}

// 全屏状态监听
function handleFullscreenChange() {
  fullscreen.value = !!document.fullscreenElement
}

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

onUnmounted(() => {
  isAlive = false
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  if (viewer) {
    viewer.destroy()
    viewer = null
  }
})

// 暴露方法供父组件调用
defineExpose({
  loadPanorama,
  closeModal
})
</script>

<style scoped>
.panorama-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: linear-gradient(145deg, #2c2c2c, #1f1f1f);
  border-radius: 16px;
  width: 90vw;
  height: 85vh;
  max-width: 1200px;
  max-height: 800px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #1a1a1a;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.panorama-container {
  flex: 1;
  position: relative;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-indicator {
  text-align: center;
  color: #fff;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.2);
  border-left: 4px solid #007acc;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-message {
  text-align: center;
  color: #ff6b6b;
  padding: 20px;
}

.error-message button {
  background: #007acc;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 12px;
}

.error-message button:hover {
  background: #005a9e;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: #1a1a1a;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
}

.controls {
  display: flex;
  gap: 12px;
}

.controls button {
  background: #007acc;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.controls button:hover {
  background: #005a9e;
}

.info {
  color: #ccc;
  font-size: 14px;
}

/* 外部全景样式 */
.external-panorama {
  padding: 40px;
  text-align: center;
  color: white;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.external-info h4 {
  margin-bottom: 16px;
  font-size: 24px;
  color: #007acc;
}

.external-info p {
  margin-bottom: 24px;
  color: #ccc;
  font-size: 16px;
}

.external-btn {
  background: linear-gradient(135deg, #0078d4, #106ebe);
  color: white;
  border: none;
  padding: 14px 28px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 30px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 16px rgba(0, 120, 212, 0.3);
  position: relative;
  overflow: hidden;
}

.external-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s;
}

.external-btn:hover {
  background: linear-gradient(135deg, #106ebe, #005a9e);
  transform: translateY(-3px);
  box-shadow: 0 8px 25px rgba(0, 120, 212, 0.4);
}

.external-btn:hover::before {
  left: 100%;
}

.preview-frame {
  width: 100%;
  max-width: 800px;
  height: 400px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.preview-frame iframe {
  width: 100%;
  height: 100%;
  border: none;
}

/* Marzipano 占位符样式 */
.marzipano-placeholder {
  padding: 40px;
  text-align: center;
  color: white;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.marzipano-placeholder h4 {
  margin-bottom: 16px;
  font-size: 24px;
  color: #007acc;
}

.placeholder-content {
  background: rgba(255, 255, 255, 0.05);
  padding: 40px;
  border-radius: 12px;
  border: 2px dashed rgba(255, 255, 255, 0.2);
}

.panorama-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.7;
}

.placeholder-content p {
  color: #ccc;
  margin-bottom: 10px;
  font-size: 16px;
}

.placeholder-content small {
  color: #888;
  font-size: 12px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .modal-content {
    width: 95vw;
    height: 90vh;
  }
  
  .modal-header {
    padding: 12px 16px;
  }
  
  .modal-footer {
    padding: 12px 16px;
    flex-direction: column;
    gap: 12px;
  }
  
  .controls {
    width: 100%;
    justify-content: center;
  }
}
</style>