#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseRouteCities(route){
  if(!route) return []
  const s = String(route)
  const norm = s.replace(/[↔<＞>←→\-–—~～→⇒▶️➡️至到、，,;；|]/g, ' ')
  const parts = norm.split(/\s+/).map(t=>t.trim()).filter(Boolean)
  const cleaned = parts.map(p=>p.replace(/^[^\p{L}\p{Script=Han}]+|[^\p{L}\p{Script=Han}]+$/gu, ''))
    .filter(p=>p && p.length>=2)
  const seen = new Set()
  const result = []
  for(const c of cleaned){ if(!seen.has(c)){ seen.add(c); result.push(c) } }
  return result
}

async function main(){
  const projectRoot = path.resolve(__dirname, '..')
  const inputPath = path.resolve(projectRoot, 'public/data/vendors-with-warehouse.json')
  const outDir = path.resolve(projectRoot, 'public/data')
  const outPath = path.join(outDir, 'vendor-route-cities.json')

  if(!fs.existsSync(inputPath)){
    console.error('[extract-route-cities] 输入文件不存在:', inputPath)
    process.exit(1)
  }
  const raw = fs.readFileSync(inputPath, 'utf-8')
  let rows = []
  try{ rows = JSON.parse(raw) }catch(e){
    console.error('[extract-route-cities] JSON 解析失败:', e.message)
    process.exit(1)
  }
  if(!Array.isArray(rows)){
    console.error('[extract-route-cities] 输入 JSON 不是数组')
    process.exit(1)
  }

  const map = {}
  const unique = new Set()
  for(const v of rows){
    const id = v.id || `${v.centerName||'unknown'}_${v.sequence||''}`
    const cities = parseRouteCities(v.route||'')
    cities.forEach(c=>unique.add(c))
    map[id] = {
      vendorId: v.id || null,
      centerName: v.centerName || null,
      sequence: v.sequence || null,
      logisticsName: v.logisticsName || v.name || null,
      routeRaw: v.route || '',
      routeCities: cities
    }
  }
  const output = {
    generatedAt: new Date().toISOString(),
    total: Object.keys(map).length,
    uniqueCityCount: unique.size,
    uniqueCities: Array.from(unique.values()),
    byVendor: map
  }
  if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8')
  console.log('[extract-route-cities] 完成:', outPath, '总记录=', output.total, '唯一城市数=', output.uniqueCityCount)
}

main().catch(e=>{ console.error(e); process.exit(1) })
