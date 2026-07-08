'use client'

import { X } from 'lucide-react'
import type { TransactionResponse } from '../transaction-schema'
import { TransactionForm } from './TransactionForm'

export interface TransactionDrawerProps {
  isOpen: boolean
  onClose: () => void
  transaction?: TransactionResponse | null
}

export function TransactionDrawer({ isOpen, onClose, transaction }: TransactionDrawerProps): JSX.Element {
  /**
   * Right-side slide-in panel housing `TransactionForm`.
   *
   * Uses `transition-transform duration-300` with `translate-x-0` when open and
   * `translate-x-full` when closed. Fixed positioning (`fixed inset-y-0 right-0
   * z-50 w-96`) keeps it above page content on all sub-routes. A semi-transparent
   * backdrop (`fixed inset-0 bg-black/40 z-40`) is rendered when `isOpen` is true;
   * clicking it calls `onClose`. Passes `onSuccess={onClose}` to `TransactionForm`.
   * Title toggles between "Add Transaction" (create mode) and "Edit Transaction"
   * (edit mode) based on the transaction prop.
   *
   * Args:
   *   isOpen: Whether the drawer is in the visible (translate-x-0) position.
   *   onClose: Callback to close the drawer.
   *   transaction: Optional existing transaction; when provided, TransactionForm
   *     operates in edit mode pre-populated with the transaction's values.
   *
   * Returns:
   *   JSX containing the drawer panel and conditional backdrop overlay.
   */
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-96 bg-roman-parchment dark:bg-roman-obsidian border-l border-roman-stone/40 shadow-xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="Transaction input drawer"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-roman-stone/40 px-6 py-4 shrink-0">
            <h2 className="font-roman text-lg font-semibold text-roman-gold">
              {transaction ? 'Edit Transaction' : 'Add Transaction'}
            </h2>
            <button
              onClick={onClose}
              className="text-roman-stone hover:text-roman-terracotta transition-colors"
              aria-label="Close drawer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable form area */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <TransactionForm transaction={transaction ?? undefined} onSuccess={onClose} />
          </div>
        </div>
      </div>
    </>
  )
}
