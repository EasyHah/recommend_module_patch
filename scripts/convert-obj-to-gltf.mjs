#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import { dirname, join, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import obj2gltf from 'obj2gltf'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = dirname(__dirname)

const TARGET_FOLDERS = [
  'public/Assets/data/factoryOBJ',
  'public/Assets/data/buldingOBJ'
]

async function ensureFolderExists(pathLike) {
  try {
    await fs.access(pathLike)
  } catch {
    await fs.mkdir(pathLike, { recursive: true })
  }
}

async function convertObjFile(inputPath) {
  const folder = dirname(inputPath)
  const name = basename(inputPath, extname(inputPath))
  const outputPath = join(folder, `${name}.glb`)

  const mtlPathCandidates = [
    join(folder, `${name}.mtl`),
    join(folder, `${name}.MTL`)
  ]
  let mtlPath = null
  for (const cand of mtlPathCandidates) {
    try {
      await fs.access(cand)
      mtlPath = cand
      break
    } catch {}
  }

  console.log(`转换 OBJ => GLB: ${inputPath}`)
  const glbBuffer = await obj2gltf(inputPath, {
    binary: true,
    mtl: mtlPath || undefined,
    separateTextures: false,
    materialsCommon: true
  })
  await fs.writeFile(outputPath, glbBuffer)
  console.log(`  ✓ 已生成 ${outputPath}`)
}

async function convertFolder(relativeFolder) {
  const folder = join(ROOT, relativeFolder)
  await ensureFolderExists(folder)

  const entries = await fs.readdir(folder)
  const objFiles = entries.filter((entry) => entry.toLowerCase().endsWith('.obj'))

  if (!objFiles.length) {
    console.warn(`未在 ${folder} 找到 OBJ 文件，跳过`)
    return
  }

  for (const file of objFiles) {
    const inputPath = join(folder, file)
    await convertObjFile(inputPath)
  }
}

async function main() {
  for (const folder of TARGET_FOLDERS) {
    await convertFolder(folder)
  }
  console.log('OBJ 转 GLB 处理完成。')
}

main().catch((err) => {
  console.error('转换 OBJ 模型失败:', err)
  process.exitCode = 1
})
