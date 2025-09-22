<template>
  <div class="floating-panel" :class="{ collapsed, dragging }" :style="panelStyle" ref="panelRef">
    <!-- 标题栏：可拖拽，可折叠 -->
    <div class="panel-header" @mousedown="startDrag" @click="toggleCollapse">
      <span>{{ title }}</span>
      <div class="header-actions">
        <button class="panel-toggle" :class="{ collapsed }" @click.stop="toggleCollapse">
          <span>{{ collapsed ? '▼' : '▲' }}</span>
        </button>
        <button class="panel-close" @click.stop="$emit('close')">×</button>
      </div>
    </div>

    <!-- 内容区：可折叠 -->
    <div class="panel-content" :class="{ collapsed }" ref="contentRef">
      <slot></slot>
    </div>

    <!-- 调整大小把手 -->
    <div class="resizer" @mousedown="startResize" v-show="!collapsed"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface Props {
  title?: string
  initialX?: number
  initialY?: number
  initialWidth?: number
  initialHeight?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  draggable?: boolean
  resizable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '信息面板',
  initialX: 16,
  initialY: 16,
  initialWidth: 360,
  initialHeight: 400,
  minWidth: 280,
  minHeight: 150,
  maxWidth: 600,
  maxHeight: 800,
  draggable: true,
  resizable: true
})

defineEmits<{
  close: []
}>()

// 状态管理
const panelRef = ref<HTMLElement>()
const contentRef = ref<HTMLElement>()
const collapsed = ref(false)
const dragging = ref(false)

// 位置和尺寸状态
const position = ref({ x: props.initialX, y: props.initialY })
const size = ref({ width: props.initialWidth, height: props.initialHeight })

// 拖拽相关状态
const dragState = ref({ isDragging: false, offsetX: 0, offsetY: 0 })
const resizeState = ref({ isResizing: false, startX: 0, startY: 0, startWidth: 0, startHeight: 0 })

// 计算面板样式
const panelStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
  width: `${size.value.width}px`,
  height: collapsed.value ? 'auto' : `${size.value.height}px`
}))

// 折叠/展开切换
const toggleCollapse = () => {
  collapsed.value = !collapsed.value
}

// 开始拖拽
const startDrag = (e: MouseEvent) => {
  if (!props.draggable) return
  e.preventDefault()
  
  const rect = panelRef.value?.getBoundingClientRect()
  if (!rect) return

  dragState.value = {
    isDragging: true,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top
  }
  
  dragging.value = true
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

// 拖拽过程
const onDrag = (e: MouseEvent) => {
  if (!dragState.value.isDragging) return
  
  const newX = e.clientX - dragState.value.offsetX
  const newY = e.clientY - dragState.value.offsetY
  
  // 边界限制
  const maxX = window.innerWidth - size.value.width
  const maxY = window.innerHeight - (collapsed.value ? 60 : size.value.height)
  
  position.value = {
    x: Math.max(0, Math.min(newX, maxX)),
    y: Math.max(0, Math.min(newY, maxY))
  }
}

// 停止拖拽
const stopDrag = () => {
  dragState.value.isDragging = false
  dragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// 开始调整大小
const startResize = (e: MouseEvent) => {
  if (!props.resizable) return
  e.preventDefault()
  
  resizeState.value = {
    isResizing: true,
    startX: e.clientX,
    startY: e.clientY,
    startWidth: size.value.width,
    startHeight: size.value.height
  }
  
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
}

// 调整大小过程
const onResize = (e: MouseEvent) => {
  if (!resizeState.value.isResizing) return
  
  const deltaX = e.clientX - resizeState.value.startX
  const deltaY = e.clientY - resizeState.value.startY
  
  const newWidth = Math.max(props.minWidth, Math.min(props.maxWidth, resizeState.value.startWidth + deltaX))
  const newHeight = Math.max(props.minHeight, Math.min(props.maxHeight, resizeState.value.startHeight + deltaY))
  
  size.value = { width: newWidth, height: newHeight }
}

// 停止调整大小
const stopResize = () => {
  resizeState.value.isResizing = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
}

// 清理事件监听
onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
})

// 响应式位置调整（窗口大小变化时）
const handleWindowResize = () => {
  const maxX = window.innerWidth - size.value.width
  const maxY = window.innerHeight - size.value.height
  
  position.value = {
    x: Math.max(0, Math.min(position.value.x, maxX)),
    y: Math.max(0, Math.min(position.value.y, maxY))
  }
}

onMounted(() => {
  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
})
</script>

<style scoped>
.floating-panel {
  position: fixed;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  backdrop-filter: blur(8px);
  transition: box-shadow 0.3s ease;
  z-index: 1000;
  user-select: none;
}

.floating-panel.dragging {
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  opacity: 0.95;
}

.floating-panel.collapsed {
  transform: scale(0.98);
  opacity: 0.9;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.65);
  color: white;
  font-weight: 600;
  font-size: 14px;
  cursor: move;
  border-radius: 10px 10px 0 0;
}

.panel-header:hover {
  background: rgba(0, 0, 0, 0.75);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-toggle {
  cursor: pointer;
  background: transparent;
  border: none;
  color: white;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.panel-toggle:hover {
  background: rgba(255, 255, 255, 0.2);
}

.panel-toggle.collapsed {
  transform: rotate(180deg);
}

.panel-close {
  cursor: pointer;
  background: transparent;
  border: none;
  color: white;
  font-size: 18px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.panel-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.panel-content {
  max-height: 400px;
  overflow-y: auto;
  transition: max-height 0.3s ease, padding 0.3s ease;
  padding: 16px;
}

.panel-content.collapsed {
  max-height: 0;
  overflow: hidden;
  padding: 0 16px;
}

.resizer {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 20px;
  height: 20px;
  cursor: nw-resize;
  background: linear-gradient(-45deg, transparent 30%, #ccc 30%, #ccc 50%, transparent 50%);
  opacity: 0.6;
  transition: opacity 0.2s;
}

.resizer:hover {
  opacity: 1;
}

/* 滚动条样式 */
.panel-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.5);
}
</style>