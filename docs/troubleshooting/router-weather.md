# 路由与天气页面导航修复整合说明

> 合并自 `VUE_ROUTER_FIX.md`、`README_ROUTE_PATCH.md`、`WEATHER_ROUTE_FIX_GUIDE.md`（原文件建议标记“已迁移”）。

## 1. 修复背景
多处组件（如 `RecommendSidebar`、天气分析入口）出现：
- `injection "Symbol(router)" not found`（独立挂载未共享路由实例）
- 推路线规划时报 `window.AMap.Driving is not a constructor`（插件未加载）
- 天气按钮导航 `Cannot read properties of undefined (reading 'push')`

## 2. 关键修复措施汇总
| 问题 | 根因 | 方案 | 代码要点 |
|------|------|------|----------|
| 路由器注入失败 | 独立 createApp 未 use(router) | 共享主实例的 router & pinia | `mountRecommendSidebar.ts` 调用 `app.use(router)` |
| Driving 插件异常 | 仅加载基础脚本 | 动态按需 `AMap.plugin([...])` | `ensurePlugins(['AMap.Driving', ...])` |
| 导航 push 失败 | 侧栏上下文中 router 未注入 | 改用 `window.location.href` 兜底 | 构造 URL + 参数序列化 |
| 组件解析警告 | 未注册依赖组件 | 显式 import 并注册 | `FluentCard`、推荐表单组件 |
| TS 类型不匹配 | 默认空字符串不在联合类型 | 赋默认合法值 | `demand.type='normal'` |

## 3. 推荐导航封装
```ts
export function navigateToWeatherWithParams(params: {
  origin?: {lat:number; lng:number}
  destination?: {lat:number; lng:number}
  showRoute?: boolean
}) {
  const usp = new URLSearchParams()
  if (params.showRoute) usp.set('showRoute','true')
  if (params.origin) usp.set('origin', `${params.origin.lat},${params.origin.lng}`)
  if (params.destination) usp.set('destination', `${params.destination.lat},${params.destination.lng}`)
  const url = `/weather?${usp.toString()}`
  // 优先使用 Router，如不可用则回退
  try {
    // @ts-ignore
    if (window.__APP_ROUTER__?.push) return window.__APP_ROUTER__.push(url)
  } catch { /* ignore */ }
  window.location.href = url
}
```
> 可在主应用启动时：`window.__APP_ROUTER__ = router` 方便独立挂载区域调用。

## 4. Weather 页面参数解析（示意）
```ts
const route = useRoute()
const parseCoord = (s?: string) => {
  if (!s) return null
  const [lat,lng] = s.split(',').map(Number)
  return Number.isFinite(lat)&&Number.isFinite(lng)? {lat,lng}: null
}
const origin = parseCoord(route.query.origin as string)
const dest = parseCoord(route.query.destination as string)
if (origin && dest && route.query.showRoute === 'true') {
  // 初始化路线规划逻辑...
}
```

## 5. 验证矩阵
| 场景 | 期望结果 | 控制台 | 备注 |
|------|----------|--------|------|
| 仅点击天气按钮 | 进入 `/weather` 默认视图 | 无 error | | 
| 带起终点导航 | URL 含 origin/destination | 打印解析日志 | 自动规划路线 |
| 浏览器刷新后 | 状态可重建 | 重新加载地图 & 路线 | 依赖查询参数 |
| 地图插件未缓存 | 首次等待插件加载 | 插件成功日志 | 无报错 |

## 6. 排障指引
| 症状 | 排查 | 处理 |
|------|------|------|
| 仍报 router 注入缺失 | 是否多实例 createApp | 合并为单例或共享实例引用 |
| Driving 仍未定义 | 是否执行 `AMap.plugin` | 检查插件数组拼写与加载顺序 |
| URL 参数无效 | query 格式 | 确认 `lat,lng` 顺序与数值合法 |
| 刷新后状态丢失 | 依赖内存状态 | 通过 URL/LocalStorage 重建 |

## 7. 进一步改进
- 建立 `router/navigate.ts` 统一导航适配层
- 在构建时注入 `__BUILD_TIME__` 便于调试缓存问题
- 为推荐侧栏与主应用之间建立桥接事件 Bus（减少直接访问 window）

## 8. 迁移状态
| 旧文件 | 状态 |
|--------|------|
| `VUE_ROUTER_FIX.md` | 已整合 |
| `README_ROUTE_PATCH.md` | 已整合 |
| `WEATHER_ROUTE_FIX_GUIDE.md` | 已整合 |

---
**最后更新**：2025-10-05  
**负责人**：前端路由子系统 Owner
