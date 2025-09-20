// 创建一个模拟的YOLO检测结果用于测试
// 这个文件用于在没有真实模型时提供演示数据

export const mockYOLOResults = [
  {
    id: 'mock_1',
    label: '人员',
    classId: 0,
    confidence: 92,
    x: 25.5,
    y: 15.2,
    width: 18.3,
    height: 32.1
  },
  {
    id: 'mock_2',
    label: '汽车',
    classId: 2,
    confidence: 87,
    x: 60.2,
    y: 45.8,
    width: 25.6,
    height: 18.9
  },
  {
    id: 'mock_3',
    label: '人员',
    classId: 0,
    confidence: 78,
    x: 12.1,
    y: 38.7,
    width: 15.2,
    height: 28.4
  }
];

// 生成随机的模拟检测结果
export function generateMockResults(): typeof mockYOLOResults {
  const labels = ['人员', '汽车', '卡车', '自行车'];
  const classIds = [0, 2, 7, 1];
  const count = Math.floor(Math.random() * 4) + 1;
  
  return Array.from({ length: count }, (_, i) => {
    const labelIndex = Math.floor(Math.random() * labels.length);
    return {
      id: `mock_${Date.now()}_${i}`,
      label: labels[labelIndex],
      classId: classIds[labelIndex],
      confidence: Math.floor(Math.random() * 30) + 70,
      x: Math.random() * 70,
      y: Math.random() * 60,
      width: Math.random() * 20 + 10,
      height: Math.random() * 25 + 15
    };
  });
}