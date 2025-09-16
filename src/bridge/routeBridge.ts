import { ref, watch } from 'vue';
import type { LatLng, RouteMetrics } from '@/types/recommend';

export type BridgePayload = {
  origin: LatLng;
  destination: LatLng;
  route: RouteMetrics;
  window?: [string, string];
};

const lastRoute = ref<BridgePayload | null>(null);
const KEY = 'route-bridge/latest';

export function publishBridge(data: BridgePayload) {
  lastRoute.value = data;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

export function getBridge(): BridgePayload | null {
  if (lastRoute.value) return lastRoute.value;
  try {
    const cached = localStorage.getItem(KEY);
    if (cached) return JSON.parse(cached) as BridgePayload;
  } catch {}
  return null;
}

export function clearBridge() {
  lastRoute.value = null;
  try { localStorage.removeItem(KEY); } catch {}
}

export function subscribeBridge(cb: (data: BridgePayload)=>void) {
  const data = getBridge();
  if (data) cb(data);
  const stop = watch(lastRoute, (v) => { if (v) cb(v as BridgePayload); }, { immediate: false });
  return () => stop();
}

/* ====== 兼容别名（供 RecommendSidebar 等代码使用）====== */
export type RoutePacket = BridgePayload;
export function publishRoute(data: RoutePacket){ publishBridge(data); }
