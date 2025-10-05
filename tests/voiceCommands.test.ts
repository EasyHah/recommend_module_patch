import { describe, it, expect } from 'vitest'
import { parseCommand } from '@/utils/voiceCommands'

describe('voiceCommands.parseCommand', () => {
  it('解析时间：明天8点', () => {
    const p = parseCommand('明天8点出发')
    expect(p.time?.description).toBe('明天X点')
  })

  it('解析起点终点', () => {
    const p = parseCommand('起点北京终点上海')
    expect(p.location?.from).toBe('北京')
    expect(p.location?.to).toBe('上海')
  })

  it('识别车辆类型：小货车', () => {
    const p = parseCommand('小货车')
    expect(p.vehicle?.type).toBeTruthy()
  })

  it('识别关闭指令', () => {
    const p = parseCommand('请关闭窗口')
    expect(p.isClose).toBe(true)
  })

  it('识别天气指令', () => {
    const p = parseCommand('打开天气分析')
    expect(p.isWeather).toBe(true)
  })
})
