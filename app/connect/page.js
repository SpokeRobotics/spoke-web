import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { Section, Box, Heading, Text, Button, Flex } from '@radix-ui/themes'
import NextLink from 'next/link'
import { Mdx } from '@/lib/mdx'
import { Mermaid } from '@/components/Mermaid'
import FloatingTOC from '@/components/FloatingTOC'
import MDXImage from '@/components/MDXImage'
import { extractAndMaybeRemoveFirstH1FromMdxSource } from '@/lib/title'
import { CONTENT_VERSION } from '@/lib/content-version'

export const metadata = {
  title: 'Connect - SPOKE ROBOTICS',
  description: 'Connect with SPOKE ROBOTICS',
}

export default async function ConnectPage() {
  // In development, disable caching so markdown edits reflect immediately.
  if (process.env.NODE_ENV !== 'production') {
    const { unstable_noStore } = await import('next/cache')
    unstable_noStore()
    const { headers } = await import('next/headers')
    headers() // trigger dynamic rendering in dev
  }

  try {
    // Read connect content from content/connect.mdx (or .md)
    const mdxPath = path.join(process.cwd(), 'content', 'connect.mdx')
    const mdPath = path.join(process.cwd(), 'content', 'connect.md')
    let fileContents = null
    if (fs.existsSync(mdxPath)) {
      fileContents = fs.readFileSync(mdxPath, 'utf8')
    } else if (fs.existsSync(mdPath)) {
      fileContents = fs.readFileSync(mdPath, 'utf8')
    }

    if (!fileContents) {
      throw new Error('content/connect.mdx (or .md) not found')
    }

    const { data: frontmatter, content } = matter(fileContents)

    // Derive page title from frontmatter or first H1
    const { title: derivedTitle } = extractAndMaybeRemoveFirstH1FromMdxSource(
      content,
      frontmatter.title
    )
    const pageTitle = derivedTitle || 'Connect'

    return (
      <>
        <Section size="4">
          <Box className="container" data-content-version={CONTENT_VERSION}>
            <div className="prose dark:prose-invert max-w-none">
              <Mdx
                source={content}
                layout={frontmatter.layout}
                components={{
                  // Map markdown elements and custom components
                  h1: (props) => <Heading as="h1" size="9" mb="2" {...props} />,
                  img: (imgProps) => (
                    <MDXImage {...imgProps} originPath="/connect" backLabel={pageTitle} />
                  ),
                  // Expose Radix primitives and NextLink for MDX usage
                  Heading,
                  Text,
                  Box,
                  Flex,
                  Button,
                  NextLink,
                }}
              />
            </div>
            <Mermaid autoRender={true} />
          </Box>
        </Section>
        <FloatingTOC />
      </>
    )
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Connect] markdown render error:', e)
    }
    // Fallback
    return (
      <Section size="4">
        <Box className="container" data-content-version={CONTENT_VERSION}>
          <Box style={{ textAlign: 'center' }}>
            <Heading size="9" mb="2">Connect</Heading>
            <Text as="p" size="4" color="gray">
              Content not available.
            </Text>
          </Box>
        </Box>
      </Section>
    )
  }
}
