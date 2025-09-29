// Helper functions for basePath/assetPrefix aware URLs

export function getBasePath() {
  // Use the same env var that Next.js config reads.
  // Example value for GitHub Pages: "/spoke-web"
  const bp = process.env.NEXT_PUBLIC_BASE_PATH || ''
  return bp
}

export function getAssetPath(path) {
  const basePath = getBasePath()
  return `${basePath}${path.startsWith('/') ? path : `/${path}`}`
}

export function getImagePath(imagePath) {
  if (!imagePath) return ''
  // External URLs and data URIs pass through
  if (/^(https?:)?\/\//i.test(imagePath) || imagePath.startsWith('data:')) {
    return imagePath
  }
  // Strip any origin
  try {
    if (imagePath.startsWith('http')) {
      const u = new URL(imagePath)
      imagePath = u.pathname
    }
  } catch {}

  // Normalize leading slash
  const p = imagePath.startsWith('/') ? imagePath : `/${imagePath}`

  // Supported inputs:
  // - /content/images/...
  // - /docs-test/images/...
  // - /docs-submodules/images/...
  // - /docs-submodules/<repo>/images/...
  // - /images/... (relative from markdown)
  // Map all of them to /content/images/...
  const contentImagesRe = /^\/(content|docs-test|docs-submodules)(?:\/[^/]+)?\/images\/(.*)$/
  const relImagesRe = /^\/images\/(.*)$/
  let rel = null
  const m1 = p.match(contentImagesRe)
  if (m1) {
    rel = m1[2]
  } else {
    const m2 = p.match(relImagesRe)
    if (m2) rel = m2[1]
  }
  if (rel) {
    return getAssetPath(`/content/images/${rel}`)
  }
  // Fallback: prefix as-is with basePath
  return getAssetPath(p)
}
