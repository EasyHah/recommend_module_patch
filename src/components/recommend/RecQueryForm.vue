<template>
  <FluentCard title="运输需求查询" class="mb-4">
    <form @submit.prevent="$emit('submit')" class="grid gap-3">
      <div class="grid grid-cols-2 gap-12">
        <div><h4 class="sec-title">起点坐标</h4>
          <div class="row"><label>纬度</label><input v-model.number="local.origin.lat" type="number" step="0.0001" required /></div>
          <div class="row"><label>经度</label><input v-model.number="local.origin.lng" type="number" step="0.0001" required /></div>
        </div>
        <div><h4 class="sec-title">终点坐标</h4>
          <div class="row"><label>纬度</label><input v-model.number="local.destination.lat" type="number" step="0.0001" required /></div>
          <div class="row"><label>经度</label><input v-model.number="local.destination.lng" type="number" step="0.0001" required /></div>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-12">
        <div><h4 class="sec-title">时间窗</h4>
          <div class="row"><label>开始</label><input v-model="startLocal" type="datetime-local" required /></div>
          <div class="row"><label>结束</label><input v-model="endLocal" type="datetime-local" required /></div>
        </div>
        <div><h4 class="sec-title">需求</h4>
          <div class="row"><label>类型</label>
            <select v-model="local.demand.type"><option value="normal">普货</option><option value="cold">冷链</option><option value="hazmat">危化</option><option value="fragile">易碎</option></select>
          </div>
          <div class="row"><label>载重(kg)</label><input v-model.number="local.demand.weightKg" type="number" min="1" required /></div>
          <div v-if="local.demand.type==='cold'" class="row"><label>温区(℃)</label>
            <div class="inline"><input v-model.number="tempMin" type="number" step="0.1" placeholder="min" /><span class="sep">~</span><input v-model.number="tempMax" type="number" step="0.1" placeholder="max" /></div>
          </div>
        </div>
      </div>
      <div class="actions"><button type="submit" class="btn primary">查询</button><button type="button" class="btn" @click="reset">重置</button></div>
    </form>
  </FluentCard>
</template>
<script setup lang="ts">
import { computed, reactive, watch } from 'vue'; import FluentCard from '@/components/FluentCard.vue'; import type { Query } from '@/types/recommend';
const props = defineProps<{ modelValue: Query }>(); const emit = defineEmits<{ (e:'update:modelValue', v: Query):void; (e:'submit'):void }>();
const local = reactive<Query>(JSON.parse(JSON.stringify(props.modelValue)));
const startLocal = computed({ get:()=>props.modelValue.window[0]?.slice(0,16)??'', set:v=> local.window[0]= v? new Date(v).toISOString(): '' });
const endLocal   = computed({ get:()=>props.modelValue.window[1]?.slice(0,16)??'', set:v=> local.window[1]= v? new Date(v).toISOString(): '' });
const tempMin = computed({ get:()=> local.demand.temperature?.[0] ?? null, set:(x:number|null)=>{const m= local.demand.temperature?.[1] ?? null; local.demand.temperature= x==null && m==null ? null : [x??0,m??0];}});
const tempMax = computed({ get:()=> local.demand.temperature?.[1] ?? null, set:(x:number|null)=>{const n= local.demand.temperature?.[0] ?? null; local.demand.temperature= n==null && x==null ? null : [n??0,x??0];}});
watch(local, v=> emit('update:modelValue', JSON.parse(JSON.stringify(v))), {deep:true});
function reset(){ local.origin={lat:31.2304,lng:121.4737}; local.destination={lat:31.299, lng:121.3846}; local.window=[new Date().toISOString(), new Date(Date.now()+4*3600e3).toISOString()]; local.demand={type:'normal', weightKg:500, temperature:null}; }
</script>
<style scoped>
.grid{display:grid}
.grid-cols-2{grid-template-columns:1fr 1fr}
.gap-12,
.gap-3{gap:12px}
.mb-4{margin-bottom:16px}
.row{display:flex;align-items:center;gap:8px;margin:6px 0}
.row label{width:68px;color:#b8b3b3}.row input,
.row select{flex:1;padding:8px 10px;border:1px solid #3f5ea1;
border-radius:8px;background:#3f5ea1}
.inline{display:flex;align-items:center;gap:6px}
.sep{color:#eee2e2}
.actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}
.btn{padding:8px 14px;border-radius:10px;border:1px solid #ec9c24;
background:#ec9c24}
.btn.primary{background:#2962ff;color:#fff;border-color:#2962ff}
.sec-title{margin:4px 0 6px;color:#e0d8d8;font-weight:600}
</style>
