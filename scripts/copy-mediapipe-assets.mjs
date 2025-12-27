import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'

const root = process.cwd()

const WASM_SRC_DIR = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const WASM_DEST_DIR = path.join(root, 'public', 'mediapipe', 'wasm')

const MODEL_DEST_DIR = path.join(root, 'public', 'mediapipe', 'models')
const MODEL_DEST_PATH = path.join(MODEL_DEST_DIR, 'efficientdet_lite0.tflite')
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite'

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function copyIfNeeded(srcPath, destPath) {
  const srcStat = fs.statSync(srcPath)
  let destStat = null
  try {
    destStat = fs.statSync(destPath)
  } catch {}
  if (destStat && destStat.size === srcStat.size) return false
  fs.copyFileSync(srcPath, destPath)
  return true
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(download(res.headers.location, destPath))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode || 0}`))
      }
      const tmp = destPath + '.tmp'
      const out = fs.createWriteStream(tmp)
      res.pipe(out)
      out.on('finish', () => {
        out.close(() => {
          fs.renameSync(tmp, destPath)
          resolve(true)
        })
      })
      out.on('error', (e) => {
        try { fs.unlinkSync(tmp) } catch {}
        reject(e)
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => {
      req.destroy(new Error('Timeout'))
    })
  })
}

async function main() {
  if (!fs.existsSync(WASM_SRC_DIR)) {
    console.warn(`[copy-mediapipe-assets] Skip: missing ${WASM_SRC_DIR}`)
    return
  }

  ensureDir(WASM_DEST_DIR)

  const files = fs.readdirSync(WASM_SRC_DIR).filter((f) => f.endsWith('.js') || f.endsWith('.wasm'))
  let copied = 0
  for (const f of files) {
    const src = path.join(WASM_SRC_DIR, f)
    const dest = path.join(WASM_DEST_DIR, f)
    if (copyIfNeeded(src, dest)) copied++
  }
  if (copied) console.log(`[copy-mediapipe-assets] Copied wasm files: ${copied}`)

  ensureDir(MODEL_DEST_DIR)
  if (!fs.existsSync(MODEL_DEST_PATH)) {
    try {
      await download(MODEL_URL, MODEL_DEST_PATH)
      console.log('[copy-mediapipe-assets] Downloaded model: efficientdet_lite0.tflite')
    } catch (e) {
      console.warn(`[copy-mediapipe-assets] Model download skipped: ${e?.message || e}`)
    }
  }
}

main().catch((e) => {
  console.warn(`[copy-mediapipe-assets] Failed: ${e?.message || e}`)
  // non-fatal: dev/build can still try remote URLs
})

