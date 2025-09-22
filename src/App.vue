<template>
	<router-view />
	<!-- 全局挂载：聊天悬浮入口，与语音入口相邻（右下角） -->
	<ChatFloat :visible="true" />
  <!-- 全局挂载：语音助手浮层，统一分发到各页面 -->
  <VoiceAssistantFloat :visible="true" @command="onVoiceCommand" />
</template>

<script setup lang="ts">
import ChatFloat from '@/components/ChatFloat.vue'
import VoiceAssistantFloat from '@/components/VoiceAssistantFloat.vue'
import { emitVoiceCommand } from '@/bridge/voiceBus'

function onVoiceCommand(e: { transcript: string; isFinal: boolean; parsed?: any }) {
  emitVoiceCommand(e)
}
</script>