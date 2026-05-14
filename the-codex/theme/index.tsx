import type { NextraThemeLayoutProps } from 'nextra'
import DocsLayout from 'nextra-theme-docs'

/** Root layout component for the custom Nextra theme.
 *
 * Renders the full page shell: Navbar at the top, Sidebar on the left,
 * main content area (children) in the center, and Footer at the bottom.
 * All Roman palette classes are applied here via Tailwind utilities.
 *
 * @param children - The compiled MDX page content passed by Nextra.
 * @param pageOpts - Nextra page metadata (title, frontmatter, headings, etc.).
 * @param themeConfig - The resolved DocsThemeConfig from theme/config.tsx.
 * @returns A fully rendered page shell with Roman aesthetic applied.
 */
export default function Layout({ children, ...props }: NextraThemeLayoutProps) {
  return (
    <div className="bg-roman-obsidian text-roman-parchment min-h-screen font-roman">
      <DocsLayout {...props}>{children}</DocsLayout>
    </div>
  )
}
