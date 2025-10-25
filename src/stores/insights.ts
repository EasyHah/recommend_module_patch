import { defineStore } from 'pinia'

type Level = '蓝色' | '黄色' | '橙色' | '红色'

export const useInsightsStore = defineStore('insights', {
  state: () => ({
    counts: {
      warehouses: 0,
      facilities: 0,
      extinguishers: 0,
      panoramas: 0,
    },
    pipelines: {
      byType: {} as Record<string, number>,
      total: 0,
    },
    weather: {
      warningsByLevel: { 蓝色: 0, 黄色: 0, 橙色: 0, 红色: 0 } as Record<Level, number>,
      tempPoints: 0,
      enabledFlags: {
        weather: false,
        temperature: false,
        precipitation: false,
        wind: false,
        warnings: false,
        opacity: 70,
      },
    },
  }),
  actions: {
    setCounts(next: Partial<{ warehouses: number; facilities: number; extinguishers: number; panoramas: number }>) {
      this.counts = { ...this.counts, ...next }
    },
    setPipelines(byType: Record<string, number>) {
      this.pipelines.byType = { ...byType }
      this.pipelines.total = Object.values(byType).reduce((a, b) => a + (b || 0), 0)
    },
    setWeatherWarnings(levelMap: Partial<Record<Level, number>>) {
      this.weather.warningsByLevel = { ...this.weather.warningsByLevel, ...levelMap }
    },
    setWeatherTempPoints(n: number) {
      this.weather.tempPoints = n || 0
    },
    setWeatherFlags(flags: Partial<{ weather: boolean; temperature: boolean; precipitation: boolean; wind: boolean; warnings: boolean; opacity: number }>) {
      this.weather.enabledFlags = { ...this.weather.enabledFlags, ...flags }
    },
  },
})
