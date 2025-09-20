<template>
  <div class="settings">
    <header class="header">
      <h3>跟踪设置</h3>
      <button class="reset" @click="reset">重置</button>
    </header>
    <div class="row">
      <label>平滑系数 α</label>
      <input type="range" min="0.2" max="0.9" step="0.05" v-model.number="smoothingAlpha" @input="apply"/>
      <span>{{ smoothingAlpha.toFixed(2) }}</span>
    </div>
    <div class="row">
      <label>IoU 匹配阈值</label>
      <input type="range" min="0.2" max="0.8" step="0.05" v-model.number="iouThreshold" @input="apply"/>
      <span>{{ iouThreshold.toFixed(2) }}</span>
    </div>
    <div class="row">
      <label>置信度阈值</label>
      <input type="range" min="0.1" max="0.9" step="0.05" v-model.number="confidenceThreshold" @input="apply"/>
      <span>{{ confidenceThreshold.toFixed(2) }}</span>
    </div>
    <div class="row">
      <label>允许丢失帧</label>
      <input type="range" min="1" max="15" step="1" v-model.number="maxTrackMisses" @input="apply"/>
      <span>{{ maxTrackMisses }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { getRecognitionService } from '@/services/recognition'

const service = getRecognitionService()
const opts = service.getOptions() as any

const smoothingAlpha = ref<number>(opts.smoothingAlpha ?? 0.6)
const iouThreshold = ref<number>(opts.iouThreshold ?? 0.5)
const confidenceThreshold = ref<number>(opts.confidenceThreshold ?? 0.25)
const maxTrackMisses = ref<number>(opts.maxTrackMisses ?? 5)

function apply() {
  service.updateOptions({
    smoothingAlpha: smoothingAlpha.value,
    iouThreshold: iouThreshold.value,
    confidenceThreshold: confidenceThreshold.value,
    maxTrackMisses: maxTrackMisses.value,
  })
}

function reset() {
  smoothingAlpha.value = 0.6
  iouThreshold.value = 0.5
  confidenceThreshold.value = 0.25
  maxTrackMisses.value = 5
  apply()
}

// 若服务参数变更（来自其它地方），同步面板状态
watchEffect(() => {
  const o = service.getOptions() as any
  smoothingAlpha.value = o.smoothingAlpha ?? smoothingAlpha.value
  iouThreshold.value = o.iouThreshold ?? iouThreshold.value
  confidenceThreshold.value = o.confidenceThreshold ?? confidenceThreshold.value
  maxTrackMisses.value = o.maxTrackMisses ?? maxTrackMisses.value
})
</script>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.header { display:flex; align-items:center; justify-content:space-between; }
.reset { border:1px solid rgba(255,255,255,.2); background:transparent; color:#fff; padding:4px 10px; border-radius:8px; cursor:pointer; }
.row { display:flex; align-items:center; gap:10px; }
label { width: 110px; opacity:.9; }
input[type="range"] { flex:1; }
span { min-width:44px; text-align:right; }
</style>
