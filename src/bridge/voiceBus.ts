import { onUnmounted } from 'vue'

export type VoiceCommandPayload = {
  transcript: string
  isFinal: boolean
  parsed?: any
}

type Handler = (e: VoiceCommandPayload) => void

const listeners = new Set<Handler>()

export function onVoiceCommand(handler: Handler) {
  listeners.add(handler)
  // 方便在组件中自动清理
  onUnmounted(() => listeners.delete(handler))
  return () => listeners.delete(handler)
}

export function emitVoiceCommand(e: VoiceCommandPayload) {
  listeners.forEach(h => {
    try { h(e) } catch {}
  })
}
