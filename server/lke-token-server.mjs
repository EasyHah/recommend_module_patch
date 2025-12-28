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
import { TextDecoder } from 'node:util'

// Load .env.local if present (do not commit secrets)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const PORT = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 3000
const HOST = process.env.SERVER_HOST || '127.0.0.1'
// 优先读取通用名称，其次兼容曾使用过的 VITE_* / TENCENT_* 前缀（不再推荐把云密钥以 VITE_ 暴露）
const SECRET_ID = process.env.SECRET_ID || process.env.TENCENT_SECRET_ID || process.env.VITE_TENCENT_SECRET_ID || ''
const SECRET_KEY = process.env.SECRET_KEY || process.env.TENCENT_SECRET_KEY || process.env.VITE_TENCENT_SECRET_KEY || ''
const DEFAULT_REGION = process.env.LKE_REGION || 'ap-guangzhou'
const LKE_HOST = 'lke.tencentcloudapi.com'
const LKE_DEBUG = process.env.LKE_DEBUG === '1' || process.env.LKE_DEBUG === 'true'

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
      const { centerId, centerTitle, code, name, regions, phones, company, lat, lon, height } = body
      if (!centerId || !code || !name) return sendJson(res,400,{code:400,message:'centerId, code, name required'})
      upsertHub(editData, centerId, centerTitle||centerId, {
        code:String(code), name:String(name),
        regions: Array.isArray(regions)?regions:undefined,
        phones: Array.isArray(phones)?phones:undefined,
        company: company?String(company):undefined,
        lat: (lat===0 || lat) ? Number(lat) : undefined,
        lon: (lon===0 || lon) ? Number(lon) : undefined,
        height: (height===0 || height) ? Number(height) : undefined,
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
        lat: (body.lat===0 || body.lat) ? Number(body.lat) : existing.lat,
        lon: (body.lon===0 || body.lon) ? Number(body.lon) : existing.lon,
        height: (body.height===0 || body.height) ? Number(body.height) : existing.height,
        updatedAt: new Date().toISOString()
      })
      logiSaveEditable(editData)
      return sendJson(res,200,{code:0,message:'updated'})
    })
  }

  return true
}

// ---------------- DeepSeek proxy (server-side) ----------------
const DEEPSEEK_API_KEY =
  process.env.DEEPSEEK_API_KEY ||
  process.env.DEEPSEEK_KEY ||
  ''
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

const deepseekUrl = new URL(DEEPSEEK_BASE_URL)

function sendSSEHeaders(res) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
}

function sseWrite(res, obj) {
  try {
    res.write(`data: ${JSON.stringify(obj)}\n\n`)
  } catch {}
}

let cachedParkData = null
let cachedParkDataMtime = 0

function loadParkData() {
  try {
    const vendorsPath = path.join(__dirname, '..', 'public', 'data', 'vendors-with-warehouse.json')
    const routeCitiesPath = path.join(__dirname, '..', 'public', 'data', 'vendor-route-cities.json')
    const vendorPath = fs.existsSync(vendorsPath) ? vendorsPath : null
    if (!vendorPath) return { vendors: [], routes: [] }

    const st = fs.statSync(vendorPath)
    const mtime = st.mtimeMs || 0
    if (cachedParkData && cachedParkDataMtime === mtime) return cachedParkData

    const vendors = JSON.parse(fs.readFileSync(vendorPath, 'utf8')) || []
    let routes = []
    try {
      if (fs.existsSync(routeCitiesPath)) routes = JSON.parse(fs.readFileSync(routeCitiesPath, 'utf8')) || []
    } catch {}

    const routeMap = new Map()
    for (const r of routes) {
      const id = r.vendorId || r.id
      if (!id) continue
      routeMap.set(String(id), r)
    }

    const normalized = vendors.map((v) => {
      const id = String(v.id || v.vendorId || v.vendor_id || '')
      const name = String(v.logisticsName || v.name || v.company || '')
      const centerName = String(v.centerName || v.warehouse?.centerName || v.warehouse?.groupName || '')
      const route = String(v.route || '')
      const phones = Array.isArray(v.phones) ? v.phones : (v.phone ? [String(v.phone)] : [])
      const metrics = v.metrics || null
      const capabilities = v.capabilities || null
      const tags = Array.isArray(v.tags) ? v.tags : []
      const routeCities = routeMap.get(id)?.cities || routeMap.get(id)?.routeCities || null
      const searchText = [
        id,
        name,
        centerName,
        route,
        ...(tags || []),
        ...(phones || []),
        ...(Array.isArray(routeCities) ? routeCities : [])
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return {
        id,
        name,
        centerName,
        route,
        phones,
        metrics,
        capabilities,
        tags,
        routeCities: Array.isArray(routeCities) ? routeCities : undefined,
        _search: searchText
      }
    })

    // Also include logistics "hubs" (可视作园区厂家/网点/供应商台账)
    const factories = []
    try {
      const model = logiBuildModel()
      for (const c of model.centers || []) {
        const centerId = String(c.id || c.title || '')
        const centerTitle = String(c.title || c.id || '')
        for (const h of c.hubs || []) {
          const code = String(h.code || '')
          const name = String(h.name || '')
          const company = h.company != null ? String(h.company) : ''
          const regions = Array.isArray(h.regions) ? h.regions : []
          const phones = Array.isArray(h.phones) ? h.phones : []
          const searchText = [centerId, centerTitle, code, name, company, ...regions, ...phones].filter(Boolean).join(' ').toLowerCase()
          factories.push({
            centerId,
            centerTitle,
            code,
            name,
            company: company || undefined,
            regions,
            phones,
            lat: h.lat,
            lon: h.lon,
            height: h.height,
            _search: searchText
          })
        }
      }
    } catch {}

    cachedParkData = { vendors: normalized, factories }
    cachedParkDataMtime = mtime
    return cachedParkData
  } catch {
    return { vendors: [] }
  }
}

function selectRelevantVendors(all, query, limit = 12) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  const terms = extractQueryTerms(q, 10)
  const scored = []
  for (const v of all) {
    let score = 0
    if (v._search.includes(q)) score += 6
    for (const t of terms) {
      if (!t) continue
      if (v._search.includes(t)) score += 2
      if (v.centerName && String(v.centerName).toLowerCase().includes(t)) score += 2
      if (v.name && String(v.name).toLowerCase().includes(t)) score += 2
    }
    // slight preference for rated vendors
    if (v.metrics?.rating) score += Math.min(2, Number(v.metrics.rating) / 5)
    if (score > 0) scored.push({ v, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(x => x.v)
}

function extractQueryTerms(input, limit = 10) {
  const q0 = String(input || '').trim().toLowerCase()
  if (!q0) return []
  // 去除常见“查询/电话/推荐”等噪声词，避免整句无法命中
  const stop = [
    '查询', '搜索', '查找', '查下', '帮我', '给我', '我要', '想要', '请', '一下',
    '电话', '号码', '手机号', '联系', '联系方式',
    '推荐', '有哪些', '哪些', '园区', '厂家', '厂商', '供应商'
  ]
  let q = q0
  for (const w of stop) q = q.split(w).join(' ')
  q = q.replace(/[^\u4e00-\u9fa5a-z0-9]+/g, ' ')
  const tokens = q.split(/\s+/).filter(Boolean).filter(t => t.length >= 2)
  const uniq = Array.from(new Set(tokens))
  // 兜底：如果全被过滤，保留原始 query（用于完整包含匹配）
  if (!uniq.length && q0.length >= 2) uniq.push(q0)
  return uniq.slice(0, limit)
}

function selectRelevantFactories(all, query, limit = 10) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  const terms = extractQueryTerms(q, 12)
  const scored = []
  for (const f of all) {
    let score = 0
    if (f._search.includes(q)) score += 6
    for (const t of terms) {
      if (!t) continue
      if (f._search.includes(t)) score += 2
      if (f.centerTitle && String(f.centerTitle).toLowerCase().includes(t)) score += 2
      if (f.company && String(f.company).toLowerCase().includes(t)) score += 2
      if (f.name && String(f.name).toLowerCase().includes(t)) score += 2
      if (f.code && String(f.code).toLowerCase().includes(t)) score += 2
    }
    if (score > 0) scored.push({ f, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(x => x.f)
}

function handleDeepSeek(req, res, parsed) {
  if (parsed.pathname !== '/api/deepseek/chat') return false

  if (req.method !== 'POST') {
    return sendJson(res, 405, { code: 405, message: 'Method Not Allowed' })
  }
  if (!DEEPSEEK_API_KEY) {
    return sendJson(res, 500, { code: 500, message: 'DEEPSEEK_API_KEY 未配置（请在 .env.local 中设置）' })
  }

  return readBody(req).then(async (body) => {
    const userMessages = Array.isArray(body?.messages) ? body.messages : []
    const stream = body?.stream !== false

    const lastUser = [...userMessages].reverse().find(m => m?.role === 'user')?.content || ''
    const park = loadParkData()
    const picks = selectRelevantVendors(park.vendors || [], lastUser, 12)
    const factoryPicks = selectRelevantFactories(park.factories || [], lastUser, 10)

    const context = {
      factories: factoryPicks.map(f => ({
        centerTitle: f.centerTitle,
        code: f.code,
        name: f.name,
        company: f.company,
        regions: f.regions,
        phones: f.phones
      })),
      vendors: picks.map(v => ({
        id: v.id,
        name: v.name,
        centerName: v.centerName,
        route: v.route,
        routeCities: v.routeCities,
        phones: v.phones,
        tags: v.tags,
        metrics: v.metrics,
        capabilities: v.capabilities
      }))
    }

    const systemPrompt =
      '你是园区厂家/供应商推荐助手。' +
      '你会基于我提供的“园区数据(JSON)”回答问题并给出推荐；如果数据不足以回答，请明确说明缺少哪些信息，并给出下一步需要用户补充的字段。' +
      '回答用中文，优先给出 3-5 条可执行建议；涉及推荐时请列出：名称/厂商、所属园区/中心、服务范围/能力、评分/准时率(如有)、联系方式(如有)、推荐理由。'

    const outboundMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: `园区数据(JSON, 仅供查询):\n${JSON.stringify(context)}` },
      ...userMessages
        .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
        .slice(-20)
        .map(m => ({ role: m.role, content: String(m.content || '') }))
    ]

    const payload = JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: outboundMessages,
      temperature: 0.2,
      stream: !!stream
    })

    const options = {
      protocol: deepseekUrl.protocol,
      hostname: deepseekUrl.hostname,
      port: deepseekUrl.port || (deepseekUrl.protocol === 'https:' ? 443 : 80),
      method: 'POST',
      path: '/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Accept': 'text/event-stream',
        'Content-Length': Buffer.byteLength(payload)
      }
    }

    if (!stream) {
      return new Promise((resolve) => {
        const r = https.request(options, (up) => {
          let buf = ''
          up.on('data', (c) => (buf += c))
          up.on('end', () => {
            try {
              const json = JSON.parse(buf || '{}')
              const content = json?.choices?.[0]?.message?.content || ''
              return resolve(sendJson(res, 200, { code: 0, content, raw: json }))
            } catch (e) {
              return resolve(sendJson(res, 500, { code: 500, message: 'DeepSeek 响应解析失败' }))
            }
          })
        })
        r.on('error', (e) => resolve(sendJson(res, 500, { code: 500, message: e.message || 'DeepSeek 请求失败' })))
        r.write(payload)
        r.end()
      })
    }

    sendSSEHeaders(res)

    const upstream = https.request(options, (up) => {
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      up.on('data', (chunk) => {
        buffer += decoder.decode(chunk, { stream: true })
        let idx
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          const line = block.split('\n').find(l => l.startsWith('data:'))
          if (!line) continue
          const data = line.slice(5).trim()
          if (!data) continue
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n')
            res.end()
            return
          }
          try {
            const json = JSON.parse(data)
            const delta = json?.choices?.[0]?.delta?.content
            const usage = json?.usage
            if (typeof delta === 'string' && delta.length) {
              sseWrite(res, { type: 'delta', content: delta })
            }
            if (usage) {
              sseWrite(res, { type: 'usage', usage })
            }
          } catch {
            // ignore parse errors
          }
        }
      })

      up.on('end', () => {
        try { res.write('data: [DONE]\n\n') } catch {}
        try { res.end() } catch {}
      })
    })

    upstream.on('error', (e) => {
      sseWrite(res, { type: 'error', message: e.message || 'DeepSeek 请求失败' })
      try { res.write('data: [DONE]\n\n') } catch {}
      try { res.end() } catch {}
    })

    req.on('close', () => {
      try { upstream.destroy() } catch {}
    })

    upstream.write(payload)
    upstream.end()
    return true
  })
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

  if (parsed.pathname === '/debug/lke') {
    // 仅用于本地调试，请勿在生产暴露
    if (!LKE_DEBUG) return sendJson(res, 403, { code: 403, message: 'Enable by setting LKE_DEBUG=1 in .env.local' })
    return sendJson(res, 200, {
      code: 0,
      region: DEFAULT_REGION,
      hasSecretId: !!SECRET_ID,
      hasSecretKey: !!SECRET_KEY,
      secretIdPrefix: SECRET_ID ? SECRET_ID.slice(0, 6) : null,
      appKeyFromEnv: (process.env.VITE_LKE_APP_KEY || '').slice(0, 12) || null,
      note: 'Values truncated / boolean masked for safety'
    })
  }

  // Logistics API dispatch
  if (parsed.pathname.startsWith('/api/logistics')) {
    const handled = handleLogistics(req,res,parsed)
    if (handled !== false) return // already responded
  }

  // DeepSeek API dispatch
  if (parsed.pathname === '/api/deepseek/chat') {
    const handled = handleDeepSeek(req, res, parsed)
    if (handled !== false) return
  }

  if (parsed.pathname === '/getDemoToken') {
    try {
      // Basic validation + 友好提示
      if (!SECRET_ID || !SECRET_KEY) {
        return sendJson(res, 500, {
          code: 500,
            message: 'SECRET_ID/SECRET_KEY 未配置。请在项目根目录 .env.local 中添加:\nSECRET_ID=你的SecretId\nSECRET_KEY=你的SecretKey\n(不要使用 VITE_ 前缀，也不要提交到 Git)。',
            hint: {
              required: ['SECRET_ID','SECRET_KEY'],
              optional: ['LKE_REGION'],
              example: 'SECRET_ID=AKIDxxxxxxxxxxxxxxxxx\nSECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxx',
              regionDefault: DEFAULT_REGION
            }
        })
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
        return sendJson(res, 400, { code: 400, message: 'Missing appKey (传参 ?appKey= 或 body.appKey，或在 .env.local 中添加 VITE_LKE_APP_KEY=)' })
      }

      const { token, requestId } = await callGetWsToken({ appKey, visitorBizId })
      if (LKE_DEBUG) {
        console.log('[LKE DEBUG] GetWsToken OK appKey(first8)=', String(appKey).slice(0,8), 'reqId=', requestId)
      }
      return sendJson(res, 200, { code: 0, token, requestId })
    } catch (e) {
      console.error('getDemoToken error:', e)
      if (LKE_DEBUG) {
        console.error('[LKE DEBUG] SECRET_ID set?', !!SECRET_ID, 'SECRET_KEY set?', !!SECRET_KEY, 'region=', DEFAULT_REGION)
      }
      return sendJson(res, 500, { code: 500, message: e.message || 'internal error' })
    }
  }

  return notFound(res)
})

server.listen(PORT, HOST, () => {
  console.log(`[LKE Token Server] listening on http://${HOST}:${PORT}`)
})
