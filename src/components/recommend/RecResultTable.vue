<template>
  <FluentCard title="匹配结果">
    <div class="toolbar">
      <div class="left">共 <b>{{ items.length }}</b> 条（可行：<b>{{ feasibleCount }}</b>）</div>
      <div class="right">
        <label>排序</label>
        <select v-model="sortKey">
          <option value="score">综合</option><option value="distance">距离</option><option value="rating">评分</option><option value="price">价格指数</option><option value="onTime">准点率</option><option value="weather">天气适应性</option>
        </select>
        <button class="btn small" @click="$emit('open-compare')">打开对比</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="tab">
        <thead><tr><th style="width:26%">商家</th><th>距离(km)</th><th>能力</th><th>评分</th><th>准点率</th><th>价格指数</th><th>天气适应性</th><th>标签</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="m in sorted" :key="m.vendor.id" :class="{unfeasible: !m.feasible}">
            <td><div class="name">{{ m.vendor.name }}</div><div class="tips" v-if="!m.feasible">{{ m.reasons.join('；') }}</div><div class="tips" v-else>综合分：{{ m.score }}</div></td>
            <td class="num">{{ m.distanceKm.toFixed(1) }}</td>
            <td class="cap"><span>载重≤{{ m.vendor.capabilities.maxWeightKg }}kg</span><span v-if="m.vendor.capabilities.types.includes('cold')">/ 冷链</span><span v-if="m.vendor.capabilities.types.includes('hazmat')">/ 危化</span><span v-if="m.vendor.capabilities.cold">/ {{ m.vendor.capabilities.cold!.min }}~{{ m.vendor.capabilities.cold!.max }}℃</span></td>
            <td class="num">{{ m.vendor.metrics.rating.toFixed(1) }}</td>
            <td class="num">{{ (m.vendor.metrics.onTimeRate*100).toFixed(0) }}%</td>
            <td class="num">{{ m.vendor.metrics.priceIndex.toFixed(2) }}</td>
            <td class="weather-info">
              <div v-if="m.weatherScore !== undefined" class="weather-score" :class="getWeatherRiskClass(m.weatherRisk)">
                {{ (m.weatherScore * 100).toFixed(0) }}%
              </div>
              <div v-if="m.weatherFactors?.length" class="weather-factors">
                {{ m.weatherFactors.join('、') }}
              </div>
              <div v-if="!m.weatherScore" class="no-weather">-</div>
            </td>
            <td><div class="tags"><span v-for="t in m.buckets" :key="t" class="tag" :class="getTagClass(t)">{{ t }}</span></div></td>
            <td><button class="btn small" :disabled="!m.feasible" @click="$emit('add-compare', m.vendor)">加入对比</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </FluentCard>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'; import FluentCard from '@/components/FluentCard.vue'; import type { MatchItem, Vendor } from '@/types/recommend'
import type { EnhancedMatchItem } from '@/types/weather'
const props = defineProps<{ items: EnhancedMatchItem[] }>();
defineEmits<{ (e:'add-compare', v: Vendor):void; (e:'open-compare'):void }>();
const sortKey = ref<'score'|'distance'|'rating'|'price'|'onTime'|'weather'>('score');
const feasibleCount = computed(()=> props.items.filter(i=>i.feasible).length);

const sorted = computed(()=>{ 
  const arr=[...props.items]; 
  switch(sortKey.value){ 
    case 'distance': return arr.sort((a,b)=> a.distanceKm-b.distanceKm); 
    case 'rating': return arr.sort((a,b)=> b.vendor.metrics.rating-a.vendor.metrics.rating); 
    case 'price': return arr.sort((a,b)=> a.vendor.metrics.priceIndex-b.vendor.metrics.priceIndex); 
    case 'onTime': return arr.sort((a,b)=> b.vendor.metrics.onTimeRate-a.vendor.metrics.onTimeRate);
    case 'weather': return arr.sort((a,b)=> (b.weatherScore || 0) - (a.weatherScore || 0));
    default: return arr.sort((a,b)=> b.score-a.score);
  } 
});

// 获取天气风险等级对应的CSS类
function getWeatherRiskClass(risk?: 'low' | 'medium' | 'high' | 'extreme') {
  switch (risk) {
    case 'low': return 'risk-low'
    case 'medium': return 'risk-medium'  
    case 'high': return 'risk-high'
    case 'extreme': return 'risk-extreme'
    default: return ''
  }
}

// 获取标签对应的CSS类
function getTagClass(tag: string) {
  const weatherTags = ['天气适宜', '天气一般', '天气影响', '恶劣天气', '注意温控', '防风加固', '防水防湿', '谨慎驾驶']
  return weatherTags.includes(tag) ? 'weather-tag' : ''
}
</script>
<style scoped>
.toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.toolbar .left{color:#969191}.toolbar .right{display:flex;gap:8px;align-items:center}
.table-wrap{border:1px solid #3a3737;border-radius:12px;overflow:hidden}table.tab{width:100%;border-collapse:collapse;background:#3e56a5}
th,td{padding:10px 12px;border-bottom:1px solid #0f2444;text-align:left}th{background:#3e56a5;font-weight:600;color:#ebe4e4}td.num{text-align:right;font-variant-numeric:tabular-nums}
.name{font-weight:600;color:#222}.tips{color:#97e075;font-size:12px;margin-top:2px}.cap{color:#f1f3ff}.tags{display:flex;gap:6px;flex-wrap:wrap}.tag{background:#f1f3ff;color:#3445ff;border:1px solid #dfe3ff;padding:2px 6px;border-radius:999px;font-size:12px}
.unfeasible{opacity:.55}.btn.small{padding:6px 10px;border:1px solid #ccc;border-radius:10px;background:#3e56a5}.btn.small:disabled{opacity:.5;cursor:not-allowed}

/* 天气信息样式 */
.weather-info { font-size: 12px; text-align: center; }
.weather-score { font-weight: bold; margin-bottom: 2px; }
.weather-factors { color: #888; font-size: 10px; }
.no-weather { color: #ccc; }

/* 天气风险等级样式 */
.risk-low { color: #22c55e; }
.risk-medium { color: #f59e0b; }
.risk-high { color: #ef4444; }
.risk-extreme { color: #dc2626; background: rgba(220, 38, 38, 0.1); }

/* 天气相关标签样式 */
.tag.weather-tag { 
  background: linear-gradient(45deg, #e0f2fe, #f0f9ff); 
  color: #0891b2; 
  border-color: #67e8f9; 
}
</style>
