# 高德地图（AMap）动态加载与插件使用指引

> 合并自 `AMAP_API_FIX.md`（原始创建：2024-12）。本文件纳入模块化目录后，旧文件建议保留 1~2 个迭代并添加迁移提示。

## 1. 场景与问题
在 `WeatherAnalysis.vue` 等使用高德地图的页面出现：
```
高德地图API未加载 / window.AMap 未定义 / Driving 插件不可用
```
根因：未做动态脚本加载或未加载所需插件（Driving、Geocoder 等）。

## 2. 推荐封装（示例）
```ts
// src/utils/amapLoader.ts
let amapPromise: Promise<typeof window.AMap | null> | null = null

export function ensureAMapLoaded() {
  if (typeof window !== 'undefined' && window.AMap) return Promise.resolve(window.AMap)
  if (amapPromise) return amapPromise
  amapPromise = new Promise(async (resolve, reject) => {
    const key = import.meta.env.VITE_AMAP_KEY
    const sec = import.meta.env.VITE_AMAP_SECURITY
    if (!key) { console.error('缺少 VITE_AMAP_KEY'); resolve(null); return }
    if (sec) (window as any)._AMapSecurityConfig = { securityJsCode: sec }
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}`
    script.async = true
    script.onload = () => resolve(window.AMap)
    script.onerror = () => reject(new Error('AMap 脚本加载失败'))
    document.head.appendChild(script)
  })
  return amapPromise
}

export async function ensurePlugins(plugins: string[]) {
  const AMap = await ensureAMapLoaded()
  if (!AMap) return null
  return new Promise<typeof window.AMap>((resolve) => {
    AMap.plugin(plugins, () => resolve(AMap))
  })
}
```

## 3. 初始化用法
```ts
async function initRouteMap(el: HTMLElement) {
  const AMap = await ensurePlugins(['AMap.Driving','AMap.Geocoder','AMap.InfoWindow','AMap.Marker','AMap.Circle'])
  if (!AMap) { console.warn('AMap 不可用'); return }
  const map = new AMap.Map(el, { zoom: 5, center: [116.397428, 39.90923] })
  // ... 继续后续逻辑
}
```

## 4. 错误兜底与提示
| 场景 | 建议提示 | 动作 |
|------|----------|------|
| 缺少 key | 控制台 + UI toast | 引导配置 `.env.local` |
| 驱动插件未就绪 | 延迟重试一次 | 输出 plugin 列表 |
| 网络失败 | 提示“检查网络或防火墙” | 提供重载按钮 |

## 5. 环境变量示例
```ini
VITE_AMAP_KEY=your-key
VITE_AMAP_SECURITY=your-security-code
# 可选 REST 调用：
VITE_AMAP_REST_KEY=rest-api-key
```

## 6. 验证步骤
1. 进入 `/weather` 观察控制台：“AMap 脚本加载成功 / 插件加载成功”
2. 输入起终点做一次路线规划
3. 观察 Driving 服务结果 & 标记点渲染

## 7. 后续优化
- 缓存 script 标签避免重复创建
- Service Worker 预缓存地图脚本（注意协议与缓存策略）
- 统一错误事件总线 (`amap:load-error`) 供 UI 订阅

---
**维护**：`docs/modules/map-amap-fix.md`  （替代：`AMAP_API_FIX.md`）