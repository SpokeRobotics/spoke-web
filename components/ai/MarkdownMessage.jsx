'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Box, IconButton, Tooltip, Text } from '@radix-ui/themes'

// Lightweight, dependency-optional Markdown renderer.
// Dynamically imports react-markdown + plugins at runtime; until then, falls back to plain text.
export default function MarkdownMessage({ text }) {
  const [md, setMd] = useState(null)
  const [remarkGfm, setRemarkGfm] = useState(null)
  const [rehypeHighlight, setRehypeHighlight] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [{ default: ReactMarkdown }, { default: remarkGfmMod }, { default: rehypeHighlightMod }] = await Promise.all([
          import('react-markdown'),
          import('remark-gfm'),
          import('rehype-highlight'),
        ])
        if (!cancelled) {
          setMd(() => ReactMarkdown)
          setRemarkGfm(() => remarkGfmMod)
          setRehypeHighlight(() => rehypeHighlightMod)
        }
      } catch (e) {
        // Dependencies not installed; keep plain-text fallback
        if (!cancelled) {
          setMd(null)
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Copy-to-clipboard helper
  const copy = useCallback(async (s) => {
    try { await navigator.clipboard.writeText(s) } catch {}
  }, [])

  const components = useMemo(() => ({
    // headings, lists, etc. can use default mapping; we style via container class
    code({ inline, className, children, ...props }) {
      const lang = (className || '').replace(/.*language-/, '') || ''
      const raw = String(children || '')
      if (inline) {
        return (
          <code className="md-inline-code" {...props}>{children}</code>
        )
      }
      return (
        <Box className="md-codeblock" style={{ border: '1px solid var(--gray-5)', borderRadius: 8, overflow: 'hidden', margin: '8px 0' }}>
          <Box className="md-codeblock__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--gray-2)', borderBottom: '1px solid var(--gray-5)' }}>
            <Text size="1" color="gray">{lang || 'code'}</Text>
            <Tooltip content="Copy code">
              <IconButton size="1" variant="soft" onClick={() => copy(raw)} aria-label="Copy code">📋</IconButton>
            </Tooltip>
          </Box>
          <pre className={className} style={{ margin: 0, padding: '12px', overflowX: 'auto' }} {...props}>
            <code className={className}>{children}</code>
          </pre>
        </Box>
      )
    },
    a({ href, children, ...props }) {
      return <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>
    },
  }), [copy])

  if (!md || !remarkGfm || !rehypeHighlight) {
    // Fallback: plain text with pre-wrap
    return <Box className="md-fallback" style={{ whiteSpace: 'pre-wrap' }}>{text}</Box>
  }

  const ReactMarkdown = md
  return (
    <Box className="md-container" style={{ lineHeight: 1.5 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {text || ''}
      </ReactMarkdown>
    </Box>
  )
}
