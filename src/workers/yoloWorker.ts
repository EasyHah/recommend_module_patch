// 动态导入ONNX Runtime，避免Vite的静态分析问题
let ort: any = null;

// 类别标签 (COCO 80类)
const CLASS_LABELS = [
  '人员', '自行车', '汽车', '摩托车', '飞机', '公交车', '火车', '卡车',
  '船', '红绿灯', '消防栓', '停车标志', '停车计时器', '长椅', '鸟', '猫',
  '狗', '马', '羊', '牛', '大象', '熊', '斑马', '长颈鹿', '背包',
  '雨伞', '手提包', '领带', '手提箱', '飞盘', '滑雪板', '滑雪橇', '运动球',
  '风筝', '棒球棒', '棒球手套', '滑板', '冲浪板', '网球拍', '瓶子', '酒杯',
  '杯子', '叉子', '刀', '勺子', '碗', '香蕉', '苹果', '三明治', '橙子',
  '西兰花', '胡萝卜', '热狗', '披萨', '甜甜圈', '蛋糕', '椅子', '沙发',
  '盆栽植物', '床', '餐桌', '厕所', '电视', '笔记本电脑', '鼠标', '遥控器',
  '键盘', '手机', '微波炉', '烤箱', '烤面包机', '水槽', '冰箱', '书',
  '时钟', '花瓶', '剪刀', '泰迪熊', '吹风机', '牙刷'
];

interface DetectionBox {
  id: string;
  label: string;
  classId: number;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WorkerMessage {
  type: 'init' | 'warmup' | 'infer';
  payload?: any;
}

interface WorkerResponse {
  type: 'inited' | 'warmed' | 'result' | 'error';
  payload?: any;
}

let session: any = null;
let isInitialized = false;

// 初始化ONNX Runtime
async function initOnnxRuntime() {
  if (ort) return ort;
  
  try {
    // 动态导入ONNX Runtime
    ort = await import('onnxruntime-web');
    
    // 配置WASM路径
    ort.env.wasm.wasmPaths = '/onnxruntime-web/';
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;
    
    console.log('ONNX Runtime 初始化成功');
    return ort;
  } catch (error) {
    console.error('ONNX Runtime 初始化失败:', error);
    throw error;
  }
}

// NMS算法实现
function nms(boxes: DetectionBox[], iouThreshold = 0.45, scoreThreshold = 0.25): DetectionBox[] {
  // 过滤低置信度的框
  const filteredBoxes = boxes.filter(box => box.confidence >= scoreThreshold);
  
  // 按置信度排序
  filteredBoxes.sort((a, b) => b.confidence - a.confidence);
  
  const keep: DetectionBox[] = [];
  
  // 计算IoU
  const calculateIoU = (boxA: DetectionBox, boxB: DetectionBox): number => {
    const x1 = Math.max(boxA.x, boxB.x);
    const y1 = Math.max(boxA.y, boxB.y);
    const x2 = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
    const y2 = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);
    
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const areaA = boxA.width * boxA.height;
    const areaB = boxB.width * boxB.height;
    const union = areaA + areaB - intersection;
    
    return union > 0 ? intersection / union : 0;
  };
  
  for (const box of filteredBoxes) {
    let shouldKeep = true;
    
    for (const keptBox of keep) {
      if (calculateIoU(box, keptBox) > iouThreshold) {
        shouldKeep = false;
        break;
      }
    }
    
    if (shouldKeep) {
      keep.push(box);
    }
  }
  
  return keep;
}

// 图像预处理 - letterbox resize
function preprocessImage(imageData: ImageData, modelSize = 640): {
  tensor: any;
  scale: number;
  padX: number;
  padY: number;
} {
  const { width, height, data } = imageData;
  
  // 计算缩放比例和填充
  const scale = Math.min(modelSize / width, modelSize / height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);
  const padX = (modelSize - newWidth) / 2;
  const padY = (modelSize - newHeight) / 2;
  
  // 创建输出数组 [1, 3, 640, 640]
  const outputData = new Float32Array(1 * 3 * modelSize * modelSize);
  
  // letterbox 处理
  for (let y = 0; y < modelSize; y++) {
    for (let x = 0; x < modelSize; x++) {
      const srcX = Math.round((x - padX) / scale);
      const srcY = Math.round((y - padY) / scale);
      
      let r = 114, g = 114, b = 114; // 默认填充值
      
      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const srcIndex = (srcY * width + srcX) * 4;
        r = data[srcIndex];
        g = data[srcIndex + 1];
        b = data[srcIndex + 2];
      }
      
      // 归一化到 [0, 1] 并转换为 NCHW 格式
      const baseIndex = y * modelSize + x;
      outputData[0 * modelSize * modelSize + baseIndex] = r / 255.0; // R通道
      outputData[1 * modelSize * modelSize + baseIndex] = g / 255.0; // G通道
      outputData[2 * modelSize * modelSize + baseIndex] = b / 255.0; // B通道
    }
  }
  
  const tensor = new ort.Tensor('float32', outputData, [1, 3, modelSize, modelSize]);
  
  return { tensor, scale, padX, padY };
}

// 后处理 - 解析YOLO输出
function postprocessOutput(
  output: any,
  originalWidth: number,
  originalHeight: number,
  scale: number,
  padX: number,
  padY: number,
  modelSize = 640
): DetectionBox[] {
  const boxes: DetectionBox[] = [];
  
  // YOLOv8 输出格式: [1, 84, 8400] 或 [1, 8400, 84]
  const outputData = output.data as Float32Array;
  const shape = output.dims;
  
  let numBoxes: number;
  let numClasses: number;
  
  if (shape[1] === 84) {
    // [1, 84, 8400] 格式
    numBoxes = shape[2];
    numClasses = 80; // COCO 80类
    
    for (let i = 0; i < numBoxes; i++) {
      // 提取边界框坐标 (cx, cy, w, h)
      const cx = outputData[0 * numBoxes + i];
      const cy = outputData[1 * numBoxes + i];
      const w = outputData[2 * numBoxes + i];
      const h = outputData[3 * numBoxes + i];
      
      // 提取类别置信度
      let maxScore = 0;
      let classId = 0;
      
      for (let j = 0; j < numClasses; j++) {
        const score = outputData[(4 + j) * numBoxes + i];
        if (score > maxScore) {
          maxScore = score;
          classId = j;
        }
      }
      
      if (maxScore > 0.25) { // 置信度阈值
        // 转换坐标 (中心点 -> 左上角)
        const x1 = cx - w / 2;
        const y1 = cy - h / 2;
        
        // 反向letterbox变换
        const realX = (x1 - padX) / scale;
        const realY = (y1 - padY) / scale;
        const realW = w / scale;
        const realH = h / scale;
        
        // 转换为相对坐标 (0-1)
        const normalizedX = Math.max(0, realX / originalWidth);
        const normalizedY = Math.max(0, realY / originalHeight);
        const normalizedW = Math.min(1 - normalizedX, realW / originalWidth);
        const normalizedH = Math.min(1 - normalizedY, realH / originalHeight);
        
        boxes.push({
          id: `det_${Date.now()}_${i}`,
          label: CLASS_LABELS[classId] || `类别${classId}`,
          classId,
          confidence: Math.round(maxScore * 100),
          x: normalizedX * 100, // 转换为百分比
          y: normalizedY * 100,
          width: normalizedW * 100,
          height: normalizedH * 100
        });
      }
    }
  }
  
  return nms(boxes);
}

// 初始化模型
async function initializeModel(modelUrl: string): Promise<void> {
  try {
    console.log('开始初始化ONNX Runtime...');
    
    // 先初始化ONNX Runtime
    await initOnnxRuntime();
    
    console.log('WASM路径:', ort.env.wasm.wasmPaths);
    console.log('模型URL:', modelUrl);
    
    // 设置执行提供者 (使用WASM，稳定性更好)
    const providers = ['wasm'] as const;
    
    // 先检查模型文件是否存在
    const response = await fetch(modelUrl);
    if (!response.ok) {
      throw new Error(`模型文件不存在或无法访问: ${modelUrl} (状态: ${response.status})`);
    }
    
    console.log('模型文件检查通过，开始加载...');
    
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: providers,
      graphOptimizationLevel: 'all',  
      executionMode: 'sequential'
    });
    
    console.log('模型加载成功');
    console.log('输入名称:', session.inputNames);
    console.log('输出名称:', session.outputNames);
    
    isInitialized = true;
    
    postMessage({
      type: 'inited',
      payload: { success: true }
    } as WorkerResponse);
    
  } catch (error) {
    console.error('模型初始化失败:', error);
    postMessage({
      type: 'error',
      payload: { message: `模型初始化失败: ${error}` }
    } as WorkerResponse);
  }
}

// 预热模型
async function warmupModel(): Promise<void> {
  if (!session || !isInitialized) {
    postMessage({
      type: 'error',
      payload: { message: '模型未初始化' }
    } as WorkerResponse);
    return;
  }
  
  try {
    // 创建dummy输入进行预热
    const dummyInput = new Float32Array(1 * 3 * 640 * 640).fill(0);
    const inputTensor = new ort.Tensor('float32', dummyInput, [1, 3, 640, 640]);
    
    await session.run({ images: inputTensor });
    
    postMessage({
      type: 'warmed',
      payload: { success: true }
    } as WorkerResponse);
    
  } catch (error) {
    postMessage({
      type: 'error',
      payload: { message: `模型预热失败: ${error}` }
    } as WorkerResponse);
  }
}

// 执行推理
async function runInference(imageData: ImageData, originalWidth: number, originalHeight: number): Promise<void> {
  if (!session || !isInitialized) {
    postMessage({
      type: 'error',
      payload: { message: '模型未初始化' }
    } as WorkerResponse);
    return;
  }
  
  try {
    const startTime = performance.now();
    
    // 预处理
    const { tensor, scale, padX, padY } = preprocessImage(imageData);
    
    // 推理
    const results = await session.run({ images: tensor });
    const output = results[Object.keys(results)[0]];
    
    // 后处理
    const boxes = postprocessOutput(output, originalWidth, originalHeight, scale, padX, padY);
    
    const inferenceTime = performance.now() - startTime;
    
    postMessage({
      type: 'result',
      payload: {
        boxes,
        timeMs: Math.round(inferenceTime),
        fps: Math.round(1000 / inferenceTime)
      }
    } as WorkerResponse);
    
  } catch (error) {
    postMessage({
      type: 'error',
      payload: { message: `推理失败: ${error}` }
    } as WorkerResponse);
  }
}

// Worker消息处理
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'init':
      await initializeModel(payload.modelUrl);
      break;
      
    case 'warmup':
      await warmupModel();
      break;
      
    case 'infer':
      await runInference(payload.imageData, payload.originalWidth, payload.originalHeight);
      break;
      
    default:
      postMessage({
        type: 'error',
        payload: { message: `未知消息类型: ${type}` }
      } as WorkerResponse);
  }
});