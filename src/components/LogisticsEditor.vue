<template>
  <div class="logistics-editor">
    <h2>仓库信息编辑</h2>
    <div class="row">
      <label>分拨中心</label>
      <select v-model="centerId" @change="onCenterChange">
        <option value="" disabled>请选择中心</option>
        <option v-for="c in centers" :key="c.id" :value="c.id">{{ c.title }} ({{ c.hubCount }})</option>
      </select>
      <button @click="reloadCenters" :disabled="loadingCenters">刷新</button>
    </div>

    <div class="row" v-if="centerId">
      <label>仓库编号</label>
      <select v-model="selectedCode" @change="onHubChange">
        <option value="" disabled>选择或输入新编号...</option>
        <option v-for="h in currentCenterHubs" :key="h.code" :value="h.code">{{ h.code }} - {{ h.name }}</option>
      </select>
      <input v-model="selectedCode" placeholder="输入新的编号" style="max-width:140px" />
    </div>

    <form @submit.prevent="save" v-if="centerId && selectedCode" class="form">
      <div class="row">
        <label>名称</label>
        <input v-model="form.name" required />
      </div>
      <div class="row">
        <label>公司名称</label>
        <input v-model="form.company" placeholder="例: 金亮物流" />
      </div>
      <div class="row">
        <label>电话(多条用逗号)</label>
        <input v-model="phonesInput" placeholder="153********,0539-xxxxxxx" />
      </div>
      <div class="row">
        <label>运输范围(每行一个或逗号分隔)</label>
        <textarea v-model="regionsInput" rows="3" placeholder="绍兴, 台州, 太原..." />
      </div>
      <div class="row actions">
        <button type="submit" :disabled="saving">保存</button>
        <button type="button" class="danger" @click="del" v-if="existing" :disabled="saving">删除</button>
        <span v-if="message" class="msg">{{ message }}</span>
      </div>
    </form>

    <div v-if="searchResults.length" class="search-box">
      <h3>搜索结果 {{ searchResults.length }}</h3>
      <ul>
        <li v-for="r in searchResults" :key="r.centerId + r.code" @click="jump(r)">
          {{ r.centerTitle }} / {{ r.code }} - {{ r.name }} <span v-if="r.company">({{ r.company }})</span>
        </li>
      </ul>
    </div>

    <div class="row search-row">
      <input v-model="query" placeholder="搜索编号/区域/公司/电话" @keyup.enter="doSearch" />
      <button @click="doSearch">搜索</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

interface CenterSummary { id:string; title:string; hubCount:number }
interface HubDetail { code:string; name:string; regions?:string[]; phones?:string[]; company?:string }

const centers = ref<CenterSummary[]>([]);
const loadingCenters = ref(false);
const centerId = ref('');
const selectedCode = ref('');
const currentCenter = ref<any>(null);
const currentCenterHubs = ref<HubDetail[]>([]);
const existingHub = ref<HubDetail|null>(null);

const form = ref({ name:'', company:'', regions:[] as string[], phones:[] as string[] });
const phonesInput = ref('');
const regionsInput = ref('');
const message = ref('');
const saving = ref(false);
const query = ref('');
const searchResults = ref<any[]>([]);

async function api(path: string, options?: RequestInit) {
  const res = await fetch(path, { headers:{'Content-Type':'application/json'}, ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadCenters() {
  loadingCenters.value = true;
  try {
    const data = await api('/api/logistics/centers');
    centers.value = data.centers;
  } catch (e:any) {
    console.error(e);
  } finally { loadingCenters.value = false; }
}

function reloadCenters() { loadCenters(); }

async function onCenterChange() {
  if (!centerId.value) return;
  selectedCode.value = '';
  existingHub.value = null;
  try {
    const data = await api(`/api/logistics/centers/${encodeURIComponent(centerId.value)}`);
    currentCenter.value = data.center;
    currentCenterHubs.value = data.center.hubs || [];
  } catch (e) { console.error(e); }
}

async function onHubChange() {
  if (!centerId.value || !selectedCode.value) return;
  existingHub.value = currentCenterHubs.value.find(h => h.code === selectedCode.value) || null;
  if (existingHub.value) {
    form.value.name = existingHub.value.name;
    form.value.company = existingHub.value.company || '';
    form.value.regions = existingHub.value.regions || [];
    form.value.phones = existingHub.value.phones || [];
    phonesInput.value = form.value.phones.join(',');
    regionsInput.value = form.value.regions.join(',');
  } else {
    form.value = { name:'', company:'', regions:[], phones:[] };
    phonesInput.value='';
    regionsInput.value='';
  }
}

const existing = computed(()=>!!existingHub.value);

function parseListInput(v:string) {
  return v.split(/[\n,;，；\s]+/).map(s=>s.trim()).filter(Boolean);
}

async function save() {
  if (!centerId.value || !selectedCode.value) return;
  saving.value = true; message.value='';
  try {
    form.value.phones = parseListInput(phonesInput.value);
    form.value.regions = parseListInput(regionsInput.value);
    await api('/api/logistics/hubs', {
      method:'POST',
      body: JSON.stringify({
        centerId: centerId.value,
        centerTitle: centers.value.find(c=>c.id===centerId.value)?.title,
        code: selectedCode.value,
        name: form.value.name,
        regions: form.value.regions,
        phones: form.value.phones,
        company: form.value.company
      })
    });
    message.value = '已保存';
    await onCenterChange();
    existingHub.value = currentCenterHubs.value.find(h=>h.code===selectedCode.value) || null;
  } catch (e:any) { message.value = '保存失败: '+e.message; }
  finally { saving.value=false; }
}

async function del() {
  if (!centerId.value || !selectedCode.value) return;
  if (!confirm('确认删除该仓库记录(仅编辑层)？')) return;
  saving.value=true; message.value='';
  try {
    await api(`/api/logistics/hubs/${encodeURIComponent(centerId.value)}/${encodeURIComponent(selectedCode.value)}`, { method:'DELETE' });
    message.value='已删除';
    await onCenterChange();
    selectedCode.value='';
    existingHub.value=null;
  } catch (e:any) { message.value = '删除失败: '+e.message; }
  finally { saving.value=false; }
}

async function doSearch() {
  if (!query.value.trim()) { searchResults.value=[]; return; }
  try {
    const data = await api(`/api/logistics/search?q=${encodeURIComponent(query.value.trim())}`);
    searchResults.value = data.results;
  } catch (e) { console.error(e); }
}

function jump(r:any) {
  centerId.value = r.centerId;
  onCenterChange().then(()=>{
    selectedCode.value = r.code;
    onHubChange();
  });
}

loadCenters();
</script>

<style scoped>
.logistics-editor { border:1px solid #e5e7eb; padding:1rem; border-radius:8px; background:#fff; font:14px/1.5 system-ui; color:#111; }
.row { display:flex; align-items:center; gap:.75rem; margin-bottom:.75rem; flex-wrap:wrap; }
.row label { width:90px; font-weight:600; color:#111; }
.row input, .row select, .row textarea { flex:1; min-width:220px; padding:.45rem .6rem; border:1px solid #cbd5e1; border-radius:4px; font:inherit; }
.row textarea { resize:vertical; }
.actions button { min-width:90px; }
button { cursor:pointer; background:#2563eb; color:#fff; border:none; border-radius:4px; padding:.45rem .9rem; }
button:hover { background:#1d4ed8; }
button.danger { background:#dc2626; }
button.danger:hover { background:#b91c1c; }
.msg { color:#059669; font-size:13px; }
.search-row { margin-top:1.5rem; }
.search-box { margin-top:1rem; background:#f1f5f9; padding:.75rem; border-radius:6px; }
.search-box ul { list-style:none; padding:0; margin:0; max-height:260px; overflow:auto; }
.search-box li { padding:.35rem .4rem; border-bottom:1px solid #e2e8f0; cursor:pointer; }
.search-box li:hover { background:#e2e8f0; }
</style>
