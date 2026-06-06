import type { ReactNode } from 'react'
import { CustomNavbar } from '../../../theme/components/Navbar'
import { CustomFooter } from '../../../theme/components/Footer'

/**
 * Layout shell for all Tabularium routes (/tabularium and /tabularium/**).
 *
 * Renders CustomNavbar and CustomFooter with a full-width <main> content area
 * and zero Nextra chrome. Composable: future dashboard sub-pages slot in as
 * children without revisiting the routing architecture. Reuses roman-* Tailwind
 * tokens from styles/globals.css for visual continuity across pillars.
 *
 * Args:
 *   children: React nodes for the active Tabularium sub-route page.
 *
 * Returns:
 *   Full-page shell: CustomNavbar at top, <main> flex-grow content, CustomFooter at bottom.
 */
export default function TabulariumLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <CustomNavbar />
      <main className="flex-1">{children}</main>
      <CustomFooter />
    </div>
  )
}
