import { onMounted } from 'vue'
import { createApp, h } from 'vue'
import RecommendSidebar from '@/components/recommend/RecommendSidebar.vue'

const MOUNT_ID = 'recommend-sidebar-portal'

export function ensureRecommendSidebarMounted(){
  if (document.getElementById(MOUNT_ID)) return
  const el = document.createElement('div')
  el.id = MOUNT_ID
  document.body.appendChild(el)
  const app = createApp({ render: () => h(RecommendSidebar) })
  app.mount(el)
}

// auto-mount on import
if (typeof window !== 'undefined') {
  ensureRecommendSidebarMounted()
}
