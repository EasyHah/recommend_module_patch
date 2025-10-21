<!-- Moved from WEATHER_INTEGRATION_COMPLETE.md & README_WEATHER_INTEGRATION.md -->
# 天气分析与路线规划模块 (Weather Module)

> 本文件整合原 `WEATHER_INTEGRATION_COMPLETE.md` 与 `README_WEATHER_INTEGRATION.md` 关键内容，聚焦：功能概览 / 环境配置 / API / 评估算法 / 可视化 / 扩展建议。

## 1. 功能概览
- 省份天气概览与风险着色
- 路径天气分析（风险评分 / 关键路段 / 替代路线 / 出行时机）
- 实时预警（灾害等级、物流影响）
- 推荐算法天气权重融合（避险策略）

## 2. 环境变量
```ini
VITE_QWEATHER_KEY=你的和风天气API密钥
VITE_AMAP_KEY=你的高德地图API密钥
VITE_AMAP_SECURITY=你的高德安全密钥
```

## 3. 核心文件映射
| 作用 | 文件 |
|------|------|
| 天气服务聚合 | `src/services/weather.ts` |
| 灾害预警评估 | `src/services/disaster.ts` |
| 分析页面 | `src/views/WeatherAnalysis.vue` |
| 省份风险可视化 | `WeatherAnalysis.vue` 内部 mapping 与着色逻辑 |
| 风险算法/Mock | 同上（未来可抽离） |

## 4. API 片段示例
```ts
const provinceWeather = await weatherService.getProvinceWeather()
const analysis = await weatherService.analyzeRoute({
  origin: { lat: 39.9, lng: 116.4 },
  destination: { lat: 31.23, lng: 121.47 }
})
```

## 5. 风险评估要素
| 因素 | 描述 | 影响 |
|------|------|------|
| 温度 | 极端高低温 | 增加风险分值 |
| 降水 | 雨/雪/暴雨雷暴 | 触发高风险或极高风险 |
| 风速 | 大风路段 | 增加横风危险 |
| 能见度 | 雾霾低能见度 | 降低通行安全 |
| 预警事件 | 灾害预警 | 直接标记关键路段 |

## 6. 推荐算法融合点
伪代码：
```ts
score = baseScore
if (weatherFactor.enabled) {
  score -= riskScore * weight
  if (avoidSevere && hasExtreme) score -= penalty
}
```

## 7. 可视化说明
- 省份颜色：riskLevel → 低/中/高/极端 → Green/Amber/Orange/Red
- 路线图层：Driving 规划 + 风险路段 overlay（可扩展 polyline 样式）
- 预警：在城市/路段打点 + Tooltip 列表（最多前 3 条）

## 8. 性能与优化
| 方向 | 策略 |
|------|------|
| API 频率 | 省份数据缓存 30min |
| 地图加载 | 动态 AMap + 插件按需 (`utils/amapLoader.ts`) |
| 重渲染 | 仅在风险层或路线切换重新绘制 |

## 9. 故障排查快速指引
| 症状 | 排查 |
|------|------|
| 无地图 | 检查 `VITE_AMAP_KEY` & 控制台脚本加载 | 
| 无天气数据 | 检查 `VITE_QWEATHER_KEY` / API 配额 | 
| 预警为空 | 真实数据源未接入/Mock 模式 | 
| 风险始终中等 | Mock 分值未按真实数据计算 |

## 10. 扩展建议
- 历史天气趋势 / 预测
- 风场可视化（流线）
- 多源融合（气象局 + 和风）
- 用户自定义风险阈值

---
最后更新：2025-10-05
