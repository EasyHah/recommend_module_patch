<template>
  <div class="page">
    <RecQueryForm v-model="query" @submit="runQuery" />
    <RecResultTable :items="matches" @add-compare="addCompare" @open-compare="drawerOpen=true" />
    <CompareDrawer :open="drawerOpen" :items="compareList" @close="drawerOpen=false" @remove="removeCompare" />
    <button class="compare-fab" @click="drawerOpen=!drawerOpen" :title="compareList.length ? `已选 ${compareList.length} 家` : `暂无候选，先从表格中加入对比`">对比({{ compareList.length }})</button>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import RecQueryForm from '@/components/recommend/RecQueryForm.vue';
import RecResultTable from '@/components/recommend/RecResultTable.vue';
import CompareDrawer from '@/components/recommend/CompareDrawer.vue';
import type { Query, Vendor, MatchItem } from '@/types/recommend';
import { matchVendors } from '@/utils/recommendScore';
const vendors = ref<Vendor[]>([]); const matches = ref<MatchItem[]>([]);
const drawerOpen = ref(false); const compareList = ref<Vendor[]>([]);
const query = ref<Query>({ origin:{lat:31.2304,lng:121.4737}, destination:{lat:31.299, lng:121.3846}, window:[new Date().toISOString(), new Date(Date.now()+4*3600e3).toISOString()], demand:{type:'normal',weightKg:500,temperature:null} });
async function loadVendors(){ const res = await fetch('/data/vendors.json'); vendors.value = await res.json(); }
function runQuery(){ if(!vendors.value.length) return; matches.value = matchVendors(query.value, vendors.value); }
function addCompare(v: Vendor){ if(!compareList.value.find(x=>x.id===v.id)) compareList.value.push(v); drawerOpen.value = true; }
function removeCompare(id:string){ compareList.value = compareList.value.filter(v=>v.id!==id); }
onMounted(async ()=>{ await loadVendors(); runQuery(); });
</script>
<style scoped>
.page{ padding: 8px; display:flex; flex-direction:column; gap:12px; }
.compare-fab{
  position: fixed; right: 14px; bottom: 16px;
  background: #2962ff; color:#fff; border:none; padding:10px 14px;
  border-radius: 999px; box-shadow: 0 6px 18px rgba(41,98,255,.28);
  z-index: 2000;
}
</style>
