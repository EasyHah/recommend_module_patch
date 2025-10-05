import { ref, computed } from 'vue';
import type { LogisticsDataFile, LogisticsCenter, LogisticsHub } from '../types/logistics';

const dataRef = ref<LogisticsDataFile | null>(null);
const loading = ref(false);
const error = ref<unknown>(null);

export function useLogisticsData() {
  async function load() {
    if (dataRef.value || loading.value) return;
    loading.value = true;
    try {
      const res = await fetch('/src/data/logistics.json');
      if (!res.ok) throw new Error('Failed to fetch logistics.json');
      const json = await res.json() as LogisticsDataFile;
      dataRef.value = json;
    } catch (e) {
      error.value = e;
    } finally {
      loading.value = false;
    }
  }

  const centers = computed<LogisticsCenter[]>(() => dataRef.value?.centers || []);
  const totalHubs = computed(() => centers.value.reduce((acc,c)=>acc + c.hubs.length, 0));

  function search(term: string) {
    term = term.trim();
    if (!term) return [] as { center: LogisticsCenter; hub: LogisticsHub }[];
    const lower = term.toLowerCase();
    const results: { center: LogisticsCenter; hub: LogisticsHub }[] = [];
    for (const c of centers.value) {
      for (const h of c.hubs) {
        const regionStr = (h.regions||[]).join(' ');
        if (
          h.code === term ||
          h.name.toLowerCase().includes(lower) ||
          regionStr.toLowerCase().includes(lower)
        ) {
          results.push({ center: c, hub: h });
        }
      }
    }
    return results;
  }

  return { load, loading, error, data: dataRef, centers, totalHubs, search };
}
