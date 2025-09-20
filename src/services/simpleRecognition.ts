// 简化版的推理服务，使用演示模式避免ONNX配置问题
import { generateMockResults } from '@/utils/mockData';

export interface DetectionResult {
  id: string;
  label: string;
  classId: number;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InferenceStats {
  timeMs: number;
  fps: number;
  totalDetections: number;
}

export interface RecognitionOptions {
  modelUrl?: string;
  confidenceThreshold?: number;
  iouThreshold?: number;
  maxFPS?: number;
  mockMode?: boolean;
}

export enum RecognitionState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  WARMING_UP = 'warming_up',
  RUNNING = 'running',
  ERROR = 'error'
}

export class SimpleRecognitionService {
  private state: RecognitionState = RecognitionState.UNINITIALIZED;
  private options: RecognitionOptions;
  private lastInferenceTime = 0;
  private callbacks = {
    onStateChange: [] as Array<(state: RecognitionState) => void>,
    onResult: [] as Array<(results: DetectionResult[], stats: InferenceStats) => void>,
    onError: [] as Array<(error: string) => void>
  };

  constructor(options: RecognitionOptions = {}) {
    this.options = {
      modelUrl: '/models/yolov8n.onnx',
      confidenceThreshold: 0.25,
      iouThreshold: 0.45,
      maxFPS: 8,
      mockMode: true, // 默认使用演示模式
      ...options
    };
  }

  // 初始化服务（简化版，直接使用演示模式）
  async initialize(): Promise<void> {
    if (this.state !== RecognitionState.UNINITIALIZED) {
      throw new Error(`无法初始化，当前状态: ${this.state}`);
    }

    this.setState(RecognitionState.INITIALIZING);
    
    // 模拟初始化延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.setState(RecognitionState.READY);
    console.log('识别服务初始化完成（演示模式）');
  }

  // 预热模型（演示模式下直接完成）
  async warmup(): Promise<void> {
    if (this.state !== RecognitionState.READY) {
      throw new Error(`无法预热，当前状态: ${this.state}`);
    }

    this.setState(RecognitionState.WARMING_UP);
    
    // 模拟预热延迟
    await new Promise(resolve => setTimeout(resolve, 500));
    
    this.setState(RecognitionState.READY);
    console.log('模型预热完成（演示模式）');
  }

  // 对视频帧进行推理
  async inferFrame(video: HTMLVideoElement): Promise<void> {
    if (this.state !== RecognitionState.READY && this.state !== RecognitionState.RUNNING) {
      console.warn(`推理跳过，当前状态: ${this.state}`);
      return;
    }

    // FPS限制
    const now = performance.now();
    const minInterval = 1000 / (this.options.maxFPS || 8);
    if (now - this.lastInferenceTime < minInterval) {
      return;
    }
    this.lastInferenceTime = now;

    if (!video.videoWidth || !video.videoHeight) {
      return;
    }

    try {
      this.setState(RecognitionState.RUNNING);

      // 生成模拟检测结果
      const boxes = generateMockResults();
      const inferenceTime = 50 + Math.random() * 100; // 模拟50-150ms的推理时间
      
      // 模拟异步推理延迟
      setTimeout(() => {
        this.setState(RecognitionState.READY);
        const stats: InferenceStats = {
          timeMs: Math.round(inferenceTime),
          fps: Math.round(1000 / inferenceTime),
          totalDetections: boxes.length
        };
        this.callbacks.onResult.forEach(callback => callback(boxes, stats));
      }, inferenceTime);

    } catch (error) {
      this.handleError(`推理失败: ${error}`);
    }
  }

  // 停止推理
  stop(): void {
    this.setState(RecognitionState.READY);
  }

  // 销毁服务
  destroy(): void {
    this.setState(RecognitionState.UNINITIALIZED);
    this.clearCallbacks();
  }

  // 事件监听器
  onStateChange(callback: (state: RecognitionState) => void): () => void {
    this.callbacks.onStateChange.push(callback);
    return () => {
      const index = this.callbacks.onStateChange.indexOf(callback);
      if (index > -1) {
        this.callbacks.onStateChange.splice(index, 1);
      }
    };
  }

  onResult(callback: (results: DetectionResult[], stats: InferenceStats) => void): () => void {
    this.callbacks.onResult.push(callback);
    return () => {
      const index = this.callbacks.onResult.indexOf(callback);
      if (index > -1) {
        this.callbacks.onResult.splice(index, 1);
      }
    };
  }

  onError(callback: (error: string) => void): () => void {
    this.callbacks.onError.push(callback);
    return () => {
      const index = this.callbacks.onError.indexOf(callback);
      if (index > -1) {
        this.callbacks.onError.splice(index, 1);
      }
    };
  }

  // 获取当前状态
  getState(): RecognitionState {
    return this.state;
  }

  // 获取配置选项
  getOptions(): RecognitionOptions {
    return { ...this.options };
  }

  // 更新配置
  updateOptions(newOptions: Partial<RecognitionOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  // 设置状态
  private setState(newState: RecognitionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.callbacks.onStateChange.forEach(callback => callback(newState));
    }
  }

  // 处理错误
  private handleError(error: string): void {
    console.error('识别服务错误:', error);
    this.setState(RecognitionState.ERROR);
    this.callbacks.onError.forEach(callback => callback(error));
  }

  // 清空回调
  private clearCallbacks(): void {
    this.callbacks.onStateChange = [];
    this.callbacks.onResult = [];
    this.callbacks.onError = [];
  }
}

// 单例实例
let recognitionService: SimpleRecognitionService | null = null;

export function getSimpleRecognitionService(options?: RecognitionOptions): SimpleRecognitionService {
  if (!recognitionService) {
    recognitionService = new SimpleRecognitionService(options);
  }
  return recognitionService;
}

export function destroySimpleRecognitionService(): void {
  if (recognitionService) {
    recognitionService.destroy();
    recognitionService = null;
  }
}