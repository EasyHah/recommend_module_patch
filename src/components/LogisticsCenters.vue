<template>
  <div class="logistics-centers">
    <div class="toolbar">
      <input v-model="term" placeholder="搜索编号/城市/区域..." @keyup.enter="doSearch" />
      <button @click="doSearch">搜索</button>
      <span class="stat" v-if="!loading">中心: {{ centers.length }} | 站点: {{ totalHubs }}</span>
      <span v-else>加载中...</span>
    </div>
    <div v-if="error" class="error">加载失败: {{ String(error) }}</div>

    <div v-if="results && results.length" class="search-results">
      <h3>搜索结果 ({{ results.length }})</h3>
      <ul>
        <li v-for="r in results" :key="r.center.id + '-' + r.hub.code">
          <strong>{{ r.hub.code }}号</strong> {{ r.hub.name }}
          <small> [{{ r.center.title }}] </small>
          <template v-if="r.hub.regions?.length">
            <br/><span class="regions">区域: {{ r.hub.regions.slice(0,8).join('、') }}<span v-if="r.hub.regions.length>8">...</span></span>
          </template>
          <template v-if="r.hub.phones?.length">
            <br/><span class="phones">电话: {{ r.hub.phones.join(', ') }}</span>
          </template>
        </li>
      </ul>
    </div>

    <details v-for="c in centers" :key="c.id" open>
      <summary>{{ c.title }} <small>({{ c.hubs.length }})</small></summary>
      <table v-if="c.hubs.length" class="hub-table">
        <thead><tr><th>编号</th><th>名称</th><th>区域(前5)</th><th>电话</th></tr></thead>
        <tbody>
          <tr v-for="h in c.hubs" :key="h.code + h.name">
            <td>{{ h.code }}</td>
            <td>{{ h.name }}</td>
            <td>{{ (h.regions || []).slice(0,5).join('、') }}</td>
            <td>{{ (h.phones || []).join(' / ') }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">无站点数据</p>
    </details>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useLogisticsData } from '../composables/useLogisticsData';

const term = ref('');
const results = ref<any[]>([]);
const { load, loading, error, centers, totalHubs, search } = useLogisticsData();

onMounted(() => { load(); });

function doSearch() {
  if (!term.value.trim()) {
    results.value = [];
    return;
  }
  results.value = search(term.value).slice(0,100);
}
</script>

<style scoped>
.logistics-centers { font:14px/1.4 sans-serif; padding:1rem; }
.toolbar { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin-bottom:1rem; }
.toolbar input { padding:.4rem .6rem; border:1px solid #ccc; border-radius:4px; min-width:240px; }
.toolbar button { padding:.45rem .9rem; background:#2563eb; color:#fff; border:none; border-radius:4px; cursor:pointer; }
.toolbar button:hover { background:#1d4ed8; }
.stat { color:#555; }
.error { color:#b91c1c; margin-bottom:1rem; }
.search-results { background:#f8fafc; border:1px solid #e2e8f0; padding:.75rem 1rem; border-radius:6px; margin-bottom:1rem; }
.search-results ul { list-style:none; padding-left:0; margin:0; display:grid; gap:.5rem; }
.search-results li { background:#fff; border:1px solid #e5e7eb; padding:.5rem .75rem; border-radius:4px; }
.hub-table { width:100%; border-collapse:collapse; margin:.5rem 0 1rem; }
.hub-table th, .hub-table td { border:1px solid #ddd; padding:.4rem .5rem; text-align:left; }
.hub-table th { background:#f1f5f9; }
.empty { color:#888; }
summary { cursor:pointer; font-weight:600; margin-top:1rem; }
.regions, .phones { color:#555; font-size:12px; }
</style>
