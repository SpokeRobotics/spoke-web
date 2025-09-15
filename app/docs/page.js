import NextLink from 'next/link'
import { Github } from 'lucide-react'
import fs from 'fs'
import path from 'path'
import { getMarkdownFilesFromRoots } from '@/lib/markdown'
import { getImagePath } from '@/lib/paths'
import DocCard from '@/components/DocCard'
import {
  Section,
  Box,
  Heading,
  Text,
  Grid,
  Card,
  Button,
  Code,
} from '@radix-ui/themes'

export default async function DocsIndexPage() {
  // Discover all repos (directories) under docs-submodules/
  const repos = []
  const reposDir = path.join(process.cwd(), 'docs-submodules')
  if (fs.existsSync(reposDir)) {
    for (const entry of fs.readdirSync(reposDir)) {
      const full = path.join(reposDir, entry)
      try {
        if (fs.statSync(full).isDirectory() && !entry.startsWith('.')) {
          repos.push(entry)
        }
      } catch {}
    }
  }

  // Find markdown files under docs-submodules and map best slug per repo
  const files = await getMarkdownFilesFromRoots(['docs-submodules'])
  const slugsByRepo = new Map()
  for (const repo of repos) {
    // Prefer <repo>/<repo>.md
    const exact = files.find(f => f.slug === `${repo}/${repo}`)
    if (exact) {
      slugsByRepo.set(repo, exact.slug)
      continue
    }
    // Fallback: first markdown file in that repo
    const first = files.find(f => f.slug.startsWith(`${repo}/`))
    if (first) slugsByRepo.set(repo, first.slug)
  }

  // Build a map of repo -> thumbnail src if present
  const thumbByRepo = new Map()
  const exts = ['png', 'jpg', 'jpeg', 'webp', 'svg']
  for (const repo of repos) {
    let found = null
    for (const ext of exts) {
      const abs = path.join(process.cwd(), 'docs-submodules', repo, 'images', `${repo}.${ext}`)
      if (fs.existsSync(abs)) {
        found = getImagePath(`/docs-submodules/${repo}/images/${repo}.${ext}`)
        break
      }
    }
    if (found) thumbByRepo.set(repo, found)
  }

  // Parse .gitmodules to map docs-submodules/<repo> -> remote URL
  const repoUrlByRepo = new Map()
  try {
    const gm = fs.readFileSync(path.join(process.cwd(), '.gitmodules'), 'utf8')
    // Split into sections like [submodule "docs-submodules/<name>"]
    const sections = gm.split(/\n(?=\[submodule ")/g)
    for (const sec of sections) {
      const pathMatch = sec.match(/\bpath\s*=\s*(.+)\s*/)
      const urlMatch = sec.match(/\burl\s*=\s*(.+)\s*/)
      if (!pathMatch || !urlMatch) continue
      const subPath = pathMatch[1].trim()
      const urlRaw = urlMatch[1].trim()
      // Expect subPath like "docs-submodules/<repo>"
      const parts = subPath.split('/')
      const repo = parts[parts.length - 1]
      let httpsUrl = urlRaw
      // Normalize SSH to HTTPS and strip trailing .git
      if (/^git@github.com:/.test(httpsUrl)) {
        httpsUrl = 'https://github.com/' + httpsUrl.replace(/^git@github.com:/, '')
      }
      httpsUrl = httpsUrl.replace(/\.git$/i, '')
      repoUrlByRepo.set(repo, httpsUrl)
    }
  } catch (e) {
    // If .gitmodules missing or unreadable, silently ignore
  }

  return (
    <Section size="4">
      <Box className="container">
        <Box mb="5">
          <Heading size="9">Documentation</Heading>
          <Text as="p" color="gray" size="4">
            System Documentation
          </Text>
        </Box>

        {repos.length === 0 ? (
          <DocCard>
            <Heading size="4" mb="2">No Documentation Found</Heading>
            <Text as="p" color="gray" size="3" mb="3">
              Add a docs repository as a Git submodule in <Code>docs-submodules/</Code>.
            </Text>
            <div className="prose dark:prose-invert">
              <p>Example command:</p>
              <pre><code>git submodule add https://github.com/your-username/your-docs-repo.git docs-submodules/your-docs-repo</code></pre>
            </div>
          </DocCard>
        ) : (
          <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
            {repos.map((repo) => (
              <DocCard key={repo}>
                {(() => { const src = thumbByRepo.get(repo); return src ? (
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                    <img src={src} alt={`${repo} preview`} style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 8 }} />
                  </div>
                ) : null })()}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <Heading size="4" mb="0">
                    {(() => {
                      const slug = slugsByRepo.get(repo)
                      const label = repo.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                      return slug ? (
                        <NextLink href={`/docs/${slug}`}>
                          {label}
                        </NextLink>
                      ) : (
                        <span>{label}</span>
                      )
                    })()}
                  </Heading>
                  {(() => {
                    const url = repoUrlByRepo.get(repo)
                    if (!url) return null
                    return (
                      <NextLink
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${repo} on GitHub`}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, color: 'inherit', textDecoration: 'none' }}
                        title={`${repo} repository`}
                      >
                        <Github size={18} />
                      </NextLink>
                    )
                  })()}
                </div>
                {(() => {
                  if (!slugsByRepo.get(repo)) {
                    return (
                      <Text color="gray" size="2">
                        No markdown files found in this submodule yet.
                      </Text>
                    )
                  }
                  return null
                })()}
              </DocCard>
            ))}
          </Grid>
        )}
      </Box>
    </Section>
  )
}
