<template>
  <FluentCard title="匹配结果">
    <div class="toolbar">
      <div class="left">共 <b>{{ items.length }}</b> 条（可行：<b>{{ feasibleCount }}</b>）</div>
      <div class="right">
        <label>排序</label>
        <select v-model="sortKey">
          <option value="score">综合</option><option value="distance">距离</option><option value="rating">评分</option><option value="price">价格指数</option><option value="onTime">准点率</option>
        </select>
        <button class="btn small" @click="$emit('open-compare')">打开对比</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="tab">
        <thead><tr><th style="width:28%">商家</th><th>距离(km)</th><th>能力</th><th>评分</th><th>准点率</th><th>价格指数</th><th>标签</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="m in sorted" :key="m.vendor.id" :class="{unfeasible: !m.feasible}">
            <td><div class="name">{{ m.vendor.name }}</div><div class="tips" v-if="!m.feasible">{{ m.reasons.join('；') }}</div><div class="tips" v-else>综合分：{{ m.score }}</div></td>
            <td class="num">{{ m.distanceKm.toFixed(1) }}</td>
            <td class="cap"><span>载重≤{{ m.vendor.capabilities.maxWeightKg }}kg</span><span v-if="m.vendor.capabilities.types.includes('cold')">/ 冷链</span><span v-if="m.vendor.capabilities.types.includes('hazmat')">/ 危化</span><span v-if="m.vendor.capabilities.cold">/ {{ m.vendor.capabilities.cold!.min }}~{{ m.vendor.capabilities.cold!.max }}℃</span></td>
            <td class="num">{{ m.vendor.metrics.rating.toFixed(1) }}</td>
            <td class="num">{{ (m.vendor.metrics.onTimeRate*100).toFixed(0) }}%</td>
            <td class="num">{{ m.vendor.metrics.priceIndex.toFixed(2) }}</td>
            <td><div class="tags"><span v-for="t in m.buckets" :key="t" class="tag">{{ t }}</span></div></td>
            <td><button class="btn small" :disabled="!m.feasible" @click="$emit('add-compare', m.vendor)">加入对比</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </FluentCard>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'; import FluentCard from '@/components/FluentCard.vue'; import type { MatchItem, Vendor } from '@/types/recommend';
const props = defineProps<{ items: MatchItem[] }>();
defineEmits<{ (e:'add-compare', v: Vendor):void; (e:'open-compare'):void }>();
const sortKey = ref<'score'|'distance'|'rating'|'price'|'onTime'>('score');
const feasibleCount = computed(()=> props.items.filter(i=>i.feasible).length);
const sorted = computed(()=>{ const arr=[...props.items]; switch(sortKey.value){ case 'distance': return arr.sort((a,b)=> a.distanceKm-b.distanceKm); case 'rating': return arr.sort((a,b)=> b.vendor.metrics.rating-a.vendor.metrics.rating); case 'price': return arr.sort((a,b)=> a.vendor.metrics.priceIndex-b.vendor.metrics.priceIndex); case 'onTime': return arr.sort((a,b)=> b.vendor.metrics.onTimeRate-a.vendor.metrics.onTimeRate); default: return arr.sort((a,b)=> b.score-a.score);} });
</script>
<style scoped>
.toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.toolbar .left{color:#969191}.toolbar .right{display:flex;gap:8px;align-items:center}
.table-wrap{border:1px solid #3a3737;border-radius:12px;overflow:hidden}table.tab{width:100%;border-collapse:collapse;background:#3e56a5}
th,td{padding:10px 12px;border-bottom:1px solid #0f2444;text-align:left}th{background:#3e56a5;font-weight:600;color:#ebe4e4}td.num{text-align:right;font-variant-numeric:tabular-nums}
.name{font-weight:600;color:#222}.tips{color:#97e075;font-size:12px;margin-top:2px}.cap{color:#f1f3ff}.tags{display:flex;gap:6px;flex-wrap:wrap}.tag{background:#f1f3ff;color:#3445ff;border:1px solid #dfe3ff;padding:2px 6px;border-radius:999px;font-size:12px}
.unfeasible{opacity:.55}.btn.small{padding:6px 10px;border:1px solid #ccc;border-radius:10px;background:#3e56a5}.btn.small:disabled{opacity:.5;cursor:not-allowed}
</style>
