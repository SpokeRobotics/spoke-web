import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.dirname(__dirname)

// Source directories for models (repo-based)
const sourceDirectories = [
  path.join(projectRoot, 'docs-submodules', 'spoke-body', 'models'),
  path.join(projectRoot, 'docs-submodules', 'spoke-electronics', 'models'),
  path.join(projectRoot, 'docs-submodules', 'spoke-power', 'models'),
]

// Additional explicit mappings: [{ sourceDir, targetSubdir }]
// These allow non-repo locations to copy into a specific path under public/models
const sourceMappings = [
  {
    sourceDir: path.join(projectRoot, 'docs-test', 'models'),
    targetSubdir: path.join('test', 'stl'), // => public/models/test/stl
  },
]

// Target directory
const targetDirectory = path.join(projectRoot, 'public', 'models')

// Supported model file extensions
const supportedExtensions = new Set(['.stl', '.step', '.stp'])

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

async function syncOneSource(sourceDir, targetSubdir) {
  try {
    await fs.promises.access(sourceDir)

    const repoTargetDir = path.join(targetDirectory, targetSubdir)
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
  console.log('Syncing models from docs-submodules to public/models...')

  // Ensure target directory exists
  await ensureDirectory(targetDirectory)

  let totalCopied = 0
  let totalSkipped = 0

  for (const sourceDir of sourceDirectories) {
    // Extract repo name from path (e.g., 'spoke-body' from '.../docs-submodules/spoke-body/models')
    const repoName = path.basename(path.dirname(sourceDir))
    const { copied, skipped } = await syncOneSource(sourceDir, repoName)
    totalCopied += copied
    totalSkipped += skipped
  }

  // Process explicit mappings (e.g., test models)
  for (const m of sourceMappings) {
    const { sourceDir, targetSubdir } = m
    const { copied, skipped } = await syncOneSource(sourceDir, targetSubdir)
    totalCopied += copied
    totalSkipped += skipped
  }

  console.log(`\nSync complete: ${totalCopied} files copied, ${totalSkipped} files skipped`)
  
  // List all files in target directory by repo
  try {
    const repoDirs = await fs.promises.readdir(targetDirectory)
    console.log(`\nAvailable models in public/models:`)
    
    for (const repoDir of repoDirs) {
      const repoDirPath = path.join(targetDirectory, repoDir)
      try {
        const stat = await fs.promises.stat(repoDirPath)
        if (stat.isDirectory()) {
          const files = await fs.promises.readdir(repoDirPath)
          const modelFiles = files.filter(file => 
            supportedExtensions.has(path.extname(file).toLowerCase())
          )
          console.log(`  ${repoDir}/ (${modelFiles.length} files)`)
          modelFiles.forEach(file => console.log(`    - ${file}`))
        }
      } catch (error) {
        console.log(`  ${repoDir}/ (error reading directory)`)
      }
    }
  } catch (error) {
    console.error('Error listing target directory:', error.message)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  syncModels().catch(console.error)
}

export { syncModels }
