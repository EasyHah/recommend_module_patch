import RoutePlan from '@/views/RoutePlan.vue'
import Recommend from '@/views/Recommend.vue'
import WeatherAnalysis from '@/views/WeatherAnalysis.vue'
import WeatherTest from '@/views/WeatherTest.vue'
import VideoRecognition from '@/views/VideoRecognition.vue'
import FireEvacuation from '@/views/FireEvacuation.vue'
import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '@/views/Dashboard.vue'
import LKETest from '@/views/LKETest.vue'
import Logistics from '@/views/Logistics.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path:'/route', name:'route', component: RoutePlan },
    { path:'/recommend', name:'recommend', component: Recommend },
    { path:'/weather', name:'weather', component: WeatherAnalysis },
    { path:'/weather-test', name:'weather-test', component: WeatherTest },
    { path:'/video-recognition', name:'video-recognition', component: VideoRecognition },
    { path:'/fire-evacuation', name:'fire-evacuation', component: FireEvacuation },
    { path:'/', name:'dashboard', component: Dashboard },
  { path:'/lke-test', name:'lke-test', component: LKETest },
  { path:'/logistics', name:'logistics', component: Logistics }
  ]
})

export default router