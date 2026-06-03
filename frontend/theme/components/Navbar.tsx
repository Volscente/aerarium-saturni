'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Github, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'

interface NavLink {
  label: string
  href: string
  activeFor?: string
}

const NAV_LINKS: NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Tabularium', href: '/tabularium' },
  // Codex has no /codex/index.mdx; link to the first section and mark active for the full /codex prefix
  { label: 'Codex', href: '/codex/fundamentals', activeFor: '/codex' },
  // { label: 'Providentia', href: '/providentia' },
]

/**
 * Determines whether a nav link should be styled as active.
 *
 * Uses prefix matching so child routes (e.g. /tabularium/portfolio) keep the
 * parent tab active. The Home link ('/') is matched exactly to prevent it from
 * being active on every route.
 *
 * Args:
 *   pathname: Current URL pathname returned by usePathname().
 *   href: The link's href to test against.
 *
 * Returns:
 *   true if the link should receive the active CSS class, false otherwise.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname.startsWith(href)
}

/**
 * Framework-agnostic top navigation bar.
 *
 * Iterates the module-level NAV_LINKS constant to render <Link> elements with
 * active-state styling from usePathname(). Declared as 'use client' because it
 * reads pathname at render time. Reusable in both the Nextra [[...slug]] layout
 * and the Tabularium route group layout without any Nextra page-map dependency.
 *
 * Returns:
 *   A <nav> element containing three <Link> entries (Home, Tabularium, Codex).
 *   A commented-out Providentia entry is present for future extension.
 */
export function CustomNavbar() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  useEffect(() => setMounted(true), [])

  return (
    <nav className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-roman-stone/40 bg-roman-parchment dark:bg-roman-obsidian px-6">
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2 text-roman-gold font-roman font-semibold text-lg hover:text-roman-terracotta transition-colors"
      >
        <BookOpen className="h-5 w-5 shrink-0" />
        <span className="hidden sm:inline">Aerarium Saturni — The Codex</span>
      </Link>

      <div className="flex items-center gap-6">
        {NAV_LINKS.map(({ label, href, activeFor }) => (
          <Link
            key={href}
            href={href}
            className={`text-sm font-medium transition-colors ${
              isActive(pathname, activeFor ?? href)
                ? 'text-roman-terracotta'
                : 'text-roman-stone hover:text-roman-gold'
            }`}
          >
            {label}
          </Link>
        ))}

        <a
          href="https://github.com/Volscente/aerarium-saturni"
          target="_blank"
          rel="noopener noreferrer"
          className="text-roman-stone hover:text-roman-terracotta transition-colors"
          aria-label="GitHub repository"
        >
          <Github className="h-5 w-5" />
        </a>

        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="text-roman-stone hover:text-roman-terracotta transition-colors"
            aria-label="Toggle light/dark mode"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        )}
      </div>
    </nav>
  )
}
