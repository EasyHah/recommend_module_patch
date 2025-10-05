# 总览主页面（Dashboard/MapView）模型与加载优化说明

## 变更摘要
- 新增加载遮罩与进度条，展示关键资源加载阶段。
- Cesium Ion Token 改为读取环境变量 `VITE_CESIUM_ION_TOKEN`（新增 `.env.example`）。
- 摄像机 `changed` 事件加 150ms 节流，减少 requestRender 频率。
- 数据加载阶段拆分：关键 3D Tiles / GeoJSON 与次要资源（可跳过）。
- 加载提示中给出优化 hints，支持一键跳过次要资源。

## 使用方式
1. 复制 `.env.example` 为 `.env.local` 并填写真实 Token：
```
VITE_CESIUM_ION_TOKEN=xxxx
```
2. 启动开发：`npm run dev`，初次进入总览会看到进度面板。

## 后续可拓展
- 监听 Tileset `tileLoad` 事件细化实时百分比。
- 管线数据拆出懒加载按钮（当前仍一次性加载，只是 UI 结构已预留）。
- 将 loading 状态抽象为 composable 或 Pinia store 支持全局复用。
- 添加失败重试按钮与错误 Toast。

## 回滚指南
删除 `MapView.vue` 中 `loading` 相关 reactive 与模板 overlay，并恢复 onMounted 内原始加载逻辑即可。
