export type PublicCamera = {
  id: string
  name: string
  city?: string
  snapshotUrl?: string
  streamUrl?: string
  infoUrl?: string
}

let cache: PublicCamera[] | null = null

export async function loadPublicCameras(): Promise<PublicCamera[]> {
  if (cache) return cache
  try {
    const res = await fetch('/data/public-cameras.json', { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    const list = (await res.json()) as PublicCamera[]
    cache = Array.isArray(list) ? list : []
  } catch (e) {
    console.warn('[publicCameras] 加载失败，将返回空列表', e)
    cache = []
  }
  return cache!
}

export async function getRandomCameras(count: number): Promise<PublicCamera[]> {
  const list = await loadPublicCameras()
  if (!list.length || count <= 0) return []
  // 洗牌采样（Fisher–Yates）
  const arr = list.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, Math.min(count, arr.length))
}
