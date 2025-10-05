<template>
  <div class="center-logistics-view">
    <div class="toolbar">
      <input v-model="term" placeholder="搜索编号/名称/区域..." @keyup.enter="doSearch" />
      <button @click="doSearch">搜索</button>
      <button @click="refresh" :disabled="loading">刷新</button>
      <span v-if="!loading" class="stat">中心: {{ centers.length }} | 仓库: {{ totalHubs }}</span>
      <span v-else>加载中...</span>
    </div>

    <div v-if="error" class="error">加载失败: {{ String(error) }}</div>

    <div v-if="results.length" class="search-results">
      <h3>搜索结果 ({{ results.length }})</h3>
      <ul>
        <li v-for="r in results" :key="r.center.key + '-' + r.hub.code" @click="scrollTo(r.center.key)">
          <strong>{{ r.hub.code }}号</strong> {{ r.hub.name }} <small>[{{ r.center.key }}]</small>
          <template v-if="r.hub.regions.length">
            <br><span class="regions">区域: {{ r.hub.regions.slice(0,5).join('、') }}<span v-if="r.hub.regions.length>5">...</span></span>
          </template>
        </li>
      </ul>
    </div>

    <div v-for="c in centers" :key="c.key" class="center-block" :id="c.key">
      <header @click="toggle(c.key)">
        <h2>{{ c.key }} <small>({{ c.hubs.length }})</small></h2>
        <button class="mini" @click.stop="toggle(c.key)">{{ collapsed.has(c.key) ? '展开' : '折叠' }}</button>
      </header>
      <transition name="fade">
        <table v-if="!collapsed.has(c.key)" class="hub-table">
          <thead>
            <tr><th style="width:60px">编号</th><th style="width:160px">名称</th><th>区域(前8)</th><th style="width:200px">电话</th><th>原始片段(最多2条)</th></tr>
          </thead>
          <tbody>
            <tr v-for="h in c.hubs" :key="h.code" :class="rowClass(c.key, h)">
              <td class="code-cell">{{ h.code }}</td>
              <td>{{ h.name }}</td>
              <td>{{ h.regions.slice(0,8).join('、') }}</td>
              <td>{{ h.phones.join(' / ') }}</td>
              <td class="raw">
                <div v-for="rl in h.rawLines.slice(0,2)" :key="rl" class="raw-line" :title="rl">{{ rl }}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useCenterFocusedLogistics } from '@/composables/useCenterFocusedLogistics';

const term = ref('');
const results = ref<any[]>([]);
const collapsed = ref<Set<string>>(new Set());
const { load, loading, error, centers, totalHubs, search } = useCenterFocusedLogistics();

onMounted(() => { load(); });

function doSearch() { results.value = term.value.trim() ? search(term.value) : []; }
function refresh() { load(true); doSearch(); }
function toggle(key: string) { if (collapsed.value.has(key)) collapsed.value.delete(key); else collapsed.value.add(key); }
function scrollTo(key: string) {
  const el = document.getElementById(key);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  collapsed.value.delete(key);
}

function rowClass(centerKey: string, hub: any) {
  const hit = results.value.some(r => r.center.key === centerKey && r.hub.code === hub.code);
  return { hit };
}
</script>

<style scoped>
.center-logistics-view { font:14px/1.5 system-ui; }
.toolbar { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; margin-bottom:1rem; }
.toolbar input { padding:.45rem .6rem; border:1px solid #ccc; border-radius:4px; min-width:240px; }
.toolbar button { padding:.45rem .9rem; border:none; background:#2563eb; color:#fff; border-radius:4px; cursor:pointer; }
.toolbar button:hover { background:#1d4ed8; }
.stat { color:#555; }
.error { color:#b91c1c; margin-bottom:1rem; }
.search-results { background:#f1f5f9; border:1px solid #e2e8f0; padding:.75rem 1rem; border-radius:6px; margin-bottom:1rem; }
.search-results ul { list-style:none; padding:0; margin:0; display:grid; gap:.5rem; }
.search-results li { background:#fff; border:1px solid #e5e7eb; padding:.45rem .6rem; border-radius:4px; cursor:pointer; }
.search-results li:hover { background:#e2e8f0; }
.center-block { margin-bottom:1.25rem; border:1px solid #e5e7eb; border-radius:6px; background:#fff; }
.center-block header { display:flex; align-items:center; justify-content:space-between; padding:.5rem .75rem; cursor:pointer; background:#f8fafc; border-bottom:1px solid #e5e7eb; }
.center-block h2 { font-size:15px; margin:0; }
.center-block h2 small { font-weight:400; color:#666; }
button.mini { background:#64748b; padding:.25rem .6rem; font-size:12px; }
button.mini:hover { background:#475569; }
.hub-table { width:100%; border-collapse:collapse; font-size:13px; }
.hub-table th, .hub-table td { border:1px solid #e2e8f0; padding:.35rem .45rem; text-align:left; vertical-align:top; }
.hub-table th { background:#1f2937; color:#f1f5f9; font-weight:600; letter-spacing:.5px; }
.hub-table tbody tr:nth-child(odd) { background:#ffffff; }
.hub-table tbody tr:nth-child(even) { background:#f8fafc; }
.hub-table tbody tr:hover { background:#ffeab6; }
.hub-table tbody tr.hit { background:#fde68a !important; box-shadow:inset 0 0 0 1px #d97706; }
.code-cell { font-weight:600; color:#111827; }
.center-block { box-shadow:0 1px 2px rgba(0,0,0,.04); }
.center-block header { background:linear-gradient(90deg,#1e3a8a,#1d4ed8); color:#fff; }
.center-block h2 small { color:#e2e8f0; }
button.mini { background:#334155; }
button.mini:hover { background:#1e293b; }
.toolbar button { background:#0f62fe; }
.toolbar button:hover { background:#0043ce; }
.search-results { background:#fff; }
.search-results h3 { margin-top:0; font-size:14px; }
.search-results li { border-left:4px solid transparent; }
.search-results li:hover { border-left-color:#2563eb; }
.raw-line { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:380px; }
.fade-enter-active, .fade-leave-active { transition: opacity .18s ease; }
.fade-enter-from, .fade-leave-to { opacity:0; }
</style>
