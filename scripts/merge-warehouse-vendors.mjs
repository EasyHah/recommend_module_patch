#!/usr/bin/env node
/**
 * 合并 public/Assets/data/geojson/仓库.json 与 public/data/vendors.json:
 *  1. 为每个 GeoJSON Feature 增加 vendors(线路)数组（按 centerName 推断）
 *  2. 为每个 vendor 增加 warehouse 对象（匹配的 Geo 多边形信息: fid, centerName, centroid）
 *  3. 输出:
 *     - public/data/warehouse-with-vendors.geojson
 *     - public/data/vendors-with-warehouse.json
 *  匹配逻辑:
 *    a) 使用 DataSourceManager 中 EXPLICIT_FID_RANGES 规则 (复制简化) 根据 FID 推断中心名称
 *    b) vendors.json 中的 centerName 与推断名相等即匹配
 */
import fs from 'fs'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const geoPath = path.resolve(root, 'public/Assets/data/geojson/仓库.json')
const vendorsPath = path.resolve(root, 'public/data/vendors.json')
const outGeoPath = path.resolve(root, 'public/data/warehouse-with-vendors.geojson')
const outVendorsPath = path.resolve(root, 'public/data/vendors-with-warehouse.json')

function loadJSON(p){ return JSON.parse(fs.readFileSync(p,'utf8')) }

// 与 DataSourceManager.js 保持一致 (若后续改动需同步)
const EXPLICIT_FID_RANGES = [
  { min: 0,   max: 33,  name: '2号中心' },
  { min: 34,  max: 67,  name: '4号中心' },
  { min: 68,  max: 101, name: '6号中心' },
  { min: 102, max: 135, name: '8号中心' },
  { min: 136, max: 177, name: '1号中心' },
  { min: 178, max: 219, name: '3号中心' },
  { min: 220, max: 257, name: '5号中心' },
  { min: 258, max: 289, name: '7号中心' },
  { min: 290, max: 315, name: '10号中心' },
  { min: 316, max: 349, name: '9号中心' },
  { min: 350, max: 375, name: '12号中心' },
  { min: 376, max: 401, name: '11号中心' }
]
function inferCenterNameByFid(fid){
  if(!Number.isFinite(fid) || fid < 0) return '未知中心'
  const hit = EXPLICIT_FID_RANGES.find(r=> fid>=r.min && fid<=r.max)
  return hit? hit.name : '未知中心'
}

function computePolygonCentroid(coordinates){
  // coordinates: [[[lng,lat],[lng,lat],...]]
  if(!Array.isArray(coordinates) || !coordinates.length) return null
  const ring = coordinates[0]
  if(!ring || !ring.length) return null
  let area = 0, cx = 0, cy = 0
  for(let i=0;i<ring.length-1;i++){
    const [x1,y1] = ring[i]
    const [x2,y2] = ring[i+1]
    const f = x1*y2 - x2*y1
    area += f
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  area *= 0.5
  if(area === 0){
    const sx = ring.reduce((a,p)=>a+p[0],0)
    const sy = ring.reduce((a,p)=>a+p[1],0)
    return { lng: sx/ring.length, lat: sy/ring.length }
  }
  cx /= (6*area); cy /= (6*area)
  return { lng: cx, lat: cy }
}

function main(){
  if(!fs.existsSync(geoPath)) throw new Error('GeoJSON 不存在: '+geoPath)
  if(!fs.existsSync(vendorsPath)) throw new Error('vendors.json 不存在: '+vendorsPath)
  const geo = loadJSON(geoPath)
  const vendors = loadJSON(vendorsPath)

  const centersMap = new Map() // centerName -> {features:[], vendors:[]}

  // 先分组 vendors
  vendors.forEach(v=>{
    const key = v.centerName || '未知中心'
    if(!centersMap.has(key)) centersMap.set(key, { features: [], vendors: [] })
    centersMap.get(key).vendors.push(v)
  })

  // 遍历 features 匹配 centerName
  geo.features.forEach(ft=>{
    const fid = ft.properties?.FID
    const centerName = inferCenterNameByFid(fid)
    ft.properties = { ...ft.properties, centerName }
    if(!centersMap.has(centerName)) centersMap.set(centerName, { features: [], vendors: [] })
    centersMap.get(centerName).features.push(ft)
  })

  // 为每个 feature 附加 vendors 列表 (浅拷贝)
  geo.features.forEach(ft=>{
    const c = ft.properties.centerName
    const arr = centersMap.get(c)?.vendors || []
    ft.properties.vendors = arr.map(v=> v.id) // 仅存 ID 列表，避免重复冗余
  })

  // 为每个 vendor 增加 warehouse 信息
  const vendorsOut = vendors.map(v=>{
    const c = centersMap.get(v.centerName) || null
    let centroid = null
    let fid = null
    if(c && c.features.length){
      // 简单取第一个 polygon
      const poly = c.features[0]
      fid = poly.properties?.FID
      if(poly.geometry?.type === 'Polygon') centroid = computePolygonCentroid(poly.geometry.coordinates)
    }
    return { ...v, warehouse: { fid, centerName: v.centerName, centroid } }
  })

  fs.writeFileSync(outGeoPath, JSON.stringify(geo, null, 2))
  fs.writeFileSync(outVendorsPath, JSON.stringify(vendorsOut, null, 2))

  console.log('[merge-warehouse-vendors] 完成:')
  console.log('  写入', path.relative(root, outGeoPath))
  console.log('  写入', path.relative(root, outVendorsPath))
  // 统计
  const unmatchedCenters = Array.from(centersMap.entries()).filter(([k,v])=> v.features.length===0 || v.vendors.length===0)
  if(unmatchedCenters.length){
    console.log('  存在未完全匹配的中心(特征或线路为空):', unmatchedCenters.map(([k])=>k).join(', '))
  }
}

main()
