import type { ReactNode } from 'react'
import { Layout } from 'nextra-theme-docs'
import { Search } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import { CustomNavbar } from '../../theme/components/Navbar'
import { CustomFooter } from '../../theme/components/Footer'
import 'nextra-theme-docs/style.css'
import 'katex/dist/katex.min.css'

/**
 * Layout for all Nextra-managed routes (Home '/' and Codex '/codex/**').
 *
 * Wraps children in the Nextra <Layout> component, confining sidebar, ToC,
 * prose wrapper, and FlexSearch integration to catch-all routes only. The
 * root app/layout.tsx no longer contains Nextra <Layout> after this change.
 *
 * Args:
 *   children: React nodes provided by Nextra's MDX compilation pipeline.
 *
 * Returns:
 *   Nextra <Layout> wrapping children; Nextra theme config from theme/config.tsx.
 */
export default async function NextraLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug?: string[] }>
}) {
  const pageMap = await getPageMap()
  const { slug } = await params
  const isHomePage = !slug || slug.length === 0

  return (
    <Layout
      pageMap={pageMap}
      docsRepositoryBase="https://github.com/Volscente/aerarium-saturni/tree/main/frontend"
      navbar={<CustomNavbar><Search /></CustomNavbar>}
      footer={<CustomFooter />}
      darkMode
      nextThemes={{ attribute: 'class', defaultTheme: 'dark', storageKey: 'the-codex-theme' }}
      sidebar={{ defaultMenuCollapseLevel: 1, toggleButton: true }}
      copyPageButton={!isHomePage}
    >
      {children}
    </Layout>
  )
}
