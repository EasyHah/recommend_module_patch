// Minimal token relay server for Tencent Cloud LKE Demo
// IMPORTANT: put SecretId/SecretKey in a local .env.local (do not commit)
import http from 'node:http'
import url from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import https from 'node:https'
import crypto from 'node:crypto'
import fs from 'node:fs'

// Load .env.local if present (do not commit secrets)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const PORT = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 3000
const SECRET_ID = process.env.SECRET_ID || ''
const SECRET_KEY = process.env.SECRET_KEY || ''
const DEFAULT_REGION = process.env.LKE_REGION || 'ap-guangzhou'
const LKE_HOST = 'lke.tencentcloudapi.com'

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function hmacSha256Hex(key, msg) {
  return crypto.createHmac('sha256', key).update(String(msg)).digest('hex')
}

function hmacSha256(key, msg) {
  return crypto.createHmac('sha256', key).update(String(msg)).digest()
}

function toISODate(timestamp) {
  const d = new Date(timestamp * 1000)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function uuid() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.randomBytes(1)[0] & 15 >> c / 4).toString(16)
  )
}

async function callGetWsToken({ appKey, visitorBizId, region = DEFAULT_REGION }) {
  const action = 'GetWsToken'
  const version = '2023-11-30'
  const service = 'lke'
  const host = LKE_HOST
  const method = 'POST'
  const canonicalUri = '/'
  const canonicalQueryString = ''
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'host': host
  }

  const payloadObj = {
    Type: 5,
    BotAppKey: appKey,
    VisitorBizId: visitorBizId || uuid(),
    VisitorLabels: []
  }
  const payload = JSON.stringify(payloadObj)

  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map(k => `${k}:${String(headers[k]).trim()}\n`) // must include trailing \n
    .join('')
  const signedHeaders = Object.keys(headers).sort().join(';')
  const hashedPayload = sha256Hex(payload)
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedPayload
  ].join('\n')

  const timestamp = Math.floor(Date.now() / 1000)
  const date = toISODate(timestamp)
  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonicalRequest = sha256Hex(canonicalRequest)
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest
  ].join('\n')

  const secretDate = hmacSha256('TC3' + SECRET_KEY, date)
  const secretService = hmacSha256(secretDate, service)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  const auth = `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const reqHeaders = {
    'Content-Type': headers['content-type'],
    'Host': host,
    'X-TC-Action': action,
    'X-TC-Version': version,
    'X-TC-Region': region,
    'X-TC-Timestamp': String(timestamp),
    'Authorization': auth
  }

  const options = {
    host,
    method: 'POST',
    path: '/',
    headers: reqHeaders
  }

  const result = await new Promise((resolve, reject) => {
    const req = https.request(options, (resp) => {
      let data = ''
      resp.on('data', (chunk) => data += chunk)
      resp.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({ status: resp.statusCode, data: json })
        } catch (e) {
          resolve({ status: resp.statusCode, data: data })
        }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })

  if (result.status !== 200) {
    throw new Error(`GetWsToken http ${result.status}: ${JSON.stringify(result.data).slice(0,200)}`)
  }
  if (!result.data || !result.data.Response || !result.data.Response.Token) {
    throw new Error(`GetWsToken no token: ${JSON.stringify(result.data).slice(0,200)}`)
  }
  return {
    token: result.data.Response.Token,
    requestId: result.data.Response.RequestId || ''
  }
}

// Simple JSON response helper
function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  // CORS (adjust for your domain)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.end(JSON.stringify(data))
}

function notFound(res) {
  sendJson(res, 404, { code: 404, message: 'Not Found' })
}

// ---------------- Logistics API helpers ----------------
const logisticsBaseDataPath = path.join(__dirname, '..', 'src', 'data', 'logistics.json')
const logisticsEditablePath = path.join(__dirname, '..', 'src', 'data', 'logistics-editable.json')

function logiLoadBase() {
  try { return JSON.parse(fs.readFileSync(logisticsBaseDataPath,'utf8')) } catch { return { centers: [] } }
}
function logiLoadEditable() {
  try { return JSON.parse(fs.readFileSync(logisticsEditablePath,'utf8')) } catch { return { centers: [] } }
}
function logiSaveEditable(data) {
  fs.writeFileSync(logisticsEditablePath, JSON.stringify(data,null,2),'utf8')
}
function logiBuildModel() {
  const base = logiLoadBase()
  const edit = logiLoadEditable()
  const centerMap = new Map()
  for (const c of base.centers || []) centerMap.set(c.id || c.title, JSON.parse(JSON.stringify(c)))
  for (const c of edit.centers || []) {
    const key = c.id || c.title
    if (!centerMap.has(key)) centerMap.set(key, { title: c.title, id: c.id || key, hubs: [] })
    const target = centerMap.get(key)
    const hubMap = new Map(target.hubs.map(h => [h.code, h]))
    for (const h of c.hubs || []) hubMap.set(h.code, { ...hubMap.get(h.code), ...h })
    target.hubs = [...hubMap.values()]
  }
  return { centers: [...centerMap.values()] }
}
async function readBody(req) {
  if (req.method === 'GET') return {}
  return await new Promise(resolve => {
    let buf='';
    req.on('data', c => buf += c)
    req.on('end', () => { try { resolve(buf?JSON.parse(buf):{}) } catch { resolve({}) } })
  })
}

function handleLogistics(req, res, parsed) {
  if (!parsed.pathname.startsWith('/api/logistics')) return false
  const model = logiBuildModel()
  const editData = logiLoadEditable()

  // list centers
  if (req.method === 'GET' && parsed.pathname === '/api/logistics/centers') {
    const out = model.centers.map(c => ({ id: c.id || c.title, title: c.title, hubCount: c.hubs.length }))
    return sendJson(res, 200, { code:0, centers: out })
  }
  // single center
  const mCenter = parsed.pathname.match(/^\/api\/logistics\/centers\/([^\/]+)$/)
  if (req.method === 'GET' && mCenter) {
    const cid = decodeURIComponent(mCenter[1])
    const center = model.centers.find(c => (c.id||c.title) === cid)
    if (!center) return sendJson(res,404,{code:404,message:'Center not found'})
    return sendJson(res,200,{code:0, center})
  }
  // hub get
  const mHub = parsed.pathname.match(/^\/api\/logistics\/hubs\/([^\/]+)\/([^\/]+)$/)
  if (req.method === 'GET' && mHub) {
    const cid = decodeURIComponent(mHub[1]); const code = decodeURIComponent(mHub[2])
    const center = model.centers.find(c => (c.id||c.title) === cid)
    if (!center) return sendJson(res,404,{code:404,message:'Center not found'})
    const hub = center.hubs.find(h => h.code === code)
    if (!hub) return sendJson(res,404,{code:404,message:'Hub not found'})
    return sendJson(res,200,{code:0, hub, center:{ id:center.id||center.title, title:center.title }})
  }
  // search
  if (req.method === 'GET' && parsed.pathname === '/api/logistics/search') {
    const q = String(parsed.query.q||'').trim().toLowerCase()
    if (!q) return sendJson(res,200,{code:0, results:[]})
    const results = []
    for (const c of model.centers) {
      for (const h of c.hubs) {
        const regionStr = (h.regions||[]).join(' ').toLowerCase()
        const phoneStr = (h.phones||[]).join(' ')
        const company = (h.company||'').toLowerCase()
        if (h.code === q || h.name.toLowerCase().includes(q) || regionStr.includes(q) || company.includes(q) || phoneStr.includes(q)) {
          results.push({ centerId: c.id||c.title, centerTitle: c.title, code: h.code, name: h.name, company: h.company||null })
          if (results.length >= 200) break
        }
      }
      if (results.length >= 200) break
    }
    return sendJson(res,200,{code:0, results})
  }

  function ensureEditCenter(editData, centerId, title){
    let ce = editData.centers.find(c => (c.id||c.title) === centerId)
    if (!ce) { ce = { id:centerId, title: title||centerId, hubs:[] }; editData.centers.push(ce) }
    return ce
  }
  function upsertHub(editData, centerId, centerTitle, hub) {
    const ce = ensureEditCenter(editData, centerId, centerTitle)
    const idx = ce.hubs.findIndex(h => h.code === hub.code)
    if (idx>=0) ce.hubs[idx] = { ...ce.hubs[idx], ...hub }
    else ce.hubs.push(hub)
  }

  // upsert
  if (req.method === 'POST' && parsed.pathname === '/api/logistics/hubs') {
    return readBody(req).then(body => {
      const { centerId, centerTitle, code, name, regions, phones, company } = body
      if (!centerId || !code || !name) return sendJson(res,400,{code:400,message:'centerId, code, name required'})
      upsertHub(editData, centerId, centerTitle||centerId, {
        code:String(code), name:String(name),
        regions: Array.isArray(regions)?regions:undefined,
        phones: Array.isArray(phones)?phones:undefined,
        company: company?String(company):undefined,
        updatedAt: new Date().toISOString()
      })
      logiSaveEditable(editData)
      return sendJson(res,200,{code:0,message:'saved'})
    })
  }
  // patch / delete
  if (mHub && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const cid = decodeURIComponent(mHub[1]); const hubCode = decodeURIComponent(mHub[2])
    if (req.method === 'DELETE') {
      const ce = editData.centers.find(c => (c.id||c.title) === cid)
      if (!ce) return sendJson(res,404,{code:404,message:'Center not editable'})
      const idx = ce.hubs.findIndex(h => h.code === hubCode)
      if (idx < 0) return sendJson(res,404,{code:404,message:'Hub not found in editable layer'})
      ce.hubs.splice(idx,1); logiSaveEditable(editData); return sendJson(res,200,{code:0,message:'deleted'})
    }
    return readBody(req).then(body => {
      const mergedCenter = model.centers.find(c => (c.id||c.title) === cid)
      if (!mergedCenter) return sendJson(res,404,{code:404,message:'Center not found'})
      const existing = mergedCenter.hubs.find(h => h.code === hubCode)
      if (!existing) return sendJson(res,404,{code:404,message:'Hub not found'})
      upsertHub(editData, cid, mergedCenter.title, {
        code: hubCode,
        name: body.name?String(body.name): existing.name,
        regions: body.regions?body.regions: existing.regions,
        phones: body.phones?body.phones: existing.phones,
        company: body.company?String(body.company): existing.company,
        updatedAt: new Date().toISOString()
      })
      logiSaveEditable(editData)
      return sendJson(res,200,{code:0,message:'updated'})
    })
  }

  return true
}

// ---------------- Existing token server routes ----------------
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.end()
  }

  if (parsed.pathname === '/health') {
    return sendJson(res, 200, { ok: true, time: Date.now() })
  }

  // Logistics API dispatch
  if (parsed.pathname.startsWith('/api/logistics')) {
    const handled = handleLogistics(req,res,parsed)
    if (handled !== false) return // already responded
  }

  if (parsed.pathname === '/getDemoToken') {
    try {
      // Basic validation
      if (!SECRET_ID || !SECRET_KEY) {
        return sendJson(res, 500, { code: 500, message: 'SECRET_ID/SECRET_KEY not set on server' })
      }

      // appKey can come from query, body, or env (.env.local)
      let body = ''
      if (req.method === 'POST') {
        body = await new Promise((resolve) => {
          let buf = ''
          req.on('data', (chunk) => buf += chunk)
          req.on('end', () => resolve(buf))
        })
      }
      let appKey = parsed.query.appKey || ''
      let visitorBizId = parsed.query.visitorBizId || ''
      try {
        if (!appKey && body) {
          const json = JSON.parse(body)
          appKey = json.appKey || appKey
          visitorBizId = json.visitorBizId || visitorBizId
        }
      } catch {}
      if (!appKey) {
        appKey = process.env.VITE_LKE_APP_KEY || ''
      }
      if (!appKey) {
        return sendJson(res, 400, { code: 400, message: 'Missing appKey' })
      }

      const { token, requestId } = await callGetWsToken({ appKey, visitorBizId })
      return sendJson(res, 200, { code: 0, token, requestId })
    } catch (e) {
      console.error('getDemoToken error:', e)
      return sendJson(res, 500, { code: 500, message: e.message || 'internal error' })
    }
  }

  return notFound(res)
})

server.listen(PORT, () => {
  console.log(`[LKE Token Server] listening on http://localhost:${PORT}`)
})
