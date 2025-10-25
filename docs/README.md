# 文档与测试页面统一索引（Documentation Index）

> 目标：把分散在根目录与 `docs/`、独立测试 HTML 页面中的说明集中分类，便于新人 5 分钟内定位“我要看哪个文件 / 打开哪个测试页”。本索引不重复大篇幅内容，只做结构化导航与快速指引。

---
## 1. 总览 / 入口
| 场景 | 首选阅读 | 补充/深入 | 快速演示页面 | 相关路由 |
|------|----------|-----------|--------------|----------|
| 项目整体功能一览 | `README.md` | `INTEGRATION_PROJECT_COMPLETE.md` | （无） | `/` |
| 集成交付成果（整体验收） | `INTEGRATION_PROJECT_COMPLETE.md` | `README_INTEGRATION_COMPLETE.md` | （无） | `/` |
| 运行/构建指引 | `README.md` | （无） | （无） | `/` |
| 常见修复/补丁汇总 | `BUG_FIXES_REPORT.md` | 单项修复文档（见第 5 节） | （无） | 多路由 |

---
## 2. 测试 & 独立演示页面（HTML）
| 文件 / 访问路径 | 作用定位 | 绑定功能模块 | 快速操作步骤 | 相关文档 |
|-----------------|----------|--------------|--------------|----------|
| `appflow-test-standalone.html` (`/appflow-test-standalone.html`) | 最小环境验证 Appflow Chat SDK，可排除框架干扰 | Appflow Chat | 1. 填 integrateId / requestDomain 2. 初始化 3. 显示窗口 4. 发送测试消息 | `APPFLOW_TEST_GUIDE.md`、`APPFLOW_CHAT_USAGE_GUIDE.md` |
| `appflow-test.html` (`/appflow-test.html`) | 在项目环境内验证 Chat SDK 方法/事件 | Appflow Chat | 1. 打开页面 2. 观察按钮状态 3. 控制显隐与消息 | `APPFLOW_CHAT_INTEGRATION_COMPLETE.md` |
| `voice-ai-integration.html` (`/voice-ai-integration.html`) | 语音识别 + Chat 联动综合演示 | 语音助手 + Chat | 1. 允许麦克风 2. 语音下达指令 3. 观察 Chat 响应 | `docs/VOICE_ASSISTANT.md`、`APPFLOW_CHAT_INTEGRATION_COMPLETE.md` |
| `voice-debug.html` (`/voice-debug.html`) | 语音识别调试（中间态/识别片段/事件日志） | 语音助手 | 1. 开启识别 2. 说出多种指令 3. 查看实时日志 | `docs/VOICE_ASSISTANT.md` |
| `test-tts.html` (`/test-tts.html`) | TTS 发音测试（多文本/参数） | 语音助手 TTS | 1. 输入文本 2. 选择语速/音调 3. 播放 | `docs/VOICE_ASSISTANT.md` |
| `voice-debug.html`（public/ 同名） | 部署后静态调试副本 | 语音助手 | 与上相同（静态资源 fallback） | `docs/VOICE_ASSISTANT.md` |
| `2.html` / 其它临时 | 临时/实验性 | 不确定 | 不纳入主链路 | （建议清理或迁移） |

> 说明：所有独立 HTML 位于根目录或 `public/` 下，本地 `npm run dev` 后直接以 `/文件名` 访问；打包生产后需确认是否复制到 dist。

---
## 3. 功能模块文档分类
| 模块 | 首选文档 | 说明 | 关键源码定位 |
|------|----------|------|--------------|
| 天气分析 & 路线风险 | `docs/modules/weather.md` | 功能/风险/算法汇总 | `src/services/weather.ts`、`src/views/WeatherAnalysis.vue` |
| 视频识别 (YOLO + ORT) | `docs/modules/video-recognition.md` | 推理/性能/参数 | `src/views/VideoRecognition.vue`、`public/models/` |
| 语音助手 | `docs/modules/voice.md` | 组成 / 指令 / 联动 | 语音相关源码 |
| Appflow Chat 集成 | `docs/modules/appflow-chat.md` | 架构 / 调试 / 降级 | `src/composables/useAppflowChat.ts` |
| Appflow Chat 使用 / 调试 | `docs/modules/appflow-chat.md` | 合并至单文件 | 同上 |
| Appflow Chat 独立测试 | `docs/modules/appflow-chat.md` | 统一入口含测试页表 | `appflow-test-standalone.html` |
| 地图 / 高德加载修复 | `docs/modules/map-amap-fix.md` | 动态加载、插件与弱网防御 | `src/utils/amapLoader.ts` |
| 路由 & 天气导航修复 | `docs/troubleshooting/router-weather.md` | 推荐侧栏导航 / Driving 插件 / URL 参数 | `src/router/`、`src/views/WeatherAnalysis.vue` |
| 天气路由（合并） | `docs/troubleshooting/router-weather.md` | 已并入同一修复文档 | 同上 |
| 语音 / 音频故障排查 | `docs/troubleshooting/voice.md` | 合并后统一排障 & 修复 | 语音相关源码 |
| 缺陷修复汇总 | `BUG_FIXES_REPORT.md` | 多个子问题统一 | 多模块 |

---
## 4. 场景式“我要做…”导航
| 需求 | 去哪里？ | 核心步骤速览 |
|------|----------|--------------|
| 想快速演示全套功能 | `README.md` + 第 2 节测试页表格 | 依次：天气 → 语音 → Chat → 视频识别 |
| 排查 Chat 无法显示 / 400 | `APPFLOW_TEST_GUIDE.md` → 打开 `appflow-test-standalone.html` | 检查 integrateId / 域名白名单 / 过期 |
| 看语音指令怎么解析 | `docs/VOICE_ASSISTANT.md` | 查看 `voiceCommands.ts` 并在 `voice-debug.html` 验证 |
| 验证视频识别性能 | `VIDEO_RECOGNITION_DEMO.md` | 切换 mock/真实模式，观察 FPS 与图表 |
| 增加天气指标或算法 | `WEATHER_INTEGRATION_COMPLETE.md` | 扩展风险计算函数 / 缓存策略 |
| 定位地图加载失败 | `AMAP_API_FIX.md` | 对比控制台错误 & 动态加载逻辑 |

---
## 5. 修复 / 补丁类文档归档
| 文档 | 类型 | 建议操作 |
|------|------|----------|
| (已合并) 地图修复 | `docs/modules/map-amap-fix.md` | 统一保留 |
| (已合并) 路由 / 天气导航 | `docs/troubleshooting/router-weather.md` | 统一保留 |
| (已合并) 语音故障 | `docs/troubleshooting/voice.md` | 统一保留 |
| `BUG_FIXES_REPORT.md` | 汇总 | 持续更新；每条引用详细来源 |

> 建议：合并后的文档在开头添加“合并自 XXX（日期）”注释，减少重复维护。

---
## 6. 建议的文档目录重构（可选实施）
```
docs/
  README.md ( = 本索引文件 )
  modules/
    weather.md
    voice.md
    appflow-chat.md
    video-recognition.md
    map-amap-fix.md
  testing/
    appflow-standalone.md
    voice-debug.md
  troubleshooting/
    chat.md
    voice.md
    map.md
  changelog/
    bug-fixes.md
    patches.md
```
实施步骤（渐进式）：
1. 复制现有内容到新结构文件（保持原文件一段时间）
2. 在旧文件顶部加“已迁移到 docs/... 路径”提示
3. 2 个迭代后删除冗余 / 合并文件

---
## 7. 快速核查清单（Onboarding Checklist）
| 项目新人需要确认 | 已看？ |
|------------------|--------|
| 能在本地跑起来（`README.md`） | [ ] |
| 知道测试 HTML 如何访问 | [ ] |
| 知道 Chat 出问题先去哪（独立页 + Test Guide） | [ ] |
| 能解释语音指令解析链路 | [ ] |
| 知道天气风险计算因素 | [ ] |
| 理解视频识别 mock 与真实模式差别 | [ ] |
| 知道 bug 修复文档总入口 | [ ] |

---
## 8. 后续优化建议
| 优先级 | 建议 | 价值 |
|--------|------|------|
| 高 | 执行第 6 节目录重构 | 降低文档重复维护成本 |
| 高 | 合并语音相关两个故障文档 | 消除信息分散 |
| 中 | 为测试页增加统一顶栏（返回主页 / 文档链接） | 提升可导航性 |
| 中 | 在 `README.md` 加“测试页入口表”链接到本文件 | 可发现性提升 |
| 低 | 接入自动文档生成（typedoc / vue-docgen） | 长期维护便利 |

---
## 9. 维护说明
- 本索引文件手动维护，变更任何测试页或新增文档时请同步更新
- 建议在 PR 模板中加入：是否更新 `docs/DOCUMENTATION_INDEX.md`？

---
**最后更新**: 2025-10-05 （清理重复文档：已删除合并后的旧修复文件）

如需进一步拆分/合并，请在本文件开头追加“结构变更日志”小节。

---
## 附：更换“全景红点”图标（1 分钟）
- 图标文件位置：`public/Assets/Images/pano-dot.svg`（外部链接红点）、`public/Assets/Images/pano-360.svg`（本地 360° 全景点）
- 代码映射位置：`src/components/MapView.vue` 顶部的 `PANO_ICON_CONFIG`
  - external → 非 marzipano 类型
  - marzipano → 使用内置全景查看器的点位
- 更换方式：
  1) 直接替换同名 SVG/PNG 文件；或
  2) 修改 `PANO_ICON_CONFIG` 中的 `image/width/height` 指向你自己的图标路径

注意：图标通过 Cesium Billboard 显示，尺寸单位为像素；远近缩放由 `scaleByDistance` 控制，如需更改请在同处微调。

---
## 快速入口：操作手册（推荐给新同学）
- 《操作手册（zh-CN）》：`docs/OPERATION_GUIDE.zh-CN.md`
  - 面向“怎么跑起来、怎么演示、出问题去哪看”的可操作指南
  - 覆盖快速开始、环境变量、页面导航、模块分步、典型场景、FAQ、图样建议
