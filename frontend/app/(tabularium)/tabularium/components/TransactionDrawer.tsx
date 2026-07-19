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
  if (!isOpen) return <></>

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div
        className="relative z-10 w-full max-w-lg bg-roman-parchment dark:bg-roman-obsidian rounded-xl shadow-2xl max-h-[90vh] flex flex-col border border-roman-stone/20"
        role="dialog"
        aria-modal="true"
        aria-label="Transaction form"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-roman-stone/40 px-6 py-4 shrink-0">
          <h2 className="font-roman text-lg font-semibold text-roman-gold">
            {transaction ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <button
            onClick={onClose}
            className="text-roman-stone hover:text-roman-terracotta transition-colors"
            aria-label="Close"
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
  )
}
