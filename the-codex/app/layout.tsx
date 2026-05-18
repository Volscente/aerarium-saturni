import type { ReactNode } from 'react'
import { Layout, Navbar, Footer } from 'nextra-theme-docs'
import { getPageMap } from 'nextra/page-map'
import { CustomNavbar } from '../theme/components/Navbar'
import { CustomFooter } from '../theme/components/Footer'
import 'nextra-theme-docs/style.css'
import 'katex/dist/katex.min.css'
import '../styles/globals.css'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pageMap = await getPageMap()

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Layout
          pageMap={pageMap}
          docsRepositoryBase="https://github.com/Volscente/aerarium-saturni/tree/main/the-codex"
          navbar={<CustomNavbar />}
          footer={<CustomFooter />}
          darkMode
          nextThemes={{ defaultTheme: 'dark', storageKey: 'the-codex-theme' }}
          sidebar={{ defaultMenuCollapseLevel: 1, toggleButton: true }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
