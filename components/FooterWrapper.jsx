'use client'

import { usePathname } from 'next/navigation'
import { Footer } from './Footer'

export function FooterWrapper() {
  const pathname = usePathname()
  
  // Hide footer on home page and confirmation page
  const hideFooter = pathname === '/' || pathname === '/confirmation' || pathname === '/confirmation/'
  
  if (hideFooter) {
    return null
  }
  
  return <Footer />
}
