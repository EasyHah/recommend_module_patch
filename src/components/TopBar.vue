<template>
  <header class="topbar fluent-acrylic-strong">
    <!-- 左：时间 + 全屏 -->
    <div class="left">
      <span class="time">{{ timeText }}</span>
      <button class="nav-btn" @click="ui.toggleFullscreen()">
        {{ fullscreen ? '退出全屏' : '全屏' }}
      </button>
    </div>

    <!-- 中：导航（含"三维场景"入口） -->
    <nav class="center">
      <RouterLink class="nav-btn" :class="{ active: isActive('/') }" to="/">总览</RouterLink>
      <RouterLink class="nav-btn" :class="{ active: isActive('/scene') }" to="/scene/gu">三维场景</RouterLink>
      <RouterLink class="nav-btn" :class="{ active: isActive('/video-recognition') }" to="/video-recognition">视频识别</RouterLink>
      <RouterLink class="nav-btn" :class="{ active: isActive('/fire-evacuation') }" to="/fire-evacuation">🔥 火灾疏散</RouterLink>
    </nav>

    <!-- 右：用户/标题位 -->
    <div class="right">
      <button class="nav-btn" @click="toggleRecommend()">推荐侧栏</button>
      <div class="persona">
        <!-- 这里用已有资源，避免 /favicon.ico 缺失 -->
        <img class="avatar" alt="logo" src="/wallpaper.jpg" />
        <div class="name">Winlike Industrial</div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useUIStore } from '@/stores/ui'

const ui = useUIStore()
import { toggleRecommend } from '@/bridge/recommendUI'
const { fullscreen } = storeToRefs(ui)

const timeText = ref('— —')
let timer: number | undefined

function tick() {
  const d = new Date()
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
  timeText.value =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

onMounted(() => {
  tick()
  timer = window.setInterval(tick, 1000)
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

const route = useRoute()
const isActive = (path: string) => {
  if (path === '/') return route.path === path
  return route.path.startsWith(path)
}
</script>

<style scoped>
.topbar{
  position: sticky; top: 0; z-index: 50;
  height: 56px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px;
  border: 1px solid var(--panel-border, rgba(0,0,0,.08));
  border-radius: 14px;
  box-shadow: var(--panel-shadow, 0 6px 24px rgba(0,0,0,.12));
  background: var(--panel-bg-strong, rgba(255,255,255,.72));
  backdrop-filter: saturate(1.1) blur(10px);
}

.left{ min-width: 220px; display: flex; gap: 8px; align-items: center; }
.center{ display: flex; gap: 8px; align-items: center; }
.right{ min-width: 220px; display: flex; gap: 8px; align-items: center; justify-content: flex-end; }

.nav-btn{
  height: 32px; padding: 0 12px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 10px;
  border: 1px solid var(--panel-border, rgba(0,0,0,.08));
  background: var(--panel-bg, rgba(255,255,255,.6));
  font-size: 13px;
  cursor: pointer; text-decoration: none; color: inherit;
}
.nav-btn:hover{ background: rgba(0,0,0,.04); }
.nav-btn.active{
  background: var(--brand-weak, rgba(0,120,255,.1));
  border-color: var(--brand, #2f7cf6);
  color: var(--brand, #2f7cf6);
}

.time{ font-variant-numeric: tabular-nums; font-size: 13px; opacity: .9; }

.persona{ display: flex; align-items: center; gap: 8px; }
.avatar{
  width: 24px; height: 24px; border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--panel-border, rgba(0,0,0,.08));
}
.name{ font-size: 14px; opacity: .95; font-weight: 700; }
</style>