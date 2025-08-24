# Patch: 路径页并入现有路由 & 菜单

本补丁新增：
- `src/views/RoutePlan.vue`：基于高德JS的路径规划视图，支持“用此路线做推荐”（桥接到推荐页）
- 修改 `src/router/index.ts`：新增 `{ path:'/route', name:'route', component: RoutePlan }`
- 修改 `src/components/TopBar.vue`：在中部导航加入“路径规划”入口

## 使用方法
1. 将补丁内容覆盖到项目同路径。
2. 在项目根目录创建 `.env.local`，加入：
   ```env
   VITE_AMAP_KEY=你的高德Web服务Key
   # 可选（如果开启了安全配置）
   VITE_AMAP_SECURITY=你的安全码
   ```
3. `npm run dev` 启动后，顶部菜单出现“路径规划”。
4. 输入起终点（可填中文地址或 `lat,lng`），点击“规划路线”。成功后点击“用此路线做推荐”。
5. 前往“商家推荐”页，点击“从路径读取”或直接等待自动订阅注入。

> 兼容性：补丁尽量保持最小侵入，样式沿用你现有的 Fluent 风格组件。
