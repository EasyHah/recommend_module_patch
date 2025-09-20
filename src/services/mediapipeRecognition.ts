// 使用 MediaPipe Tasks Vision 的对象检测服务（真实前端推理）
import {
  FilesetResolver,
  ObjectDetector,
  type ObjectDetectorResult,
} from '@mediapipe/tasks-vision'

export interface DetectionResult {
  id: string
  label: string
  classId: number
  confidence: number
  x: number
  y: number
  width: number
  height: number
}

export interface InferenceStats {
  timeMs: number
  fps: number
  totalDetections: number
}

export interface TrackEventSummary {
  entered: number
  exited: number
}

export interface RecognitionOptions {
  modelUrl?: string
  confidenceThreshold?: number
  maxFPS?: number
  wasmRoot?: string
  // 追踪与平滑参数
  iouThreshold?: number
  smoothingAlpha?: number
  maxTrackMisses?: number
  // 推理后端：GPU 或 CPU（默认 GPU）
  delegate?: 'GPU' | 'CPU'
}

export enum RecognitionState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  WARMING_UP = 'warming_up',
  RUNNING = 'running',
  ERROR = 'error'
}

// 默认模型与WASM地址（使用官方CDN，避免本地打包WASM/TFLite）
const DEFAULT_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite'
// 注意：版本号需与 package.json 中安装的 @mediapipe/tasks-vision 对齐
const DEFAULT_WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm'

export class MediapipeRecognitionService {
  private state: RecognitionState = RecognitionState.UNINITIALIZED
  private options: Required<RecognitionOptions>
  private lastInferenceTime = 0
  private detector: ObjectDetector | null = null
  private delegate: 'GPU' | 'CPU'
  private cpuFallbackDone = false
  // 保证传入 MediaPipe 的 timestamp 严格单调
  private _tsBaseOffsetMs = 0
  private _lastRawVideoMs: number | null = null
  private _lastMonotonicTsMs: number | null = null
  private callbacks = {
    onStateChange: [] as Array<(state: RecognitionState) => void>,
    onResult: [] as Array<(results: DetectionResult[], stats: InferenceStats) => void>,
    onError: [] as Array<(error: string) => void>,
    onTrackEvent: [] as Array<(ev: TrackEventSummary) => void>,
  }
  private tracker: SimpleTracker

  constructor(options: RecognitionOptions = {}) {
    this.options = {
      modelUrl: options.modelUrl ?? DEFAULT_MODEL_URL,
      confidenceThreshold: options.confidenceThreshold ?? 0.25,
      maxFPS: options.maxFPS ?? 12,
      wasmRoot: options.wasmRoot ?? DEFAULT_WASM_ROOT,
      iouThreshold: options.iouThreshold ?? 0.5,
      smoothingAlpha: options.smoothingAlpha ?? 0.6,
      maxTrackMisses: options.maxTrackMisses ?? 5,
      delegate: options.delegate ?? 'GPU',
    }
    this.delegate = this.options.delegate
    this.tracker = new SimpleTracker({
      iouThreshold: this.options.iouThreshold,
      smoothingAlpha: this.options.smoothingAlpha,
      maxMisses: this.options.maxTrackMisses,
    })
  }

  async initialize(): Promise<void> {
    if (this.state !== RecognitionState.UNINITIALIZED) {
      throw new Error(`无法初始化，当前状态: ${this.state}`)
    }
    this.setState(RecognitionState.INITIALIZING)

    try {
      const vision = await FilesetResolver.forVisionTasks(this.options.wasmRoot)
      this.detector = await this.createDetector(vision, this.delegate)

      this.setState(RecognitionState.READY)
      console.log('MediaPipe 对象检测初始化完成')
    } catch (err) {
      this.handleError(`初始化失败: ${(err as Error).message || err}`)
      throw err
    }
  }

  private async createDetector(vision: any, delegate: 'GPU' | 'CPU') {
    return await ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: this.options.modelUrl,
        delegate,
      },
      scoreThreshold: this.options.confidenceThreshold,
      runningMode: 'VIDEO',
    })
  }

  async warmup(): Promise<void> {
    if (this.state !== RecognitionState.READY) {
      throw new Error(`无法预热，当前状态: ${this.state}`)
    }
    this.setState(RecognitionState.WARMING_UP)
    // MediaPipe 无需复杂预热，做一个短延迟即可
    await new Promise((r) => setTimeout(r, 200))
    this.setState(RecognitionState.READY)
  }

  async inferFrame(video: HTMLVideoElement): Promise<void> {
    if (this.state !== RecognitionState.READY && this.state !== RecognitionState.RUNNING) return
    if (!this.detector) return
    if (!video.videoWidth || !video.videoHeight) return

    // FPS 限制
    const now = performance.now()
    const minInterval = 1000 / (this.options.maxFPS || 12)
    if (now - this.lastInferenceTime < minInterval) return
    this.lastInferenceTime = now

    try {
      this.setState(RecognitionState.RUNNING)
  const t0 = performance.now()
  // 计算严格单调的 timestamp（ms）
  const { tsMs, rawVideoMs } = this.computeMonotonicTimestamp(video)
  const result: ObjectDetectorResult = this.detector.detectForVideo(video, tsMs)
      const t1 = performance.now()

  let mapped = mapDetections(result, video.videoWidth, video.videoHeight)
  // 运行时置信度过滤，确保阈值变更即时生效
  const thr = Math.round(((this.options.confidenceThreshold ?? 0.25) * 100))
  mapped = mapped.filter(d => d.confidence >= thr)
      const { outputs: tracked, events } = this.tracker.update(mapped)
      const inferenceTime = t1 - t0
      const stats: InferenceStats = {
        timeMs: Math.round(inferenceTime),
        fps: Math.max(1, Math.round(1000 / Math.max(1, inferenceTime))),
        totalDetections: tracked.length,
      }

      this.setState(RecognitionState.READY)
      this.callbacks.onResult.forEach((cb) => cb(tracked, stats))
      if (events.entered || events.exited) {
        this.callbacks.onTrackEvent.forEach((cb) => cb(events))
      }
    } catch (err) {
      const msg = (err as Error)?.message || String(err)
      // 针对时间戳不单调的软恢复：调整偏移并跳过本帧，不进入 ERROR 态
      if (/Packet timestamp mismatch|timestamp is not monotonically increasing/i.test(msg)) {
        try {
          const { rawVideoMs } = this.computeMonotonicTimestamp(video)
          const last = this._lastMonotonicTsMs ?? 0
          if (typeof rawVideoMs === 'number') {
            // 调整偏移，保证下一帧 ts > last
            const target = last + 33
            const delta = target - rawVideoMs
            if (delta > 0) this._tsBaseOffsetMs += delta
          } else {
            // 无法获取视频时间时，直接向前推进 33ms
            this._tsBaseOffsetMs += 33
          }
        } catch {}
        this.setState(RecognitionState.READY)
        console.warn('检测到时间戳不单调，已自动调整并跳过本帧。')
        return
      }
      // 针对跨域视频导致的 WebGL 纹理错误，自动回退 CPU 并重试一次
      if (!this.cpuFallbackDone && this.delegate === 'GPU' && /texImage2D|cross-origin/i.test(msg)) {
        console.warn('检测到 WebGL 纹理错误，自动回退到 CPU 后端并重试一次...')
        try {
          const vision = await FilesetResolver.forVisionTasks(this.options.wasmRoot)
          this.detector?.close?.()
          this.delegate = 'CPU'
          this.options.delegate = 'CPU'
          this.detector = await this.createDetector(vision, 'CPU')
          this.cpuFallbackDone = true
          // 立即重试当前帧（避免下一帧才生效）
          await this.inferFrame(video)
          return
        } catch (e2) {
          console.error('CPU 回退失败:', e2)
        }
      }
      this.handleError(`推理失败: ${msg}`)
    }
  }

  stop(): void {
    this.setState(RecognitionState.READY)
  }

  destroy(): void {
    try {
      this.detector?.close()
    } catch {}
    this.detector = null
    this.setState(RecognitionState.UNINITIALIZED)
    this.clearCallbacks()
  }

  // 统一时间源为毫秒，并在回放/seek 时用偏移量补偿，确保严格单调
  private computeMonotonicTimestamp(video: HTMLVideoElement): { tsMs: number; rawVideoMs: number } {
    // 优先使用 rVFC 注入的媒体时间（通常为秒），否则回退到 video.currentTime
    const injected = (this as any)._rvfcTs as number | undefined
    let rawSec: number
    if (typeof injected === 'number' && isFinite(injected)) {
      // metadata.mediaTime 规范为秒
      rawSec = injected
    } else if (typeof video.currentTime === 'number' && isFinite(video.currentTime)) {
      rawSec = video.currentTime
    } else {
      // 无法获取媒体时间，使用性能时钟（ms 转换为 sec）
      rawSec = performance.now() / 1000
    }

    let rawMs = rawSec * 1000

    // 如果出现回退（如重播/seek 到 0），通过偏移量补偿
    if (this._lastRawVideoMs !== null && rawMs < this._lastRawVideoMs - 1) {
      const lastMono = this._lastMonotonicTsMs ?? 0
      const target = lastMono + 33 // 预留一帧
      const delta = target - rawMs
      if (delta > 0) this._tsBaseOffsetMs += delta
    }
    this._lastRawVideoMs = rawMs

    let tsMs = rawMs + this._tsBaseOffsetMs
    if (this._lastMonotonicTsMs !== null && tsMs <= this._lastMonotonicTsMs) {
      tsMs = this._lastMonotonicTsMs + 1 // 强制严格递增
    }
    this._lastMonotonicTsMs = tsMs
    return { tsMs, rawVideoMs: rawMs }
  }

  onStateChange(callback: (state: RecognitionState) => void): () => void {
    this.callbacks.onStateChange.push(callback)
    return () => {
      const i = this.callbacks.onStateChange.indexOf(callback)
      if (i > -1) this.callbacks.onStateChange.splice(i, 1)
    }
  }

  onResult(callback: (results: DetectionResult[], stats: InferenceStats) => void): () => void {
    this.callbacks.onResult.push(callback)
    return () => {
      const i = this.callbacks.onResult.indexOf(callback)
      if (i > -1) this.callbacks.onResult.splice(i, 1)
    }
  }

  onError(callback: (error: string) => void): () => void {
    this.callbacks.onError.push(callback)
    return () => {
      const i = this.callbacks.onError.indexOf(callback)
      if (i > -1) this.callbacks.onError.splice(i, 1)
    }
  }

  onTrackEvent(callback: (ev: TrackEventSummary) => void): () => void {
    this.callbacks.onTrackEvent.push(callback)
    return () => {
      const i = this.callbacks.onTrackEvent.indexOf(callback)
      if (i > -1) this.callbacks.onTrackEvent.splice(i, 1)
    }
  }

  getState(): RecognitionState {
    return this.state
  }

  getOptions(): RecognitionOptions & { mockMode: boolean } {
    // 为了与现有UI兼容，暴露 mockMode=false
    return { ...this.options, mockMode: false }
  }

  updateOptions(newOptions: Partial<RecognitionOptions>): void {
    const before = this.options
    this.options = { ...before, ...newOptions }
    if (newOptions.delegate && newOptions.delegate !== this.delegate) {
      // 重建 detector 以切换 delegate
      ;(async () => {
        try {
          const vision = await FilesetResolver.forVisionTasks(this.options.wasmRoot)
          this.detector?.close?.()
          this.delegate = newOptions.delegate as 'GPU' | 'CPU'
          this.detector = await this.createDetector(vision, this.delegate)
          this.cpuFallbackDone = this.delegate === 'CPU'
        } catch (e) {
          this.handleError(`切换后端失败: ${(e as Error).message || e}`)
        }
      })()
    }
    // 同步 tracker 参数
    this.tracker.setParams({
      iouThreshold: this.options.iouThreshold,
      smoothingAlpha: this.options.smoothingAlpha,
      maxMisses: this.options.maxTrackMisses,
    })
  }

  private setState(newState: RecognitionState) {
    if (this.state !== newState) {
      this.state = newState
      this.callbacks.onStateChange.forEach((cb) => cb(newState))
    }
  }

  private handleError(error: string) {
    console.error('MediaPipe 识别服务错误:', error)
    this.setState(RecognitionState.ERROR)
    this.callbacks.onError.forEach((cb) => cb(error))
  }

  private clearCallbacks() {
    this.callbacks.onStateChange = []
    this.callbacks.onResult = []
    this.callbacks.onError = []
  }
}

function mapDetections(result: ObjectDetectorResult, frameW: number, frameH: number): DetectionResult[] {
  const out: DetectionResult[] = []
  const dets = result.detections ?? []
  for (let i = 0; i < dets.length; i++) {
    const det = dets[i]
    const cat = det.categories?.[0]
    const bbox = det.boundingBox
    if (!cat || !bbox) continue

    const xPct = (bbox.originX / frameW) * 100
    const yPct = (bbox.originY / frameH) * 100
    const wPct = (bbox.width / frameW) * 100
    const hPct = (bbox.height / frameH) * 100

    out.push({
      id: `${Date.now()}_${i}`,
      label: translateLabel(cat.categoryName || 'object'),
      classId: typeof cat.index === 'number' ? cat.index : -1,
      confidence: Math.round((cat.score ?? 0) * 100),
      x: clampPct(xPct),
      y: clampPct(yPct),
      width: clampPct(wPct),
      height: clampPct(hPct),
    })
  }
  return out
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v))
}

let singleton: MediapipeRecognitionService | null = null

export function getMediapipeRecognitionService(options?: RecognitionOptions): MediapipeRecognitionService {
  if (!singleton) singleton = new MediapipeRecognitionService(options)
  return singleton
}

export function destroyMediapipeRecognitionService(): void {
  if (singleton) {
    singleton.destroy()
    singleton = null
  }
}

// 简要的英文->中文标签映射（覆盖常见人和车辆类别；其他保持英文原样）
const LABEL_MAP: Record<string, string> = {
  person: '人员',
  car: '汽车',
  bus: '公交车',
  truck: '卡车',
  motorcycle: '摩托车',
  motorbike: '摩托车',
  bicycle: '自行车',
}

function translateLabel(en: string): string {
  const key = en.toLowerCase()
  return LABEL_MAP[key] || en
}

// ========== 轻量级跟踪与平滑 ==========
type Box = { x: number; y: number; width: number; height: number }
type Track = {
  id: number
  label: string
  box: Box
  confidence: number
  hits: number
  misses: number
}

function iou(a: Box, b: Box): number {
  const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.width, ay2 = a.y + a.height
  const bx1 = b.x, by1 = b.y, bx2 = b.x + b.width, by2 = b.y + b.height
  const ix1 = Math.max(ax1, bx1)
  const iy1 = Math.max(ay1, by1)
  const ix2 = Math.min(ax2, bx2)
  const iy2 = Math.min(ay2, by2)
  const iw = Math.max(0, ix2 - ix1)
  const ih = Math.max(0, iy2 - iy1)
  const inter = iw * ih
  const areaA = a.width * a.height
  const areaB = b.width * b.height
  const uni = areaA + areaB - inter
  return uni > 0 ? inter / uni : 0
}

class SimpleTracker {
  private tracks: Track[] = []
  private nextId = 1
  private readonly iouTh: number
  private readonly alpha: number
  private readonly maxMisses: number

  constructor(opts: { iouThreshold?: number; smoothingAlpha?: number; maxMisses?: number }) {
    this.iouTh = opts.iouThreshold ?? 0.5
    this.alpha = opts.smoothingAlpha ?? 0.6
    this.maxMisses = opts.maxMisses ?? 5
  }

  update(dets: DetectionResult[]): { outputs: DetectionResult[]; events: TrackEventSummary } {
    // 先按类别拆分，类别间互不匹配
    const events: TrackEventSummary = { entered: 0, exited: 0 }
    const outputs: DetectionResult[] = []

    // 增加所有轨迹的 misses 计数（本帧未命中则会生效）
    this.tracks.forEach((t) => (t.misses += 1))

    const labels = new Set<string>([...this.tracks.map(t=>t.label), ...dets.map(d=>d.label)])
    for (const lab of labels) {
      const Tidx = this.tracks.map((t, i) => ({ t, i })).filter(x => x.t.label === lab)
      const Didx = dets.map((d, j) => ({ d, j })).filter(x => x.d.label === lab)
      if (Tidx.length === 0 && Didx.length === 0) continue

      if (Tidx.length > 0 && Didx.length > 0) {
        // 构建代价矩阵（1 - IoU），IoU 低于阈值的用高代价抑制匹配
        const cost: number[][] = Array.from({ length: Tidx.length }, () => Array(Didx.length).fill(1))
        for (let r = 0; r < Tidx.length; r++) {
          for (let c = 0; c < Didx.length; c++) {
            const iouVal = iou(Tidx[r].t.box, { x: Didx[c].d.x, y: Didx[c].d.y, width: Didx[c].d.width, height: Didx[c].d.height })
            cost[r][c] = iouVal >= this.iouTh ? 1 - iouVal : 10 // 低于阈值直接设大代价
          }
        }
        const assign = hungarian(cost) // 返回 [trackRow, detCol] 的配对
        const matchedT = new Set<number>()
        const matchedD = new Set<number>()

        for (const [r, c] of assign) {
          if (r < 0 || c < 0) continue
          const tRef = Tidx[r]; const dRef = Didx[c]
          if (!tRef || !dRef) continue
          if (cost[r][c] >= 1) continue // 代价>=1 视作无效匹配

          const t = this.tracks[tRef.i]
          const d = dRef.d
          t.box = this.smoothBox(t.box, { x: d.x, y: d.y, width: d.width, height: d.height })
          t.confidence = Math.max(t.confidence * 0.7, d.confidence)
          t.hits += 1
          t.misses = 0
          matchedT.add(tRef.i)
          matchedD.add(dRef.j)
          outputs.push({ ...d, id: `t${t.id}`, x: t.box.x, y: t.box.y, width: t.box.width, height: t.box.height, confidence: t.confidence })
        }

        // 未匹配的检测 -> 新建轨迹（enter）
        for (const dRef of Didx) {
          if (matchedD.has(dRef.j)) continue
          const d = dRef.d
          const id = this.nextId++
          const box = { x: d.x, y: d.y, width: d.width, height: d.height }
          const t: Track = { id, label: d.label, box, confidence: d.confidence, hits: 1, misses: 0 }
          this.tracks.push(t)
          outputs.push({ ...d, id: `t${id}` })
          events.entered += 1
        }

        // 未匹配的轨迹：如果超过 maxMisses 被删除则记为 exit
        const before = this.tracks.length
        this.tracks = this.tracks.filter((t, idx) => {
          const keep = matchedT.has(idx) || t.misses <= this.maxMisses
          if (!keep) events.exited += 1
          return keep
        })
      } else if (Tidx.length === 0 && Didx.length > 0) {
        // 之前没有轨迹，本帧出现的全部算 enter
        for (const dRef of Didx) {
          const d = dRef.d
          const id = this.nextId++
          const t: Track = { id, label: d.label, box: { x: d.x, y: d.y, width: d.width, height: d.height }, confidence: d.confidence, hits: 1, misses: 0 }
          this.tracks.push(t)
          outputs.push({ ...d, id: `t${id}` })
          events.entered += 1
        }
      } else if (Tidx.length > 0 && Didx.length === 0) {
        // 轨迹全部未匹配，按 misses 规则淘汰 -> exit
        this.tracks = this.tracks.filter((t) => {
          t.misses += 0 // 已在帧开头+1，这里不重复
          const keep = t.misses <= this.maxMisses
          if (!keep) events.exited += 1
          return keep
        })
      }
    }

    return { outputs, events }
  }

  private smoothBox(prev: Box, cur: Box): Box {
    const a = this.alpha
    return {
      x: a * cur.x + (1 - a) * prev.x,
      y: a * cur.y + (1 - a) * prev.y,
      width: a * cur.width + (1 - a) * prev.width,
      height: a * cur.height + (1 - a) * prev.height,
    }
  }

  setParams(opts: { iouThreshold?: number; smoothingAlpha?: number; maxMisses?: number }) {
    if (typeof opts.iouThreshold === 'number') (this as any).iouTh = opts.iouThreshold
    if (typeof opts.smoothingAlpha === 'number') (this as any).alpha = opts.smoothingAlpha
    if (typeof opts.maxMisses === 'number') (this as any).maxMisses = opts.maxMisses
  }
}

// 匈牙利算法（最小化代价）：返回配对 [rowIndex, colIndex] 数组
function hungarian(cost: number[][]): Array<[number, number]> {
  const n = Math.max(cost.length, cost[0]?.length ?? 0)
  // 建立 n×n 的方阵，缺省位置用高代价填充
  const C: number[][] = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => {
    const v = (cost[r] && cost[r][c] !== undefined) ? cost[r][c] : 10
    return v
  }))

  // 行最小值归零
  for (let r = 0; r < n; r++) {
    const m = Math.min(...C[r])
    for (let c = 0; c < n; c++) C[r][c] -= m
  }
  // 列最小值归零
  for (let c = 0; c < n; c++) {
    let m = Infinity
    for (let r = 0; r < n; r++) m = Math.min(m, C[r][c])
    for (let r = 0; r < n; r++) C[r][c] -= m
  }

  // 简化实现：贪心选择零元素的最大匹配（非最优覆盖算法完整实现），在我们的小规模场景通常足够
  const assignedRows = new Set<number>()
  const assignedCols = new Set<number>()
  const result: Array<[number, number]> = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (C[r][c] === 0 && !assignedRows.has(r) && !assignedCols.has(c)) {
        assignedRows.add(r); assignedCols.add(c)
        result.push([r, c])
        break
      }
    }
  }
  return result
}
