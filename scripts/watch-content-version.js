#!/usr/bin/env node
import chokidar from 'chokidar'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = process.cwd()
const versionFile = path.join(projectRoot, 'lib', 'content-version.js')
const syncScript = path.join(projectRoot, 'scripts', 'sync-content-images.js')
const syncModelsScript = path.join(projectRoot, 'scripts', 'sync-models.js')

function writeVersion(reason = '') {
  const ts = new Date().toISOString()
  const content = `// Auto-generated. Do not edit.\nexport const CONTENT_VERSION = "${ts}"\n`
  try {
    fs.mkdirSync(path.dirname(versionFile), { recursive: true })
    fs.writeFileSync(versionFile, content, 'utf8')
    log(`updated content-version (${reason}) -> ${ts}`)
  } catch (e) {
    log(`failed to write content-version: ${e?.message || e}`)
  }
}

let modelSyncInFlight = false
let modelSyncPending = false
function runModelSync() {
  if (modelSyncInFlight) {
    modelSyncPending = true
    return
  }
  modelSyncInFlight = true
  const child = spawn(process.execPath, [syncModelsScript], {
    stdio: ['ignore', 'inherit', 'inherit'],
    cwd: projectRoot,
    env: process.env,
  })
  child.on('exit', (code) => {
    modelSyncInFlight = false
    if (modelSyncPending) {
      modelSyncPending = false
      runModelSync()
    }
  })
}

let syncInFlight = false
let syncPending = false
function runImageSync() {
  if (syncInFlight) {
    syncPending = true
    return
  }
  syncInFlight = true
  const child = spawn(process.execPath, [syncScript], {
    stdio: ['ignore', 'inherit', 'inherit'],
    cwd: projectRoot,
    env: process.env,
  })
  child.on('exit', (code) => {
    syncInFlight = false
    if (syncPending) {
      syncPending = false
      runImageSync()
    }
  })
}

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(`[watch-content] ${msg}`)
}

// Initial write so the module exists
writeVersion('startup')
runImageSync()
runModelSync()

// Watch markdown and images under content/, docs-submodules/, and docs-test/
const watchGlobs = [
  path.join(projectRoot, 'content'),
  path.join(projectRoot, 'docs-submodules'),
  path.join(projectRoot, 'docs-test'),
]

const watcher = chokidar.watch(watchGlobs, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
})

let pendingTimer = null
function schedule(reason) {
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => {
    pendingTimer = null
    writeVersion(reason)
  }, 200)
}

watcher
  .on('add', (p) => {
    const rel = path.relative(projectRoot, p)
    log(`add: ${rel}`)
    schedule('add')
    if (/(\.(png|jpe?g|svg|gif|webp|bmp|tiff|heic|heif))$/i.test(p)) {
      runImageSync()
    }
    if (/(\.(stl|step|stp))$/i.test(p)) {
      runModelSync()
    }
  })
  .on('change', (p) => {
    const rel = path.relative(projectRoot, p)
    log(`change: ${rel}`)
    schedule('change')
    if (/(\.(png|jpe?g|svg|gif|webp|bmp|tiff|heic|heif))$/i.test(p)) {
      runImageSync()
    }
    if (/(\.(stl|step|stp))$/i.test(p)) {
      runModelSync()
    }
  })
  .on('unlink', (p) => {
    const rel = path.relative(projectRoot, p)
    log(`unlink: ${rel}`)
    schedule('unlink')
    if (/(\.(png|jpe?g|svg|gif|webp|bmp|tiff|heic|heif))$/i.test(p)) {
      runImageSync()
    }
    if (/(\.(stl|step|stp))$/i.test(p)) {
      runModelSync()
    }
  })
  .on('error', (e) => log(`watch error: ${e?.message || e}`))

process.on('SIGINT', async () => {
  log('shutting down...')
  await watcher.close()
  process.exit(0)
})
