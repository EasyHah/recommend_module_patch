// 统一识别服务入口：优先 MediaPipe，失败回退到简单演示模式
import type { DetectionResult, InferenceStats } from './mediapipeRecognition'
import {
  getMediapipeRecognitionService,
  destroyMediapipeRecognitionService,
  RecognitionState,
  type RecognitionOptions,
} from './mediapipeRecognition'
import {
  getSimpleRecognitionService,
  destroySimpleRecognitionService,
} from './simpleRecognition'

export { RecognitionState }
export type { DetectionResult, InferenceStats, RecognitionOptions }

let useDemoFallback = false

export function getRecognitionService(options?: RecognitionOptions) {
  if (!useDemoFallback) {
    try {
      return getMediapipeRecognitionService(options)
    } catch (e) {
      console.warn('MediaPipe 服务创建失败，回退到演示模式:', e)
      useDemoFallback = true
    }
  }
  return getSimpleRecognitionService({ ...options, mockMode: true })
}

export function destroyRecognitionService() {
  try {
    destroyMediapipeRecognitionService()
  } catch {}
  try {
    destroySimpleRecognitionService()
  } catch {}
}
