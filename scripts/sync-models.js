import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.dirname(__dirname)

// Source directories for models
const sourceDirectories = [
  path.join(projectRoot, 'docs-submodules', 'spoke-body', 'models'),
  path.join(projectRoot, 'docs-submodules', 'spoke-electronics', 'models'),
  path.join(projectRoot, 'docs-submodules', 'spoke-power', 'models'),
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

async function syncModels() {
  console.log('Syncing models from docs-submodules to public/models...')
  
  // Ensure target directory exists
  await ensureDirectory(targetDirectory)
  
  let totalCopied = 0
  let totalSkipped = 0
  
  for (const sourceDir of sourceDirectories) {
    try {
      await fs.promises.access(sourceDir)
      
      // Extract repo name from path (e.g., 'spoke-body' from '.../docs-submodules/spoke-body/models')
      const repoName = path.basename(path.dirname(sourceDir))
      const repoTargetDir = path.join(targetDirectory, repoName)
      
      console.log(`\nProcessing: ${sourceDir} -> ${repoTargetDir}`)
      
      // Ensure repo-specific target directory exists
      await ensureDirectory(repoTargetDir)
      
      const files = await fs.promises.readdir(sourceDir)
      const modelFiles = files.filter(file => 
        supportedExtensions.has(path.extname(file).toLowerCase())
      )
      
      if (modelFiles.length === 0) {
        console.log('  No model files found')
        continue
      }
      
      for (const file of modelFiles) {
        const srcPath = path.join(sourceDir, file)
        const destPath = path.join(repoTargetDir, file)
        
        const copied = await copyFile(srcPath, destPath)
        if (copied) {
          totalCopied++
        } else {
          totalSkipped++
        }
      }
    } catch (error) {
      console.log(`  Directory not found or inaccessible: ${sourceDir}`)
    }
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
