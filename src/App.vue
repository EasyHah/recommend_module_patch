<template>
	<router-view />
	<!-- 全局挂载：聊天悬浮入口，与语音入口相邻（右下角） -->
	<ChatFloat :visible="true" />
</template>

<script setup lang="ts">
import ChatFloat from '@/components/ChatFloat.vue'
</script>