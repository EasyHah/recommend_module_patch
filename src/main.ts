import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import VFluent3 from '@creatorsn/vfluent3'
import './styles/tokens.css' // 基础 Design Tokens
import './styles/theme.css'  // 主题样式（依赖 tokens）
createApp(App).use(createPinia()).use(router).use(VFluent3).mount('#app')

// Mount recommendation sidebar globally
import '@/bridge/mountRecommendSidebar'
