'use client'

import { useEffect } from 'react'

/**
 * HomeThemeProvider
 * Forces dark mode for the home page only, overriding the user's preference.
 * This ensures the home page always displays in dark mode for design consistency.
 */
export default function HomeThemeProvider({ children }) {
  useEffect(() => {
    // Force dark mode on mount
    const root = document.documentElement
    root.classList.add('dark')
    
    // Notify RadixThemeProvider to use dark appearance
    window.dispatchEvent(new CustomEvent('theme-change', { detail: { theme: 'dark' } }))
    
    // Cleanup: restore previous theme on unmount
    return () => {
      const savedTheme = localStorage.getItem('theme') || 'light'
      if (savedTheme === 'light') {
        root.classList.remove('dark')
        window.dispatchEvent(new CustomEvent('theme-change', { detail: { theme: 'light' } }))
      }
    }
  }, [])

  return <>{children}</>
}
