<template>
  <teleport to="body">
    <div class="rec-overlay" v-show="isOpen" @click.self="closeRecommend"></div>

    <aside
      ref="asideRef"
      class="rec-sidebar"
      :class="{ open: isOpen }"
      role="complementary"
      aria-label="商家推荐侧栏"
    >
      <header class="rec-header">
        <div class="left">
          <h3>商家推荐</h3>
          <span class="count" v-if="matches.length">候选 {{ matches.length }} 家</span>
        </div>
        <div class="actions">
          <button class="btn small" @click="pullFromRoute">从路径读取</button>
          <button class="btn small ghost" @click="closeRecommend">关闭</button>
        </div>
      </header>

      <section class="rec-body">
        <RecQueryForm v-model="query" @submit="runQuery" />
        <RecResultTable :items="matches" @add-compare="addCompare" />
      </section>

      <footer class="rec-footer">
        <div class="compare" v-if="compareList.length">
          <div class="label">对比区（{{ compareList.length }}）</div>
          <div class="chips">
            <div class="chip" v-for="v in compareList" :key="v.id">
              <span>{{ v.name }}</span>
              <button class="x" @click="removeCompare(v.id)">×</button>
            </div>
          </div>
        </div>
        <div v-else class="placeholder">从上方列表点击“加入对比”</div>
      </footer>

      <!-- 拖拽手柄（左侧边缘，拖动即可调宽） -->
      <div class="resize-handle" @mousedown="startResize" title="拖拽调整宽度"></div>
    </aside>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import RecQueryForm from '@/components/recommend/RecQueryForm.vue'
import RecResultTable from '@/components/recommend/RecResultTable.vue'
import type { Query, Vendor, MatchItem } from '@/types/recommend'
import { matchVendors } from '@/utils/recommendScore'
import { recommendSidebarOpen, closeRecommend } from '@/bridge/recommendUI'
import { getBridge, subscribeBridge } from '@/bridge/routeBridge'

const isOpen = computed(() => recommendSidebarOpen.value)

const vendors = ref<Vendor[]>([])
const matches = ref<MatchItem[]>([])
const compareList = ref<Vendor[]>([])
const query = ref<Query>({
  origin: { lat: 31.2304, lng: 121.4737 },
  destination: { lat: 31.1443, lng: 121.8091 },
  window: [new Date().toISOString(), new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()],
  demand: { type: 'normal', weightKg: 500, temperature: null },
  route: null
})

async function loadVendors() {
  try {
    const res = await fetch('/data/vendors.json')
    vendors.value = await res.json()
  } catch { vendors.value = [] }
}
function runQuery() {
  if (!vendors.value.length) return
  matches.value = matchVendors(query.value, vendors.value)
}
function addCompare(v: Vendor) {
  if (!compareList.value.find(x => x.id === v.id)) compareList.value.push(v)
}
function removeCompare(id: string) {
  compareList.value = compareList.value.filter(v => v.id !== id)
}
function pullFromRoute() {
  const data = getBridge?.()
  if (!data) return
  query.value.origin = data.origin
  query.value.destination = data.destination
  query.value.route = data.route
  if (data.window) query.value.window = data.window
  runQuery()
}

onMounted(async () => {
  // 记忆上次宽度（可选）
  const el = asideRef.value
  const saved = Number(localStorage.getItem('rec-width') || '')
  if (el && saved && !Number.isNaN(saved)) {
    el.style.setProperty('--rec-width', saved + 'px')
  }

  await loadVendors()
  runQuery()

  // 路线桥接（可选）
  try {
    subscribeBridge?.((data) => {
      query.value.origin = data.origin
      query.value.destination = data.destination
      query.value.route = data.route
      if (data.window) query.value.window = data.window
      runQuery()
    })
  } catch {}
})

/* ====== 拖拽调宽 ====== */
const asideRef = ref<HTMLElement | null>(null)
function startResize(e: MouseEvent) {
  e.preventDefault()
  const el = asideRef.value
  if (!el) return

  const startX = e.clientX
  const startW = el.offsetWidth
  const maxW = Math.min(window.innerWidth * 0.9, 1440) // 最大 90% 宽或 1440px
  const minW = 360                                     // 最小 360px

  const onMove = (ev: MouseEvent) => {
    const dx = startX - ev.clientX            // 向左拖动为正 → 宽度增大
    let w = startW + dx
    w = Math.max(minW, Math.min(maxW, w))
    el.style.setProperty('--rec-width', w + 'px')
    localStorage.setItem('rec-width', String(w)) // 持久化
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>

<style scoped>
.rec-overlay{
  position: fixed; inset: 0; background: rgba(0,0,0,.25);
  backdrop-filter: blur(2px);
  z-index: 90;
}

/* 使用 CSS 变量控制宽度：默认“约半屏”，拖拽后写入像素值 */
.rec-sidebar{
  position: fixed; top: 0;
  width: var(--rec-width, clamp(420px, 50vw, 960px));
  right: calc(-1 * var(--rec-width, clamp(420px, 50vw, 960px))); /* 收起时完全移出屏幕 */
  height: 100dvh;
  background: var(--panel-bg, #4468e0); border-left: 1px solid rgba(0,0,0,.08);
  box-shadow: -16px 0 40px rgba(0,0,0,.14);
  z-index: 95; display: grid; grid-template-rows: auto 1fr auto;
  transition: right .28s ease;
}
.rec-sidebar.open{ right: 0; }

.rec-header{
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding: 10px 12px; border-bottom:1px solid rgba(0,0,0,.08);
}
.rec-header h3{ margin:0; font-size:16px; }
.rec-header .count{ font-size:12px; opacity:.65; margin-left:8px; }
.rec-header .actions{ display:flex; gap:8px; }

.rec-body{ padding: 10px 12px; overflow:auto; }
.rec-footer{ padding: 8px 12px; border-top:1px solid rgba(0,0,0,.08); }
.compare{ display:flex; flex-direction:column; gap:6px; }
.chips{ display:flex; flex-wrap:wrap; gap:6px; }
.chip{ display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:16px; border:1px solid #e3e3e3; background:#fafafa; }
.chip .x{ border:none; background:transparent; cursor:pointer; font-size:14px; }
.placeholder{ font-size:12px; opacity:.6; }

.btn.small{ padding:6px 10px; font-size:12px; border:1px solid #ddd; background:#fff; border-radius:8px; cursor:pointer; }
.btn.small.ghost{ background:transparent; }
.btn.small:hover{ background:#f5f5f5; }

/* 拖拽手柄（在左边缘，略微探出一点方便抓取） */
.resize-handle{
  position: absolute; left: -6px; top: 0; width: 6px; height: 100%;
  cursor: ew-resize; background: transparent;
}
.resize-handle:hover{ background: rgba(0,0,0,.06); }
</style>
