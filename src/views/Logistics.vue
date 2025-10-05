<template>
  <div class="page-logistics">
    <h1>分拨中心与仓库站点</h1>
    <div class="layout">
      <div class="col list">
        <CenterLogisticsView />
      </div>
      <div class="col editor">
        <LogisticsEditor />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import CenterLogisticsView from '@/components/CenterLogisticsView.vue';
import LogisticsEditor from '@/components/LogisticsEditor.vue';
</script>
<style scoped>
.page-logistics { padding:1rem; }
.page-logistics h1 { margin:0 0 1rem; font-size:20px; }
.layout { display:flex; gap:1rem; align-items:flex-start; }
.layout .col { flex:1; min-width:0; }
.layout .editor { max-width:480px; }
@media (max-width:1100px){
  .layout { flex-direction:column; }
  .layout .editor { max-width:none; }
}
</style>
