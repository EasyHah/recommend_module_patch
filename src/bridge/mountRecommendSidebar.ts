import { onMounted } from 'vue'
import { createApp, h } from 'vue'
import router from '@/router'
import { createPinia } from 'pinia'
import VFluent3 from '@creatorsn/vfluent3'
import RecommendSidebar from '@/components/recommend/RecommendSidebar.vue'

const MOUNT_ID = 'recommend-sidebar-portal'

export function ensureRecommendSidebarMounted(){
  if (document.getElementById(MOUNT_ID)) return
  const el = document.createElement('div')
  el.id = MOUNT_ID
  document.body.appendChild(el)
  
  // 创建独立的Vue应用，但共享路由器和状态管理
  const app = createApp({ render: () => h(RecommendSidebar) })
  app.use(router)
  app.use(createPinia())
  app.use(VFluent3)
  app.mount(el)
}

// auto-mount on import
if (typeof window !== 'undefined') {
  ensureRecommendSidebarMounted()
}
