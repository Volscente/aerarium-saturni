'use client'

import { X } from 'lucide-react'
import { EtfForm, type EtfResponse } from './EtfForm'

export interface EtfDrawerProps {
  isOpen: boolean
  onClose: () => void
  etf?: EtfResponse | null
}

export function EtfDrawer({ isOpen, onClose, etf }: EtfDrawerProps): JSX.Element {
  /**
   * Right-side slide-in panel housing EtfForm.
   *
   * Mirrors TransactionDrawer. Uses translate-x-full / translate-x-0 transition.
   * Fixed positioning keeps it above page content. Title changes between
   * "Add ETF" (create mode) and "Edit ETF" (edit mode) based on etf prop.
   * Passes onSuccess={onClose} to EtfForm so the drawer closes on save.
   *
   * Args:
   *   isOpen: Whether the drawer is in the visible (translate-x-0) position.
   *   onClose: Callback to close the drawer.
   *   etf: Optional existing ETF; when provided, EtfForm operates in edit mode.
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
        className={`fixed inset-y-0 right-0 z-50 w-[28rem] bg-roman-parchment dark:bg-roman-obsidian border-l border-roman-stone/40 shadow-xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="ETF input drawer"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-roman-stone/40 px-6 py-4 shrink-0">
            <h2 className="font-roman text-lg font-semibold text-roman-gold">
              {etf ? 'Edit ETF' : 'Add ETF'}
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
            <EtfForm etf={etf ?? undefined} onSuccess={onClose} />
          </div>
        </div>
      </div>
    </>
  )
}
