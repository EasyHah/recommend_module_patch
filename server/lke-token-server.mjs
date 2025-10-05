// Minimal token relay server for Tencent Cloud LKE Demo
// IMPORTANT: put SecretId/SecretKey in a local .env.local (do not commit)
import http from 'node:http'
import url from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import https from 'node:https'
import crypto from 'node:crypto'

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
