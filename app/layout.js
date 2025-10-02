import { IBM_Plex_Mono } from 'next/font/google'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import '@/styles/globals.css'
import '@radix-ui/themes/styles.css'
import RadixThemeProvider from '@/components/providers/RadixThemeProvider'

const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400','500','600','700'] })

export const metadata = {
  metadataBase: new URL('https://spoke-robotics.com'),
  title: 'SPOKE ROBOTICS',
  description: 'SPOKE ROBOTICS: Open, modular robotics platform.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'SPOKE ROBOTICS',
    description: 'SPOKE ROBOTICS: Open, modular robotics platform.',
    url: '/',
    siteName: 'SPOKE ROBOTICS',
    images: [
      { url: '/og/og-image.png', width: 1200, height: 630, alt: 'SPOKE ROBOTICS' },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@spokerobotics',
    creator: '@spokerobotics',
    images: ['/og/og-image.png'],
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={ibmPlexMono.className}>
        <RadixThemeProvider>
          <div className="app-root">
            <Navbar />
            <main className="app-main">{children}</main>
            <Footer />
          </div>
        </RadixThemeProvider>
      </body>
    </html>
  )
}
