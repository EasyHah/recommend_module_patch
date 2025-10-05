import { ref, computed } from 'vue';
import type { CenterFocusedDataFile, CenterFocusedCenter, CenterFocusedHub } from '@/types/logisticsByCenter';

const dataRef = ref<CenterFocusedDataFile | null>(null);
const loading = ref(false);
const error = ref<unknown>(null);

export function useCenterFocusedLogistics() {
  async function load(force=false) {
    if (dataRef.value && !force) return;
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch('/src/data/logistics-by-center.json');
      if (!res.ok) throw new Error('获取 center-focused 数据失败');
      const json = await res.json() as CenterFocusedDataFile;
      dataRef.value = json;
    } catch (e) {
      error.value = e;
    } finally {
      loading.value = false;
    }
  }

  const centers = computed<CenterFocusedCenter[]>(() => dataRef.value?.centers || []);
  const totalHubs = computed(() => centers.value.reduce((a,c)=>a + c.hubs.length, 0));

  function search(term: string) {
    term = term.trim();
    if (!term) return [] as { center: CenterFocusedCenter; hub: CenterFocusedHub }[];
    const lower = term.toLowerCase();
    const results: { center: CenterFocusedCenter; hub: CenterFocusedHub }[] = [];
    for (const c of centers.value) {
      for (const h of c.hubs) {
        if (h.code === term || h.name.toLowerCase().includes(lower) || h.regions.some(r=>r.toLowerCase().includes(lower))) {
          results.push({ center: c, hub: h });
        }
      }
    }
    return results.slice(0,200);
  }

  function getCenter(key: string) {
    return centers.value.find(c => c.key === key);
  }

  return { load, loading, error, data: dataRef, centers, totalHubs, search, getCenter };
}
