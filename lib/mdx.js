import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import { MDXRemote } from 'next-mdx-remote/rsc'
import NextLink from 'next/link'
import { Button, Box, Flex, Grid, Heading, Text } from '@radix-ui/themes'
import { Github, Twitter, Youtube } from 'lucide-react'
import ModelViewer from '@/components/model/ModelViewer'
import SystemViewer from '@/components/designer/SystemViewer'
import MDXImage from '@/components/MDXImage'
import ClientMdxCodeRenderer from '@/components/mdx/ClientMdxCodeRenderer'
import ClientMdxCodeWrapper from '@/components/mdx/ClientMdxCodeWrapper'
import NewsletterForm from '@/components/NewsletterForm'
import FeatureBox from '@/components/FeatureBox'

// Rehype plugin: split content into sections at h1/h2 and move <img> elements
// into a right-hand column for each section. JSX components remain untouched.
function rehypeSideImagesSections() {
  return (tree) => {
    if (!tree || !Array.isArray(tree.children)) return

    const isHeading = (node) => node && node.type === 'element' && /^h[12]$/i.test(node.tagName || '')
    const isImg = (node) => node && node.type === 'element' && (node.tagName || '').toLowerCase() === 'img'
    const isMdxJsx = (node) => node && (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement')
    const isMdxStlViewer = (node) => {
      if (!isMdxJsx(node)) return false
      const nm = String(node.name || '').toLowerCase()
      return nm === 'stlviewer' || nm === 'modelviewer' || nm === 'systemviewer'
    }

    function cloneNode(n) {
      return JSON.parse(JSON.stringify(n))
    }

    function extractImages(node, collected) {
      if (!node) return null
      // Treat HTML <img> and MDX <STLViewer /> as image-like content for the side column
      if (isImg(node) || isMdxStlViewer(node)) {
        collected.push(cloneNode(node))
        return null
      }
      if (node.children && Array.isArray(node.children)) {
        const nextChildren = []
        for (const child of node.children) {
          const cleaned = extractImages(child, collected)
          if (cleaned) nextChildren.push(cleaned)
        }
        // If element ends up empty and is a paragraph/div/etc., drop it
        const cleanedNode = { ...node, children: nextChildren }
        // Keep headings even if empty to preserve anchors
        // Also keep MDX JSX elements even if they have no children
        if (nextChildren.length === 0 && !isHeading(node) && !isMdxJsx(node)) {
          // If it had properties/values other than children, we could keep; otherwise drop
          return null
        }
        return cleanedNode
      }
      return node
    }

    const sections = []
    let current = { text: [], images: [] }

    const pushSection = () => {
      if (current.text.length === 0 && current.images.length === 0) return
      sections.push(current)
      current = { text: [], images: [] }
    }

    for (const child of tree.children) {
      if (isHeading(child)) {
        pushSection()
      }
      const imgs = []
      const cleaned = extractImages(child, imgs)
      if (cleaned) current.text.push(cleaned)
      if (imgs.length) current.images.push(...imgs)
    }
    pushSection()

    // Build new children array with two-column rows
    const rows = []
    for (const sec of sections) {
      // Skip empty sections with no text but only images: render images full-width
      if (sec.text.length === 0 && sec.images.length > 0) {
        rows.push({
          type: 'element',
          tagName: 'div',
          properties: { className: ['sideimages-fullwidth'] },
          children: [
            {
              type: 'element',
              tagName: 'div',
              properties: { className: ['sideimages-imageStack', 'sideimages-fullwidthStack'] },
              children: sec.images.map((img) => ({
                ...img,
                properties: {
                  ...(img.properties || {}),
                  className: [
                    ...(((img.properties || {}).className) || []),
                    'sideimages-image',
                    'sideimages-image--full'
                  ]
                },
              })),
            },
          ],
        })
        continue
      }

      rows.push({
        type: 'element',
        tagName: 'div',
        properties: { className: ['sideimages-row'] },
        children: [
          {
            type: 'element',
            tagName: 'article',
            properties: { className: ['sideimages-text'] },
            children: sec.text.length ? sec.text : [{ type: 'text', value: '' }],
          },
          {
            type: 'element',
            tagName: 'aside',
            properties: { className: ['sideimages-aside'] },
            children: [
              {
                type: 'element',
                tagName: 'div',
                properties: { className: ['sideimages-imageStack'] },
                children: sec.images.map((img) => ({
                  ...img,
                  properties: {
                    ...(img.properties || {}),
                    className: [
                      ...(((img.properties || {}).className) || []),
                      'sideimages-image'
                    ]
                  },
                })),
              },
            ],
          },
        ],
      })
    }

    tree.children = rows
  }
}

// Render MDX in App Router (RSC) with our preferred plugins.
// Allows raw HTML inside MDX and adds heading ids/links.
export function Mdx({ source, components = {}, layout }) {
  // Default MDX components available in all MDX files.
  // - Button: Radix UI Button
  // - NextLink: next/link Link component
  // - LinkButton: convenience wrapper to render a Button that navigates

  const defaultComponents = {
    // Map markdown/MDX <img> to our path-aware component
    img: MDXImage,
    Button,
    Box,
    Flex,
    Grid,
    Heading,
    Text,
    // Bluesky icon (from Simple Icons). Uses fill currentColor and size prop
    Bluesky: function Bluesky({ size = 16, style, ...props }) {
      return (
        <svg
          role="img"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          style={style}
          fill="currentColor"
          aria-label="Bluesky"
          {...props}
        >
          <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z" />
        </svg>
      )
    },
    // Custom components available in MDX
    // New generic 3D viewer
    ModelViewer,
    // Back-compat: map STLViewer to ModelViewer so existing MDX continues working
    STLViewer: (props) => <ModelViewer {...props} />,
    // SystemViewer - display parts from the designer store
    SystemViewer,
    NewsletterForm,
    FeatureBox,
    NextLink,
    // Expose a few Lucide icons for direct use in MDX
    Github,
    Twitter,
    Youtube,
    LinkButton: function LinkButton({ href, children, prefetch, disabled, title, variant, color, target, rel, className, ...buttonProps }) {
      // Disabled: render a non-link Button with gray/soft styling by default
      if (disabled) {
        const finalVariant = variant ?? 'soft'
        const finalColor = color ?? 'gray'
        return (
          <Button disabled aria-disabled title={title ?? 'Coming soon'} variant={finalVariant} color={finalColor} {...buttonProps}>
            {children}
          </Button>
        )
      }
      return (
        <Button asChild variant={variant} color={color} {...buttonProps}>
          <NextLink href={href} prefetch={prefetch} target={target} rel={rel} title={title} className={className}>
            {children}
          </NextLink>
        </Button>
      )
    },
    // MDX <code> blocks mapping handled in a client component with error boundary
    code: ClientMdxCodeWrapper,
    // Unwrap <pre> around cad blocks so our interactive component isn't trapped in a preformatted box
    pre: function PreWrapper(props) {
      const { children, ...rest } = props || {}
      // Expect children to be the <code> element MDX produces
      const child = Array.isArray(children) ? children[0] : children
      const className = child?.props?.className || ''
      const lang = (className || '').replace(/^language-/, '')
      const metastring = child?.props?.metastring || ''
      const isCad = (lang === 'cadjs') || (lang === 'js' && /(?:^|\s)cad(?:\s|$)/i.test(String(metastring)))
      const isD2 = (lang === 'd2') || (lang === 'js' && /(?:^|\s)d2(?:\s|$)/i.test(String(metastring)))
      const isD3 = (lang === 'd3') || (lang === 'js' && /(?:^|\s)d3(?:\s|$)/i.test(String(metastring)))
      const isSVG = (lang === 'svg') || (lang === 'js' && /(?:^|\s)svg(?:\s|$)/i.test(String(metastring)))
      const isThree = (lang === 'three') || (lang === 'js' && /(?:^|\s)three(?:\s|$)/i.test(String(metastring)))
      const isProcessing = (lang === 'processing') || (lang === 'js' && /(?:^|\s)processing(?:\s|$)/i.test(String(metastring)))
      if (isCad || isD2 || isD3 || isSVG || isThree || isProcessing) {
        // Let our code renderer render directly without a <pre> wrapper
        return <>{children}</>
      }
      return <pre {...rest}>{children}</pre>
    },
  }

  const rehypePlugins = [
    rehypeSlug,
    [rehypeAutolinkHeadings, { behavior: 'wrap', properties: { className: ['anchor-link'] } }],
    // Convert raw HTML string style attributes (e.g., style="width: 60%") into React style objects
    // to satisfy React's requirement that style be an object mapping.
    function rehypeFixStyleAttributes() {
      return (tree) => {
        const visit = (node, cb) => {
          if (!node) return
          cb(node)
          if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) visit(child, cb)
          }
        }
        const toCamel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        visit(tree, (node) => {
          if (!node || node.type !== 'element') return
          const props = node.properties || {}
          if (props && typeof props.style === 'string') {
            const obj = {}
            const str = props.style
            str.split(';').forEach((decl) => {
              const part = decl.trim()
              if (!part) return
              const idx = part.indexOf(':')
              if (idx === -1) return
              const key = toCamel(part.slice(0, idx).trim())
              const val = part.slice(idx + 1).trim()
              if (key) obj[key] = val
            })
            node.properties = { ...props, style: obj }
          }
        })
      }
    },
  ]
  if (layout === 'sideImages') {
    rehypePlugins.push(rehypeSideImagesSections)
  }

  // Normalize void HTML tags to self-closing so MDX (JSX) parsing doesn't fail on raw HTML like <img>
  function normalizeVoidTags(input) {
    if (typeof input !== 'string') return input
    const voidTags = ['img', 'br', 'hr', 'input', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr']
    let out = input
    for (const tag of voidTags) {
      const re = new RegExp(`<${tag}([^<>]*?)(?<!/)>` , 'gi')
      out = out.replace(re, (_m, attrs) => `<${tag}${attrs} />`)
    }
    return out
  }

  const fixedSource = normalizeVoidTags(source)

  // Remark plugin to expose code fence metastring to the code component as a prop
  function remarkExposeCodeMeta() {
    return (tree) => {
      const visit = (node, cb) => {
        cb(node)
        if (node && node.children) node.children.forEach(child => visit(child, cb))
      }
      visit(tree, (node) => {
        if (!node || node.type !== 'code') return
        if (!node.meta) return
        node.data = node.data || {}
        node.data.hProperties = node.data.hProperties || {}
        node.data.hProperties.metastring = node.meta
      })
    }
  }

  return (
    <MDXRemote
      source={fixedSource}
      components={{ ...defaultComponents, ...components }}
      options={{
        mdxOptions: {
          remarkPlugins: [remarkGfm, remarkExposeCodeMeta],
          rehypePlugins,
          // Allow raw HTML processing
          development: process.env.NODE_ENV !== 'production',
        },
      }}
    />
  )
}
