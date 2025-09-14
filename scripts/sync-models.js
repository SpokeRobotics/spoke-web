import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.dirname(__dirname)

// Sync roots specify how to mirror source folders under public
// Rule: plain names map to /public/[root]/models
// - docs-submodules/*/models -> /public/docs-submodules/*/models
// - docs-test/models -> /public/docs-test/models
// - content/models -> /public/content/models
const SYNC_ROOTS = [
  { label: 'docs-submodules', srcRoot: path.join(projectRoot, 'docs-submodules'), dstRoot: path.join(projectRoot, 'public', 'docs-submodules') },
  { label: 'docs-test',       srcRoot: path.join(projectRoot, 'docs-test'),       dstRoot: path.join(projectRoot, 'public', 'docs-test') },
  { label: 'content',         srcRoot: path.join(projectRoot, 'content'),         dstRoot: path.join(projectRoot, 'public', 'content') },
]

// Supported model file extensions
// Include common polygon and interchange formats we want to host statically
const supportedExtensions = new Set(['.stl', '.step', '.stp', '.3mf', '.glb', '.gltf'])

async function ensureDirectory(dir) {
  try {
    await fs.promises.access(dir)
  } catch {
    await fs.promises.mkdir(dir, { recursive: true })
    console.log(`Created directory: ${dir}`)
  }
}

async function copyFile(src, dest) {
  try {
    const srcStat = await fs.promises.stat(src)
    let shouldCopy = true
    
    try {
      const destStat = await fs.promises.stat(dest)
      // Only copy if source is newer than destination
      shouldCopy = srcStat.mtime > destStat.mtime
    } catch {
      // Destination doesn't exist, so copy
      shouldCopy = true
    }
    
    if (shouldCopy) {
      await fs.promises.copyFile(src, dest)
      console.log(`Copied: ${path.basename(src)}`)
      return true
    } else {
      console.log(`Skipped (up to date): ${path.basename(src)}`)
      return false
    }
  } catch (error) {
    console.error(`Error copying ${src} to ${dest}:`, error.message)
    return false
  }
}

async function syncOneSource(sourceDir, targetDir) {
  try {
    await fs.promises.access(sourceDir)

    const repoTargetDir = targetDir
    console.log(`\nProcessing: ${sourceDir} -> ${repoTargetDir}`)

    // Ensure target directory exists
    await ensureDirectory(repoTargetDir)

    const files = await fs.promises.readdir(sourceDir)
    const modelFiles = files.filter(file =>
      supportedExtensions.has(path.extname(file).toLowerCase())
    )

    if (modelFiles.length === 0) {
      console.log('  No model files found')
      // Mirror behavior: if there are no source model files, remove supported files from target
      try {
        const existing = await fs.promises.readdir(repoTargetDir)
        for (const f of existing) {
          if (supportedExtensions.has(path.extname(f).toLowerCase())) {
            const toRemove = path.join(repoTargetDir, f)
            await fs.promises.unlink(toRemove)
            console.log(`  Removed (no longer in source): ${f}`)
          }
        }
      } catch {}
      return { copied: 0, skipped: 0 }
    }

    // Track set of source filenames for mirror deletion
    const sourceSet = new Set(modelFiles)

    let copiedCount = 0
    let skippedCount = 0
    for (const file of modelFiles) {
      const srcPath = path.join(sourceDir, file)
      const destPath = path.join(repoTargetDir, file)
      const copied = await copyFile(srcPath, destPath)
      if (copied) copiedCount++
      else skippedCount++
    }

    // Mirror behavior: remove target files that are supported but not present in source
    try {
      const existing = await fs.promises.readdir(repoTargetDir)
      for (const f of existing) {
        if (!supportedExtensions.has(path.extname(f).toLowerCase())) continue
        if (!sourceSet.has(f)) {
          const toRemove = path.join(repoTargetDir, f)
          await fs.promises.unlink(toRemove)
          console.log(`  Removed (orphan): ${f}`)
        }
      }
    } catch (e) {
      console.error(`  Error while pruning orphans in ${repoTargetDir}:`, e.message)
    }

    return { copied: copiedCount, skipped: skippedCount }
  } catch (error) {
    console.log(`  Directory not found or inaccessible: ${sourceDir}`)
    return { copied: 0, skipped: 0 }
  }
}

async function syncModels() {
  console.log('Syncing models to public/*/models (mirroring source roots)...')

  let totalCopied = 0
  let totalSkipped = 0

  // Walk each sync root
  for (const root of SYNC_ROOTS) {
    const { srcRoot, dstRoot, label } = root
    // Ensure destination root exists
    await ensureDirectory(dstRoot)

    // Enumerate subfolders that contain a models/ directory
    // Cases:
    // - docs-submodules/<repo>/models
    // - docs-test/models
    // - content/models
    const candidates = []
    try {
      const items = await fs.promises.readdir(srcRoot)
      for (const item of items) {
        const full = path.join(srcRoot, item)
        const stat = await fs.promises.stat(full)
        if (stat.isDirectory()) {
          const modelDir = path.join(full, 'models')
          try {
            const ms = await fs.promises.stat(modelDir)
            if (ms.isDirectory()) {
              // e.g., docs-submodules/spoke-body/models -> public/docs-submodules/spoke-body/models
              candidates.push({ src: modelDir, dst: path.join(dstRoot, item, 'models') })
            }
          } catch {}
        }
      }
      // Also check if the root itself has models/ (docs-test, content)
      const rootModels = path.join(srcRoot, 'models')
      try {
        const rms = await fs.promises.stat(rootModels)
        if (rms.isDirectory()) {
          candidates.push({ src: rootModels, dst: path.join(dstRoot, 'models') })
        }
      } catch {}
    } catch (e) {
      // ignore missing roots
    }

    for (const c of candidates) {
      await ensureDirectory(c.dst)
      const { copied, skipped } = await syncOneSource(c.src, c.dst)
      totalCopied += copied
      totalSkipped += skipped
    }
  }

  console.log(`\nSync complete: ${totalCopied} files copied, ${totalSkipped} files skipped`)
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  syncModels().catch(console.error)
}

export { syncModels }
