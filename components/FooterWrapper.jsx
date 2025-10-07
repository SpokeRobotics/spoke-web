'use client'

import { usePathname } from 'next/navigation'
import { Footer } from './Footer'

export function FooterWrapper() {
  const pathname = usePathname()
  
  // Hide footer on home page, confirmation page, and connect page
  const hideFooter = pathname === '/' || pathname === '/confirmation' || pathname === '/confirmation/' || pathname === '/connect' || pathname === '/connect/'
  
  if (hideFooter) {
    return null
  }
  
  return <Footer />
}
