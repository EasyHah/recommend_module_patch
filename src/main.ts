import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import VFluent3 from '@creatorsn/vfluent3'
import './styles/theme.css'
createApp(App).use(createPinia()).use(router).use(VFluent3).mount('#app')

// Mount recommendation sidebar globally
import '@/bridge/mountRecommendSidebar'
