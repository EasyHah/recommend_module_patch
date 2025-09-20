#!/usr/bin/env python3
"""
创建一个用于测试的简单ONNX模型
这个脚本会生成一个模拟YOLOv8输出格式的简单模型
"""

import onnx
import numpy as np
from onnx import helper, TensorProto

def create_test_yolo_model():
    # 定义输入：images [1, 3, 640, 640]
    input_tensor = helper.make_tensor_value_info(
        'images', TensorProto.FLOAT, [1, 3, 640, 640]
    )
    
    # 定义输出：output [1, 84, 8400] (YOLOv8格式)
    output_tensor = helper.make_tensor_value_info(
        'output0', TensorProto.FLOAT, [1, 84, 8400]
    )
    
    # 创建一个简单的恒等变换节点（实际不做任何处理，只是为了测试）
    # 在实际应用中，这里会是复杂的卷积神经网络
    reshape_node = helper.make_node(
        'Reshape',
        inputs=['images'],
        outputs=['reshaped'],
        shape=[1, -1]
    )
    
    # 创建常量张量作为输出形状
    output_shape = helper.make_tensor(
        name='output_shape',
        data_type=TensorProto.INT64,
        dims=[3],
        vals=[1, 84, 8400]
    )
    
    # 最终reshape到YOLOv8输出格式
    final_reshape = helper.make_node(
        'Reshape',
        inputs=['reshaped', 'output_shape'],
        outputs=['output0']
    )
    
    # 创建图
    graph = helper.make_graph(
        [reshape_node, final_reshape],
        'test_yolo_model',
        [input_tensor],
        [output_tensor],
        [output_shape]
    )
    
    # 创建模型
    model = helper.make_model(graph)
    model.opset_import[0].version = 11
    
    # 保存模型
    onnx.save(model, 'yolov8n_test.onnx')
    print("测试模型已创建：yolov8n_test.onnx")

if __name__ == "__main__":
    try:
        create_test_yolo_model()
    except ImportError:
        print("需要安装onnx库：pip install onnx")
        print("或者直接下载真实的YOLOv8模型：")
        print("wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx")