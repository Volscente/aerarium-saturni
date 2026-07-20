'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavLink {
  label: string
  href: string
}

const NAV_LINKS: NavLink[] = [
  { label: 'Portfolio', href: '/tabularium/portfolio' },
  { label: 'Transactions', href: '/tabularium/transactions' },
  { label: 'ETF Registry', href: '/tabularium/etf-registry' },
]

/**
 * Persistent Tabularium sub-navigation bar.
 *
 * Renders two links covering the two Tabularium sub-routes. Active state is
 * determined by prefix-matching the current pathname against each link's href,
 * consistent with the CustomNavbar pattern. Must not import from 'nextra' or
 * 'nextra/components' — the Tabularium layout has no Nextra context.
 *
 * Token reference (styles/globals.css @theme):
 *   roman-terracotta (#C0553A) — active link text + underline
 *   roman-stone      (#8B8680) — inactive link text
 *   roman-gold       (#B8860B) — inactive link hover
 *   roman-parchment  (#F5F0E8) — light-mode background
 *   roman-obsidian   (#1A1A2E) — dark-mode background
 *
 * Returns:
 *   A <nav> element with two styled anchor links.
 */
export function TabulariumSubNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-2 border-t border-roman-stone/10 px-6 py-3 text-sm">
      {NAV_LINKS.map(({ label, href }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-full px-4 py-1.5 font-medium transition-all ${
              active
                ? 'bg-roman-terracotta/15 text-roman-terracotta'
                : 'text-roman-stone hover:bg-roman-stone/10 hover:text-roman-gold'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
