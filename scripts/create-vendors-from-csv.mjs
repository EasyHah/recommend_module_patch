import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const csvPath = path.resolve(__dirname, '../public/data/warehouse-centers.csv')
const outPath = path.resolve(__dirname, '../public/data/vendors.json')

function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim())
  if(!lines.length) return []
  const header = lines.shift().split(',').map(h=>h.trim())
  return lines.map(line=>{
    const cols = line.split(',')
    const obj = {}
    header.forEach((h,i)=> obj[h]= (cols[i]||'').trim())
    return obj
  })
}

function normCenter(raw){
  if(!raw) return '未知中心'
  let k = raw.replace(/\s+/g,'')
  k = k.replace(/分拣中心|分拣/g,'中心')
  return k
}

function buildVendors(rows){
  const baseLat = 35.10, baseLng = 118.23
  const typesPool = ['normal','cold','fragile','hazmat']
  const vendors = []
  let counter = 0
  for(const r of rows){
    counter++
    const centerName = normCenter(r['分拣中心'])
    const seq = r['序号'] || String(counter)
    const logisticsName = (r['物流'] || '').trim() || '未命名物流'
    const route = (r['线路/目的地']||'').trim()
    const phone = (r['电话']||'').trim()
    const name = `${logisticsName}-${seq}`
    // 随机合成指标
    const types = typesPool.filter(()=> Math.random()>0.6)
    if(!types.length) types.push('normal')
    const cold = types.includes('cold') && Math.random()>0.6 ? {min:-18,max:8}: null
    const rating = +(3 + Math.random()*2).toFixed(1)
    const onTimeRate = +(0.85 + Math.random()*0.15).toFixed(3)
    const priceIndex = +(0.8 + Math.random()*0.5).toFixed(2)
    const capacityUtilization = +Math.random().toFixed(2)
    const serviceRadiusKm = 60 + Math.floor(Math.random()*190)
    const maxWeightKg = 2000 + Math.floor(Math.random()*20000)
    // 地理位置：按中心散点（中心 hash）
    const hash = centerName.split('').reduce((a,c)=>a+c.charCodeAt(0),0)
    const lat = +(baseLat + ((hash%97)/97 - 0.5)*0.18 + (Math.random()-0.5)*0.01).toFixed(5)
    const lng = +(baseLng + ((hash%131)/131 - 0.5)*0.18 + (Math.random()-0.5)*0.01).toFixed(5)

    vendors.push({
      id: 'vl'+String(counter).padStart(4,'0'),
      name,
      centerName,
      sequence: seq,
      logisticsName,
      route,
      phone,
      location:{lat,lng},
      serviceRadiusKm,
      capabilities:{
        types,
        maxWeightKg,
        cold,
        certifications:['ISO9001']
      },
      metrics:{ rating, onTimeRate, priceIndex, capacityUtilization },
      tags: [centerName, logisticsName].filter(Boolean)
    })
  }
  return vendors
}

function main(){
  const text = fs.readFileSync(csvPath,'utf-8')
  const rows = parseCSV(text)
  const vendors = buildVendors(rows)
  fs.writeFileSync(outPath, JSON.stringify(vendors,null,2),'utf-8')
  console.log('Generated vendors (rows as units):', vendors.length, '->', path.relative(process.cwd(), outPath))
}

main()
