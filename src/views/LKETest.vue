<template>
  <div class="lke-test">
    <h2>腾讯云 LKE 测试</h2>
    <div class="row">
      <button @click="onInit" :disabled="initializing">初始化</button>
      <button @click="onSend" :disabled="!isReady">发送消息</button>
    </div>
    <div class="row">
      <small>WS/SSE: {{ cfg.accessType }} ｜ WS Base: {{ cfg.wsBase }}</small>
    </div>
    <div class="row">
      <label>消息：</label>
      <input v-model="text" placeholder="输入要发送的消息" />
    </div>
    <div class="row">
      <label>状态：</label>
      <pre>{{ status }}</pre>
    </div>
    <div class="row">
      <label>消息记录：</label>
      <pre>{{ messages }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useLKEChat } from '@/composables/useLKEChat'

const { initialize, sendMessage, isReady, error, messages, cfg } = useLKEChat()
const text = ref('你好')
const initializing = ref(false)

const status = computed(() => ({
  ready: isReady.value,
  error: error.value || null
}))

async function onInit() {
  initializing.value = true
  await initialize()
  initializing.value = false
}

async function onSend() {
  if (!text.value.trim()) return
  await sendMessage(text.value.trim())
}
</script>

<style scoped>
.lke-test {
  padding: 16px;
  max-width: 960px;
  margin: 0 auto;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.5;
}
.row { margin: 8px 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
input {
  flex: 1;
  min-width: 220px;
  padding: 8px 10px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
}
button {
  padding: 8px 12px;
  border-radius: 8px;
}
pre { background: #f6f8fa; padding: 8px; border-radius: 8px; max-height: 300px; overflow: auto; }
</style>
