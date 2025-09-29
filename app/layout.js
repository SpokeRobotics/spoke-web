import { IBM_Plex_Mono } from 'next/font/google'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import '@/styles/globals.css'
import '@radix-ui/themes/styles.css'
import RadixThemeProvider from '@/components/providers/RadixThemeProvider'
import OcWorkerBootstrap from '@/components/cad/OcWorkerBootstrap'

const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400','500','600','700'] })

export const metadata = {
  title: 'SPOKE',
  description: 'SPOKE site',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={ibmPlexMono.className}>
        <RadixThemeProvider>
          <div className="app-root">
            {/** Start the OC Worker at app start so it is available across pages */}
            <OcWorkerBootstrap />
            <Navbar />
            <main className="app-main">{children}</main>
            <Footer />
          </div>
        </RadixThemeProvider>
      </body>
    </html>
  )
}
