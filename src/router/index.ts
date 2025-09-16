import RoutePlan from '@/views/RoutePlan.vue'
import Recommend from '@/views/Recommend.vue'
import WeatherAnalysis from '@/views/WeatherAnalysis.vue'
import WeatherTest from '@/views/WeatherTest.vue'
import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '@/views/Dashboard.vue'
import GuScene from '@/modules/gu/GuScene.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path:'/route', name:'route', component: RoutePlan },
    { path:'/recommend', name:'recommend', component: Recommend },
    { path:'/weather', name:'weather', component: WeatherAnalysis },
    { path:'/weather-test', name:'weather-test', component: WeatherTest },
    { path:'/', name:'dashboard', component: Dashboard },
    { path:'/scene/gu', name:'gu-scene', component: GuScene }
  ]
})

export default router