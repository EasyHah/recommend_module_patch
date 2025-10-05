/**
 * 高德地图脚本与插件加载器（集中封装）
 * - 去重加载
 * - 插件按需加载
 * - 简单失败重试（一次）
 */
let amapPromise: Promise<typeof window.AMap | null> | null = null

interface AMapWindow extends Window {
  AMap: any
  _AMapSecurityConfig?: any
}

declare const window: AMapWindow

export async function loadAMapBase(): Promise<typeof window.AMap | null> {
  if (typeof window !== 'undefined' && window.AMap) return window.AMap
  if (amapPromise) return amapPromise

  amapPromise = new Promise(async (resolve) => {
    const key = (import.meta as any).env.VITE_AMAP_KEY
    const sec = (import.meta as any).env.VITE_AMAP_SECURITY
    if (!key) {
      console.error('[AMap] 缺少环境变量 VITE_AMAP_KEY')
      resolve(null)
      return
    }
    if (sec) {
      window._AMapSecurityConfig = { securityJsCode: sec }
    }

    const inject = () => new Promise<boolean>((res, rej) => {
      const script = document.createElement('script')
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}`
      script.async = true
      script.onload = () => res(true)
      script.onerror = () => rej(new Error('AMap 脚本加载失败'))
      document.head.appendChild(script)
    })

    try {
      await inject()
      console.log('[AMap] 基础脚本加载成功')
      resolve(window.AMap)
    } catch (e) {
      console.warn('[AMap] 首次加载失败，尝试一次重试', e)
      try {
        await inject()
        console.log('[AMap] 重试后加载成功')
        resolve(window.AMap)
      } catch (e2) {
        console.error('[AMap] 加载失败，放弃', e2)
        resolve(null)
      }
    }
  })

  return amapPromise
}

export async function ensureAMapPlugins(plugins: string[]): Promise<typeof window.AMap | null> {
  const AMap = await loadAMapBase()
  if (!AMap) return null
  return new Promise(resolve => {
    AMap.plugin(plugins, () => {
      console.log('[AMap] 插件加载成功:', plugins.join(','))
      resolve(AMap)
    })
  })
}

/**
 * 综合加载：基础脚本 + Driving 等常用插件
 */
export async function ensureAMapLoaded(full = true) {
  if (!full) return loadAMapBase()
  return ensureAMapPlugins([
    'AMap.Driving',
    'AMap.Geocoder',
    'AMap.InfoWindow',
    'AMap.Marker',
    'AMap.Circle'
  ])
}
