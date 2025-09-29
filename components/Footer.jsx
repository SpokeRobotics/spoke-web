import Link from 'next/link'
import { Github } from 'lucide-react'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        <div>
          <p style={{ margin: 0, color: 'var(--theme-colors-neutral-neutral-9)', lineHeight: 1.6, textAlign: 'center' }}>
            Built with Next.js, Radix Themes, and some AI.
          </p>
        </div>
        <div>
          <Link
            href="https://github.com/spokerobotics/spoke-web"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, color: 'inherit', textDecoration: 'none' }}
          >
            <Github size={18} />
          </Link>
        </div>
      </div>
    </footer>
  )
}
