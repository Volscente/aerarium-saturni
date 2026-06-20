'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { EtfDrawer } from './EtfDrawer'

export function AddEtfButton(): JSX.Element {
  /**
   * Trigger button that controls the ETF create drawer.
   *
   * Manages isDrawerOpen boolean state locally. Renders a "+ Add ETF" button
   * (Lucide Plus icon, roman-* Tailwind tokens) and an EtfDrawer in create
   * mode (no etf prop). Mounted inside portfolio/page.tsx — not in the layout —
   * so it only appears on the ETF registry view.
   *
   * Returns:
   *   JSX containing the trigger button and EtfDrawer, always mounted.
   */
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsDrawerOpen(true)}
        className="flex items-center gap-2 rounded border border-roman-gold/50 bg-roman-gold/10 px-4 py-2 text-sm font-medium text-roman-gold hover:bg-roman-gold/20 transition-colors"
        aria-label="Open add ETF drawer"
      >
        <Plus className="h-4 w-4" />
        Add ETF
      </button>
      <EtfDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  )
}
