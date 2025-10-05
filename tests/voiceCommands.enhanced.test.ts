import { describe, it, expect } from 'vitest'
import { parseCommand } from '@/utils/voiceCommands'

describe('voiceCommands enhanced parsing', () => {
  it('parses weight in tons', () => {
    const pc = parseCommand('载重 12 吨 冷链 温度 2 到 8 度')
    expect(pc.weightKg).toBe(12000)
    expect(pc.demandType).toBe('cold')
    expect(pc.temperatureRange).toEqual([2,8])
  })
  it('parses temperature range shorthand', () => {
    const pc = parseCommand('2到8度冷链货物')
    expect(pc.temperatureRange).toEqual([2,8])
    expect(pc.demandType).toBe('cold') // 仍未主动设置，但后续业务层会设为 cold
  })
  it('parses time window', () => {
    const pc = parseCommand('明天上午8点到下午3点 查询')
    expect(pc.timeWindow).toBeTruthy()
    expect(pc.isQuery).toBe(true)
  })
  it('parses cities', () => {
    const pc = parseCommand('从上海到北京 冷链10吨')
    expect(pc.cities).toEqual({ from: '上海', to: '北京' })
    expect(pc.weightKg).toBe(10000)
  })
  it('parses undo intent', () => {
    const pc = parseCommand('撤销 刚刚的设置')
    expect(pc.isUndo).toBe(true)
  })
})
