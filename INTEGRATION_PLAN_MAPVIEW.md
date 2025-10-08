# MapView 组件整合计划

目标：仅保留 `src/components/MapView.vue` 作为唯一地图组件，把 `src/views/MapView.vue` 当前存在的：
1. 抛物线演示 (animatedParabola)
2. 红点全景跳转 (redPoints + 鼠标移动显示 + 点击打开 URL)
3. CSV + vendors.json 说明面板（当前视图版是 description HTML；组件版已有更完善的“仓库调试面板”）
4. 地下管线分析与挖方/剖面功能（组件版已有，更完整）

分析：
- 组件版 MapView.vue 已包含仓库调试、vendors 聚合、线路明细展示（使用 vendorsByCenter + aggregatedCenterMetrics + currentCenterVendors）。
- 视图版 MapView.vue 的 CSV 与 vendors 描述逻辑是以 entity.description 为主，不再需要重复。
- 视图版独有功能：
  * animatedParabola (演示用)
  * 红点全景点位 (billboard + 动态显示 + URL 跳转)
- 这些功能可安全迁移到组件版 onMounted 中作为可选特性，通过 UI 开关（pano / demoParabola）。

整合步骤：
1. 在组件版 `ui` 状态里添加：`demoParabola: true`；保留现有 `pano` 逻辑（若没有则创建）。
2. 在组件版 onMounted 中加入：
   - animatedParabola 函数 + twoPoints 常量（受 ui.demoParabola 控制）。
   - redPoints 数组与 createScaledRedDot、鼠标距离显示与点击跳转逻辑（受 ui.pano 控制）。
3. 把视图版中 vendors 载入 + 聚合的任何差异对照组件版已有逻辑；若组件版缺少 normalize centerName 逻辑则补充。
4. 删除 `src/views/MapView.vue` ，或保留备份为 `MapView.legacy.vue`。
5. 搜索项目引用路径，确认路由 / 其他视图引用使用 `<MapView />` （组件版）。如某些页面 import `@/views/MapView.vue`，改为 `@/components/MapView.vue`。
6. 构建 & 手动验证：
   - 仓库调试面板是否仍正常。
   - 点击仓库是否出现线路明细（来自 vendors.json）。
   - 打开/关闭 demoParabola 与 pano 是否生效。

回退策略：保留 Git 分支 `restore-v6.2`，若整合后出现异常，可通过 `git checkout` 还原。

下一步：请确认是否直接执行整合（Y/N），或需要先精简 animatedParabola / 红点点位列表。

— 生成于整合准备阶段