'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ThemeToggle } from './ThemeToggle'
import MobileTOC from '@/components/MobileTOC'

export function NavbarWrapper({ topLevelPages = [] }) {
  const pathname = usePathname()
  
  // Minimal navbar for home page, confirmation page, and connect page
  const isMinimalNav = pathname === '/' || pathname === '/confirmation' || pathname === '/confirmation/' || pathname === '/connect' || pathname === '/connect/'
  
  if (isMinimalNav) {
    return (
      <header className="home-navbar">
        <div className="container home-navbar-inner">
          <div className="home-navbar-brand">
            <Link href="/" style={{ display: 'flex', alignItems: 'center', marginRight: 24 }}>
              <img
                className="home-navbar-logo"
                src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/assets/spoke-nav-60-WonB.png`}
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
  
  // Standard navbar for all other pages
  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <div className="navbar-brand">
          <Link href="/" style={{ display: 'flex', alignItems: 'center', marginRight: 24 }}>
            <img
              className="navbar-logo"
              src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/assets/spoke-nav-60-WonB.png`}
              alt="Spoke Logo"
              decoding="async"
              loading="eager"
            />
          </Link>
          <nav className="navbar-links">
            {/* Dynamic content pages */}
            {topLevelPages.map(page => (
              <Link key={page.slug} href={`/${page.slug}`}>
                {page.title}
              </Link>
            ))}
            
            {/* Static navigation items */}
            <Link href="/docs">Documentation</Link>
            <Link href="/test">Test</Link>
            {/* Theme toggle lives with other nav items */}
            <ThemeToggle />
          </nav>
        </div>
        {/* Mobile TOC hamburger (small screens). Fixed-position button styled via globals.css */}
        <MobileTOC />
      </div>
    </header>
  )
}
