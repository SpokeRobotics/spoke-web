#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = process.cwd()
const versionFile = path.join(projectRoot, 'lib', 'content-version.js')

function generateVersion() {
  const ts = new Date().toISOString()
  const content = `// Auto-generated. Do not edit.\nexport const CONTENT_VERSION = "${ts}"\n`
  
  try {
    fs.mkdirSync(path.dirname(versionFile), { recursive: true })
    fs.writeFileSync(versionFile, content, 'utf8')
    console.log(`✓ Generated lib/content-version.js with timestamp: ${ts}`)
  } catch (e) {
    console.error(`✗ Failed to generate content-version: ${e?.message || e}`)
    process.exit(1)
  }
}

generateVersion()
