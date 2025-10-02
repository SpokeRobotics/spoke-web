import Link from 'next/link'
import { ThemeToggle } from './ThemeToggle'
import MobileTOC from '@/components/MobileTOC'

export async function HomeNavbar() {
  return (
    <header className="home-navbar">
      <div className="container home-navbar-inner">
        <div className="home-navbar-brand">
          <Link href="/" style={{ display: 'flex', alignItems: 'center', marginRight: 24 }}>
            <img
              className="home-navbar-logo"
              src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/assets/spoke-logo.svg`}
              alt="Spoke Logo"
              decoding="async"
              loading="eager"
            />
          </Link>
          <nav className="home-navbar-links">
            {/* Theme toggle only */}
            <ThemeToggle />
          </nav>
        </div>
        {/* Mobile TOC hamburger (small screens). Fixed-position button styled via globals.css */}
        <MobileTOC />
      </div>
    </header>
  )
}
