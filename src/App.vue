<template>
	<router-view />
  <!-- 全局挂载：语音助手浮层，统一分发到各页面 -->
  <VoiceAssistantFloat :visible="true" @command="onVoiceCommand" />
  <!-- 语音功能调试面板 -->
  <VoiceDebugPanel />
</template>

<script setup lang="ts">
import VoiceAssistantFloat from '@/components/VoiceAssistantFloat.vue'
import VoiceDebugPanel from '@/components/VoiceDebugPanel.vue'
import { emitVoiceCommand } from '@/bridge/voiceBus'

function onVoiceCommand(e: { transcript: string; isFinal: boolean; parsed?: any }) {
  console.log('[App] Voice command received:', e)
  emitVoiceCommand(e)
}
</script>