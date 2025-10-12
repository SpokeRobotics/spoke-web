import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { Section, Box, Heading, Text, Button, Flex } from '@radix-ui/themes'
import NextLink from 'next/link'
import { Mdx } from '@/lib/mdx'
import { Mermaid } from '@/components/Mermaid'
import FloatingTOC from '@/components/FloatingTOC'
import MDXImage from '@/components/MDXImage'
import FeatureBox from '@/components/FeatureBox'
import { extractAndMaybeRemoveFirstH1FromMdxSource } from '@/lib/title'
import { CONTENT_VERSION } from '@/lib/content-version'
import HomeThemeProvider from '@/components/providers/HomeThemeProvider'

export default async function Home() {
  // In development, disable caching so markdown edits reflect immediately.
  if (process.env.NODE_ENV !== 'production') {
    const { unstable_noStore } = await import('next/cache')
    unstable_noStore()
    const { headers } = await import('next/headers')
    headers() // trigger dynamic rendering in dev
  }

  try {
    // Read home content from content/home.mdx (or .md)
    const mdxPath = path.join(process.cwd(), 'content', 'home.mdx')
    const mdPath = path.join(process.cwd(), 'content', 'home.md')
    let fileContents = null
    if (fs.existsSync(mdxPath)) {
      fileContents = fs.readFileSync(mdxPath, 'utf8')
    } else if (fs.existsSync(mdPath)) {
      fileContents = fs.readFileSync(mdPath, 'utf8')
    }

    if (!fileContents) {
      throw new Error('content/home.mdx (or .md) not found')
    }

    const { data: frontmatter, content } = matter(fileContents)

    // Derive page title from frontmatter or first H1, but keep the H1 in body (no removal)
    const { title: derivedTitle } = extractAndMaybeRemoveFirstH1FromMdxSource(
      content,
      frontmatter.title
    )
    const pageTitle = derivedTitle || 'Home'

    return (
      <HomeThemeProvider>
        <Section size="4">
          <Box className="container" data-content-version={CONTENT_VERSION}>
            <div className="prose dark:prose-invert max-w-none">
              <Mdx
                source={content}
                layout={frontmatter.layout}
                components={{
                  // Map markdown elements and custom components expected by the home MDX
                  h1: (props) => <Heading as="h1" size="9" mb="2" {...props} />,
                  img: (imgProps) => (
                    <MDXImage {...imgProps} originPath="/" backLabel={pageTitle} />
                  ),
                  FeatureBox,
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
      </HomeThemeProvider>
    )
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Home] markdown render error:', e)
    }
    // fall through to JSX fallback
  }

  // Fallback to existing hard-coded content
  return (
    <HomeThemeProvider>
      <Section size="4">
        <Box className="container" data-content-version={CONTENT_VERSION}>
          {process.env.NODE_ENV !== 'production' && (
            <Text size="1" color="gray" mb="2">[Dev] Fallback homepage JSX</Text>
          )}
          <Box style={{ textAlign: 'center' }}>
            <Heading size="9" mb="2">Welcome to Spoke</Heading>
            <Text as="p" size="4" color="gray">
              A modern design system and development toolkit.
            </Text>
            <Flex mt="6" gap="3" justify="center" wrap="wrap">
              <Button asChild>
                <NextLink href="/test">Go to Test</NextLink>
              </Button>
              <Button asChild variant="soft">
                <NextLink href="/docs">View Documentation</NextLink>
              </Button>
            </Flex>
          </Box>
        </Box>
      </Section>
    </HomeThemeProvider>
  )
}
