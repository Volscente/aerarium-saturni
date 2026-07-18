'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { TransactionDrawer } from './TransactionDrawer'

export function AddTransactionButton(): JSX.Element {
  /**
   * Trigger button that controls the transaction input drawer.
   *
   * Manages `isDrawerOpen` boolean state locally. Renders a `+ Add Transaction`
   * button (Lucide `Plus` icon, roman-* Tailwind tokens) and a `TransactionDrawer`
   * that receives `isOpen` and `onClose` props. Mounted directly in the Tabularium
   * layout so it remains visible across all sub-routes without prop-drilling.
   *
   * Returns:
   *   JSX containing the trigger button and `TransactionDrawer`, always mounted.
   */
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsDrawerOpen(true)}
        className="flex items-center gap-2 rounded-full border border-roman-gold/40 bg-roman-gold/10 px-5 py-2 text-sm font-medium text-roman-gold hover:bg-roman-gold/20 hover:border-roman-gold/70 transition-all"
        aria-label="Open add transaction drawer"
      >
        <Plus className="h-4 w-4" />
        Add Transaction
      </button>
      <TransactionDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </>
  )
}
