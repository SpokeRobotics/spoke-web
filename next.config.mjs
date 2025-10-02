import createMDX from '@next/mdx'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'
// Allow configuring basePath/assetPrefix via env for GitHub Pages.
// Example: NEXT_PUBLIC_BASE_PATH=/spoke-robotics/spoke-web
const repoBasePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
const nextConfig = {
  ...(isProd && { output: 'export' }),
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  webpack: (config) => {
    // Load .wasm files as URLs so they can be cached and loaded by the browser
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'javascript/auto',
      loader: 'file-loader',
      options: {
        name: 'static/media/[name].[contenthash].[ext]',
      },
    })

    // Webpack 5 fallbacks (Next.js) recommended by ocjs docs
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false,
      perf_hooks: false,
      os: false,
      worker_threads: false,
      crypto: false,
      stream: false,
      path: false,
    }

    return config
  },
  async headers() {
    if (isProd) return []
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ]
  },
  // React configuration for better WebGL compatibility
  reactStrictMode: false, // Temporarily disable for WebGL context issues
  // Configure basePath/assetPrefix when building for Pages
  ...(isProd && repoBasePath
    ? {
        basePath: repoBasePath,
        assetPrefix: repoBasePath.endsWith('/') ? repoBasePath : `${repoBasePath}/`,
      }
    : {}),
}
const withMDX = createMDX({
  extension: /.mdx?$/,
  options: {
    remarkPlugins: [remarkGfm, remarkFrontmatter],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: 'wrap', properties: { className: ['anchor-link'] } }],
    ],
  },
})

export default withMDX(nextConfig)
