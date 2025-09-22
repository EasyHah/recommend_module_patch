<template>
  <div class="chat-float" :class="{ hidden: !visible }">
    <button class="chat-button" :class="{ initializing: isInitializing, active: isChatVisible }" @click="onClick" :title="buttonTitle">
      <span v-if="isInitializing">⏳</span>
      <span v-else-if="!isSDKReady">💬</span>
      <span v-else>🤖</span>
    </button>

    <div v-if="chatError" class="chat-error" @click.stop>
      {{ chatError }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppflowChat } from '@/composables/useAppflowChat'

const props = defineProps<{ visible?: boolean }>()
const { 
  isInitializing,
  isSDKReady,
  isChatVisible,
  error: chatError,
  initialize,
  toggleChat,
  showChat
} = useAppflowChat()

const buttonTitle = computed(() => {
  if (isInitializing.value) return '正在初始化AI聊天…'
  if (!isSDKReady.value) return '点击初始化AI聊天'
  return isChatVisible.value ? '隐藏AI聊天' : '显示AI聊天'
})

const onClick = async () => {
  if (!isSDKReady.value) {
    await initialize()
  }
  showChat()
}
</script>

<style scoped>
.chat-float {
  position: fixed;
  /* 与语音按钮水平对齐，放在其左侧，保持 20px 间距 */
  right: 84px; /* 64px(语音按钮宽) + 20px 间距 */
  bottom: 20px;
  z-index: 2000;
}

.chat-float.hidden { display: none; }

.chat-button {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #673AB7 0%, #512DA8 100%);
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  box-shadow: 0 6px 16px rgba(81, 45, 168, 0.35);
  cursor: pointer;
  transition: all 0.25s ease;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.chat-button:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 8px 20px rgba(81, 45, 168, 0.45);
}

.chat-button.initializing {
  background: linear-gradient(135deg, #9E9E9E 0%, #757575 100%);
}

.chat-button.active {
  background: linear-gradient(135deg, #8E24AA 0%, #6A1B9A 100%);
}

.chat-error {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(244, 67, 54, 0.9);
  color: white;
  border-radius: 6px;
  font-size: 12px;
  max-width: 240px;
  box-shadow: 0 4px 12px rgba(244, 67, 54, 0.35);
}

@media (max-width: 768px) {
  /* 移动端：稍微缩小并与语音按钮保持 12px 间距 */
  .chat-float { right: 76px; bottom: 16px; }
  .chat-button { width: 56px; height: 56px; font-size: 24px; }
}
</style>
