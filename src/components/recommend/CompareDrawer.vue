<template>
  <div class="backdrop" v-if="open" @click="$emit('close')" />
  <div class="drawer" :class="{open}">
    <div class="head"><div class="title">候选对比（{{ items.length }}）</div><button class="icon" @click="$emit('close')">✕</button></div>
    <div class="body">
      <div v-if="items.length===0" class="empty">从结果表格点击“加入对比”</div>
      <div v-else class="list">
        <div v-for="v in items" :key="v.id" class="card">
          <div class="top"><div class="name">{{ v.name }}</div><button class="remove" @click="$emit('remove', v.id)">移除</button></div>
          <div class="grid">
            <div><label>载重</label><b>{{ v.capabilities.maxWeightKg }}</b>kg</div><div><label>服务半径</label><b>{{ v.serviceRadiusKm }}</b>km</div>
            <div><label>评分</label><b>{{ v.metrics.rating.toFixed(1) }}</b></div><div><label>准点率</label><b>{{ (v.metrics.onTimeRate*100).toFixed(0) }}</b>%</div>
            <div><label>价格指数</label><b>{{ v.metrics.priceIndex.toFixed(2) }}</b></div><div><label>负载率</label><b>{{ (v.metrics.capacityUtilization*100).toFixed(0) }}</b>%</div>
          </div>
          <div class="tags"><span v-for="t in v.capabilities.types" :key="t" class="tag">#{{ zhType(t) }}</span><span v-if="v.capabilities.cold" class="tag">#{{ v.capabilities.cold!.min }}~{{ v.capabilities.cold!.max }}℃</span></div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import type { Vendor } from '@/types/recommend';
const props = defineProps<{ open: boolean; items: Vendor[] }>();
const emit = defineEmits<{ (e:'close'):void; (e:'remove', id: string):void }>();
function onKey(e: KeyboardEvent){ if((e.key==='Escape'||e.key==='Esc') && props.open){ emit('close'); } }
onMounted(()=> window.addEventListener('keydown', onKey));
onBeforeUnmount(()=> window.removeEventListener('keydown', onKey));
function zhType(t:'normal'|'cold'|'hazmat'|'fragile'){ return ({normal:'普货',cold:'冷链',hazmat:'危化',fragile:'易碎'})[t]; }
</script>
<style scoped>
.drawer{position:fixed;top:0;right:-380px;width:360px;height:100vh;background:#82a4ee;box-shadow:-8px 0 20px rgba(0,0,0,.08);border-left:1px solid #eee;transition:right .25s ease;z-index:2200;display:flex;flex-direction:column}
.drawer.open{right:0}.head{display:flex;align-items:center;justify-content:space-between;padding:12px 12px;border-bottom:1px solid #f0f0f0}.title{font-weight:700;color:#222}.icon{width:32px;height:32px;border-radius:8px;border:1px solid #eee;background:#3260c4}
.body{padding:12px;overflow:auto}.empty{color:#777;font-size:13px}.list{display:flex;flex-direction:column;gap:10px}.card{border:1px solid #eee;border-radius:12px;padding:10px;background:#50a0ce}
.top{display:flex;align-items:center;justify-content:space-between}.name{font-weight:600}.remove{border:1px solid #eee;background:#4f81df;color:#d00;padding:4px 8px;border-radius:8px}
.grid{margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:8px}.grid label{color:#777;margin-right:6px}.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.tag{background:#6b7de4;color:#3445ff;border:1px solid #626fd3;padding:2px 6px;border-radius:999px;font-size:12px}
.backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.28); z-index:2100; }
</style>
