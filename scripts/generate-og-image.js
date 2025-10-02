#!/usr/bin/env node
/*
  Generates a default OpenGraph image at public/og/og-image.png
  - Background: content/images/body.png
  - Overlay text: "SPOKE ROBOTICS"
  - Size: 1200x630

  Usage: node scripts/generate-og-image.js
*/
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true })
}

function toFileUrl(p) {
  const abs = path.resolve(p)
  const prefix = process.platform === 'win32' ? 'file:///' : 'file://'
  return prefix + abs.replace(/\\/g, '/')
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..')
  const backgroundPath = path.resolve(projectRoot, 'content/images/body.png')
  const outDir = path.resolve(projectRoot, 'public/og')
  const outPath = path.join(outDir, 'og-image.png')

  // Basic checks
  try {
    await fs.promises.access(backgroundPath, fs.constants.R_OK)
  } catch (e) {
    console.error('Background image not found or unreadable at:', backgroundPath)
    process.exit(1)
  }
  await ensureDir(outDir)

  const width = 1200
  const height = 630

  // Embed the background as a data URL to avoid any file:// loading/cross-origin issues
  const bgBuffer = await fs.promises.readFile(backgroundPath)
  const bgBase64 = bgBuffer.toString('base64')
  const bgUrl = `data:image/png;base64,${bgBase64}`

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --w: ${width}px;
        --h: ${height}px;
      }
      @media (prefers-color-scheme: dark) { }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { width: var(--w); height: var(--h); font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji"; }
      .frame {
        position: relative;
        width: var(--w);
        height: var(--h);
        display: grid;
        place-items: center;
        color: #fff;
        text-align: center;
        overflow: hidden;
      }
      .bg {
        position: absolute;
        inset: 0;
        background-image: url('${bgUrl}');
        background-size: cover;
        background-position: center;
        /* Preserve original look; no extra filters or scaling */
      }
      .overlay {
        position: absolute;
        inset: 0;
        /* No overlay to fully reveal the background image */
        background: none;
      }
      h1 {
        position: relative;
        margin: 0;
        padding: 0 64px;
        font-size: 92px;
        line-height: 1.05;
        font-weight: 800;
        letter-spacing: -0.02em;
        /* Slightly stronger shadow for readability without overlay */
        text-shadow: 0 4px 18px rgba(0,0,0,0.55);
      }
      .badge {
        position: absolute;
        right: 28px;
        bottom: 24px;
        padding: 8px 12px;
        font-size: 20px;
        border-radius: 8px;
        background: rgba(0,0,0,0.35);
        border: 1px solid rgba(255,255,255,0.2);
      }
    </style>
  </head>
  <body>
    <!-- Preload background image to ensure it's fully loaded before screenshot -->
    <img id="__preload" src="${bgUrl}" style="display:none" onload="window.__bgReady=true" onerror="window.__bgReady='error'" />
    <div class="frame">
      <div class="bg"></div>
      <div class="overlay"></div>
      <h1>SPOKE ROBOTICS</h1>
      <div class="badge">spoke-robotics.com</div>
    </div>
  </body>
</html>`

  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width, height, deviceScaleFactor: 1 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width, height, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    // Wait for background image to load via the hidden preloader
    await page.waitForFunction('window.__bgReady === true', { timeout: 10000 })
    await page.screenshot({ path: outPath, type: 'png' })
    console.log('OG image generated at', outPath)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
