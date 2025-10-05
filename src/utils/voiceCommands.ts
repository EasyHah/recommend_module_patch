// 语音命令解析工具函数（从 useVoiceAssistant 抽离，便于测试与复用）
export interface ParsedCommand {
  raw: string
  text: string
  // 原始基础匹配
  time?: { pattern: RegExp; description: string; groups: string[] }
  vehicle?: { pattern: RegExp; type: string }
  location?: { from: string; to: string }
  // 扩展匹配（推荐侧栏多意图）
  weightKg?: number
  demandType?: 'normal' | 'cold' | 'hazmat' | 'fragile'
  temperatureRange?: [number, number] // 冷链温控范围
  timeWindow?: [string, string] // ISO 字符串
  cities?: { from: string; to: string }
  // 页面导航
  navigation?: { page: string; path: string }
  // 控制标记
  isQuery: boolean
  isClose: boolean
  isWeather: boolean
  isFullscreen: boolean
  isLayer: boolean
  isUndo: boolean
  // 解析到的字段列表（用于 UI 高亮 / 提示 & 撤销）
  changed: string[]
}

// 将中文“上午/下午/晚上/早上”与小时做简单 12h -> 24h 转换
function resolveHour(baseHour: number, period?: string) {
  let h = baseHour
  if (period && /(下午|晚上)/.test(period) && h < 12) h += 12
  if (period && /(早上|上午)/.test(period) && h === 12) h = 0
  return h
}

export function parseCommand(input: string): ParsedCommand {
  const normalizedText = (input || '')
    .replace(/，/g, ',')
    .replace(/。/g, '')
    .toLowerCase()
    .trim()

  const changed: string[] = []

  // 基础时间点匹配（保留原逻辑）
  const timePatterns: Array<{ pattern: RegExp; description: string }> = [
    { pattern: /(?:明天|明日)\s*([0-9]{1,2})[点时]/, description: '明天X点' },
    { pattern: /后天\s*([0-9]{1,2})[点时]/, description: '后天X点' },
    { pattern: /([0-9]{1,2})[点时](?:([0-9]{1,2})分)?/, description: 'X点Y分' },
    { pattern: /([0-9]{1,2})月([0-9]{1,2})[日号]\s*([0-9]{1,2})[点时]/, description: 'X月Y日Z点' }
  ]
  let timeMatch: ParsedCommand['time']
  for (const t of timePatterns) {
    const m = t.pattern.exec(normalizedText)
    if (m) { timeMatch = { pattern: t.pattern, description: t.description, groups: m.slice(1) }; break }
  }

  // 车辆类型
  const vehiclePatterns: Array<{ pattern: RegExp; type: string }> = [
    { pattern: /小[货]?车|轻型车|light ?truck/, type: 'lightTruck' },
    { pattern: /面包车|van/, type: 'van' },
    { pattern: /中[型]?货车|卡车|truck/, type: 'mediumTruck' },
    { pattern: /大[型]?货车|重卡|大卡|heavy ?truck/, type: 'heavyTruck' }
  ]
  const vehicle = vehiclePatterns.find(v => v.pattern.test(normalizedText))
  if (vehicle) changed.push('vehicle')

  // 起终点通用（“起点 X, 终点 Y” 或 “从X到Y”）
  const locationReg = /(?:起点|出发地|从)\s*([\u4e00-\u9fa5a-z0-9\s]+?)(?:[,，]\s*)?(?:终点|目的地|到)\s*([\u4e00-\u9fa5a-z0-9\s]+)/i
  let location: ParsedCommand['location']
  const locM = locationReg.exec(normalizedText)
  if (locM) { location = { from: locM[1].trim(), to: locM[2].trim() }; changed.push('location') }

  // 载重
  let weightKg: number | undefined
  const weightMatch = normalizedText.match(/(?:载重|重量|货重)\s*(\d+(?:\.\d+)?)(?:\s*)(吨|t|公斤|千克|kg)?/) 
    || normalizedText.match(/(?:冷链|危化|易碎|普通)?\s*(\d+(?:\.\d+)?)(吨|t)(?![\w])/)
  if (weightMatch) {
    const num = parseFloat(weightMatch[1])
    const unit = weightMatch[2] || 'kg'
    if (!Number.isNaN(num) && num > 0) {
      weightKg = unit === '吨' || unit === 't' ? Math.round(num * 1000) : Math.round(num)
      changed.push('weightKg')
    }
  }

  // 需求类型
  let demandType: ParsedCommand['demandType']
  if (/冷链/.test(normalizedText)) { demandType = 'cold'; changed.push('demandType') }
  else if (/危化|危险|危化品/.test(normalizedText)) { demandType = 'hazmat'; changed.push('demandType') }
  else if (/易碎|易损/.test(normalizedText)) { demandType = 'fragile'; changed.push('demandType') }
  else if (/普通|常规|标准/.test(normalizedText)) { demandType = 'normal'; changed.push('demandType') }

  // 温区（-5到8度 / 2~8 度）
  let temperatureRange: [number, number] | undefined
  const tempMatch = normalizedText.match(/(?:温度|温区|温控)\s*(-?\d{1,2})\s*(?:到|~|-)\s*(-?\d{1,2})\s*度?/) || normalizedText.match(/(-?\d{1,2})\s*(?:到|~|-)\s*(-?\d{1,2})\s*度?(?:\s*温控)?/)
  if (tempMatch) {
    const a = parseInt(tempMatch[1]); const b = parseInt(tempMatch[2])
    if (!Number.isNaN(a) && !Number.isNaN(b) && a < b) { temperatureRange = [a, b]; changed.push('temperatureRange') }
  }

  // 多意图时间窗（支持: 今天/明天/后天 + 时段 + 半） e.g. “明天上午8点到下午2点”
  let timeWindow: [string, string] | undefined
  const rangeMatch = normalizedText.match(/(今天|明天|后天)?\s*(上午|下午|早上|晚上)?\s*(\d{1,2})点(?:([0-5]?\d)分|半)?\s*(?:到|至|-)\s*(今天|明天|后天)?\s*(上午|下午|早上|晚上)?\s*(\d{1,2})点(?:([0-5]?\d)分|半)?/)
  if (rangeMatch) {
    const [ , startDayWord, startPeriod, startHourRaw, startMinPart, endDayWord, endPeriod, endHourRaw, endMinPart ] = rangeMatch
    const startHour = resolveHour(parseInt(startHourRaw), startPeriod)
    const startMin = startMinPart ? parseInt(startMinPart) : (rangeMatch[0].includes('半') ? 30 : 0)
    const endHour = resolveHour(parseInt(endHourRaw), endPeriod)
    const endMin = endMinPart ? parseInt(endMinPart) : (rangeMatch[0].slice(rangeMatch.index || 0).includes('半') ? 30 : 0)
    const baseStart = new Date(); baseStart.setSeconds(0,0)
    if (startDayWord === '明天') baseStart.setDate(baseStart.getDate() + 1)
    else if (startDayWord === '后天') baseStart.setDate(baseStart.getDate() + 2)
    baseStart.setHours(startHour, startMin, 0, 0)
    const baseEnd = new Date(); baseEnd.setSeconds(0,0)
    if ((endDayWord || startDayWord) === '明天') baseEnd.setDate(baseEnd.getDate() + 1)
    else if ((endDayWord || startDayWord) === '后天') baseEnd.setDate(baseEnd.getDate() + 2)
    baseEnd.setHours(endHour, endMin, 0, 0)
    if (baseEnd < baseStart) baseEnd.setHours(baseEnd.getHours() + 4)
    timeWindow = [baseStart.toISOString(), baseEnd.toISOString()]
    changed.push('timeWindow')
  }

  // 简易城市模式（城市级）
  let cities: ParsedCommand['cities']
  const cityPattern = /(?:起点|从)\s*([\u4e00-\u9fa5]{2,10})\s*(?:终点|到)\s*([\u4e00-\u9fa5]{2,10})/
  const cityMatch = normalizedText.match(cityPattern)
  if (cityMatch) { cities = { from: cityMatch[1], to: cityMatch[2] }; changed.push('cities') }

  // 页面导航关键字 -> path 映射（可根据 router/index.ts 扩展）
  const pageMap: Record<string, { keywords: RegExp; path: string; page: string }> = {
    dashboard: { keywords: /(首页|主页|dashboard)/, path: '/', page: 'dashboard' },
    route: { keywords: /(路线|路径|导航规划|路线规划|route)/, path: '/route', page: 'route' },
    recommend: { keywords: /(推荐|商家推荐|供应商|vendor|recommend)/, path: '/recommend', page: 'recommend' },
    weather: { keywords: /(天气分析|天气|weather)/, path: '/weather', page: 'weather' },
    weatherTest: { keywords: /(天气测试|weather test|weather-test)/, path: '/weather-test', page: 'weather-test' },
    video: { keywords: /(视频识别|目标识别|video|video recognition)/, path: '/video-recognition', page: 'video-recognition' },
  fire: { keywords: /(疏散|消防|演练|fire|evacuation)/, path: '/fire-evacuation', page: 'fire-evacuation' }
  }
  let navigation: ParsedCommand['navigation']
  for (const k in pageMap) {
    if (pageMap[k].keywords.test(normalizedText)) { navigation = { page: pageMap[k].page, path: pageMap[k].path }; changed.push('navigation'); break }
  }

  const parsed: ParsedCommand = {
    raw: input,
    text: normalizedText,
    time: timeMatch,
    vehicle,
    location,
    weightKg,
    demandType,
    temperatureRange,
    timeWindow,
    cities,
  navigation,
    isQuery: /查询|搜索|开始|执行|规划/.test(normalizedText),
    isClose: /关闭|收起|隐藏|退出/.test(normalizedText),
    isWeather: /天气|气象|预报/.test(normalizedText),
    isFullscreen: /全屏|放大|最大/.test(normalizedText),
    isLayer: /图层|天气图层|省份/.test(normalizedText),
    isUndo: /撤销|回退|上一步/.test(normalizedText),
    changed
  }

  return parsed
}

export function formatParsedCommand(pc: ParsedCommand): string {
  return JSON.stringify({
    text: pc.text,
    time: pc.time?.description,
    vehicle: pc.vehicle?.type,
    location: pc.location,
    weightKg: pc.weightKg,
    demandType: pc.demandType,
    temperatureRange: pc.temperatureRange,
    timeWindow: pc.timeWindow,
    cities: pc.cities,
    undo: pc.isUndo,
    flags: {
      query: pc.isQuery,
      close: pc.isClose,
      weather: pc.isWeather,
      fullscreen: pc.isFullscreen,
      layer: pc.isLayer
    }
  }, null, 2)
}
