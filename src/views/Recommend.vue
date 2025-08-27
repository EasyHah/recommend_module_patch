<template>
  <div class="page">
    <RecQueryForm v-model="query" @submit="handleSubmit" />
    <AmapRoute
      ref="amapRef"
      :origin="query.origin"
      :destination="query.destination"
      :mode="routeMode"
    />
    <RecResultTable
      :items="matches"
      @add-compare="addCompare"
      @open-compare="drawerOpen=true"
    />
    <CompareDrawer
      :open="drawerOpen"
      :items="compareList"
      @close="drawerOpen=false"
      @remove="removeCompare"
    />
    <button
      class="compare-fab"
      @click="drawerOpen=!drawerOpen"
      :title="compareList.length ? `已选 ${compareList.length} 家` : `暂无候选，先从表格中加入对比`"
    >
      对比({{ compareList.length }})
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import RecQueryForm from '@/components/recommend/RecQueryForm.vue'
import RecResultTable from '@/components/recommend/RecResultTable.vue'
import CompareDrawer from '@/components/recommend/CompareDrawer.vue'
import AmapRoute from '@/components/map/AmapRoute.vue'
import type { Query } from '@/types/recommend'
import { matchVendors } from '@/utils/recommendScore'

const amapRef = ref<InstanceType<typeof AmapRoute>|null>(null)
const routeMode = ref<'driving'|'walking'|'transit'|'riding'|'truck'>('driving')

const vendors = ref<any[]>([])
const matches = ref<any[]>([])
const drawerOpen = ref(false)
const compareList = ref<any[]>([])

const query = ref<Query>({
  origin:{lat:31.2304,lng:121.4737},
  destination:{lat:31.299,lng:121.3846},
  window:[ new Date().toISOString(), new Date(Date.now()+4*3600e3).toISOString() ],
  demand:{type:'normal',weightKg:500,temperature:null}
})

// ✅ 接收子组件带参的 submit，直接用载荷绘制路线（不依赖 v-model 回写时序）
function handleSubmit(q: Query) {
  if (!q?.origin || !q?.destination) return
  amapRef.value?.route(q.origin, q.destination, routeMode.value)
  // 如需刷新推荐表：
  // matches.value = matchVendors(q, vendors.value)
}

function runQuery(){
  if(!vendors.value.length) return
  matches.value = matchVendors(query.value as any, vendors.value as any)
}

function addCompare(v:any){
  if(!compareList.value.find((x:any)=>x.id===v.id)) compareList.value.push(v)
  drawerOpen.value = true
}

function removeCompare(id:string){
  compareList.value = compareList.value.filter((v:any)=>v.id!==id)
}
</script>

<style scoped>
.page{ padding:8px; display:flex; flex-direction:column; gap:12px; }
.compare-fab{ position:fixed; right:14px; bottom:16px; border:none; padding:10px 14px; border-radius:999px; z-index:2000; }
</style>
