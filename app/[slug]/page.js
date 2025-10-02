import { Section, Box, Heading, Text, Button, Flex, Grid } from '@radix-ui/themes'
import NextLink from 'next/link'
import { Mdx } from '@/lib/mdx'
import { Mermaid } from '@/components/Mermaid'
import MDXImage from '@/components/MDXImage'
import FeatureBox from '@/components/FeatureBox'
import { getTopLevelContentSlugs } from '@/lib/markdown'
import { notFound } from 'next/navigation'
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import FloatingTOC from '@/components/FloatingTOC'
import { extractAndMaybeRemoveFirstH1FromMdxSource } from '@/lib/title'
import { CONTENT_VERSION } from '@/lib/content-version'

export async function generateStaticParams() {
  const slugs = await getTopLevelContentSlugs()
  return slugs
}

export async function generateMetadata({ params }) {
  const resolvedParams = await params
  const slug = resolvedParams.slug

  // Read the content file to derive metadata
  const mdxPath = path.join(process.cwd(), 'content', `${slug}.mdx`)
  const mdPath = path.join(process.cwd(), 'content', `${slug}.md`)

  let fileContents
  if (fs.existsSync(mdxPath)) {
    fileContents = fs.readFileSync(mdxPath, 'utf8')
  } else if (fs.existsSync(mdPath)) {
    fileContents = fs.readFileSync(mdPath, 'utf8')
  } else {
    return {}
  }

  const { data: frontmatter, content } = matter(fileContents)
  const { title: derivedTitle } = extractAndMaybeRemoveFirstH1FromMdxSource(
    content,
    frontmatter.title
  )

  const pageTitle = derivedTitle || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  const description = frontmatter.description || undefined
  const image = frontmatter.image || '/og/og-image.png'
  const url = `/${slug}`

  return {
    title: pageTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: pageTitle,
      description,
      url,
      images: [
        typeof image === 'string' ? { url: image, width: 1200, height: 630 } : image,
      ],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      images: [typeof image === 'string' ? image : image?.url],
    },
  }
}

export default async function TopLevelContentPage({ params }) {
  const resolvedParams = await params
  const slug = resolvedParams.slug

  // In development, disable caching so markdown edits reflect immediately
  if (process.env.NODE_ENV !== 'production') {
    const { unstable_noStore } = await import('next/cache')
    unstable_noStore()
  }

  try {
    // Read the content file from content directory
    const filePath = path.join(process.cwd(), 'content', `${slug}.mdx`)
    let fileContents
    
    // Try .mdx first, then .md
    if (fs.existsSync(filePath)) {
      fileContents = fs.readFileSync(filePath, 'utf8')
    } else {
      const mdPath = path.join(process.cwd(), 'content', `${slug}.md`)
      if (fs.existsSync(mdPath)) {
        fileContents = fs.readFileSync(mdPath, 'utf8')
      } else {
        notFound()
      }
    }

    const { data: frontmatter, content } = matter(fileContents)

    // Remove first H1 from MD/MDX content if it duplicates/equals page title
    const { source: cleanedSource, title: derivedTitle } = extractAndMaybeRemoveFirstH1FromMdxSource(
      content,
      frontmatter.title
    )

    // Derive page title from frontmatter or first H1 or slug
    const pageTitle = derivedTitle || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

    return (
      <>
        <Section size="4">
          <Box className="container" data-content-version={CONTENT_VERSION}>
            <Box mb="5">
              <Heading size="9">
                {pageTitle}
              </Heading>
              {frontmatter.description && (
                <Text as="p" color="gray" size="4">{frontmatter.description}</Text>
              )}
            </Box>
            
            <div className="prose dark:prose-invert max-w-none">
              <Mdx
                source={cleanedSource}
                layout={frontmatter.layout}
                components={{
                  img: (imgProps) => (
                    <MDXImage
                      {...imgProps}
                      originPath={`/${slug}`}
                      backLabel={pageTitle}
                    />
                  ),
                  FeatureBox,
                  // Expose Radix primitives and NextLink for MDX usage
                  Heading,
                  Text,
                  Box,
                  Flex,
                  Grid,
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
  } catch (error) {
    console.error(`Error loading content for slug "${slug}":`, error)
    notFound()
  }
}
