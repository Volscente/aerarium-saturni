'use client'

import { useState, useTransition } from 'react'
import { addPriceSnapshot } from '../etf-actions'

export interface PriceUpdateButtonProps {
  etfId: string
}

export function PriceUpdateButton({ etfId }: PriceUpdateButtonProps): JSX.Element {
  /**
   * Per-row inline price snapshot trigger.
   *
   * Renders a "Price" button that toggles an inline form with price, currency,
   * and timestamp fields. On submit, calls the addPriceSnapshot Server Action.
   * Collapses back to the button on success or when Cancel is clicked.
   *
   * Args:
   *   etfId: UUID of the ETF to record a price snapshot for.
   *
   * Returns:
   *   JSX: either the trigger button or the inline price form.
   */
  const [isOpen, setIsOpen] = useState(false)
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleClose = () => {
    setIsOpen(false)
    setPrice('')
    setError(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const priceNum = parseFloat(price)
    if (!priceNum || priceNum <= 0) {
      setError('Price must be positive')
      return
    }
    if (currency.length !== 3) {
      setError('Currency must be 3 characters')
      return
    }
    startTransition(async () => {
      const result = await addPriceSnapshot(
        etfId,
        priceNum,
        currency,
        new Date(date).toISOString()
      )
      if ('error' in result) {
        setError(result.error)
      } else {
        handleClose()
      }
    })
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="rounded border border-roman-stone/30 px-2 py-1 text-xs text-roman-stone hover:border-roman-gold/50 hover:text-roman-gold transition-colors"
      >
        Price
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1 min-w-[160px]">
      <input
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Price"
        step="0.0001"
        min="0.0001"
        className="rounded border border-roman-stone/40 bg-transparent px-2 py-1 text-xs text-roman-stone focus:border-roman-gold focus:outline-none dark:text-roman-parchment"
      />
      <div className="flex gap-1">
        <input
          type="text"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          maxLength={3}
          placeholder="EUR"
          className="w-14 rounded border border-roman-stone/40 bg-transparent px-2 py-1 text-xs text-roman-stone focus:border-roman-gold focus:outline-none dark:text-roman-parchment"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 rounded border border-roman-stone/40 bg-transparent px-2 py-1 text-xs text-roman-stone focus:border-roman-gold focus:outline-none dark:text-roman-parchment"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded border border-roman-gold/50 bg-roman-gold/10 px-2 py-1 text-xs text-roman-gold hover:bg-roman-gold/20 transition-colors disabled:opacity-50"
        >
          {isPending ? '…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="flex-1 rounded border border-roman-stone/30 px-2 py-1 text-xs text-roman-stone hover:border-roman-terracotta hover:text-roman-terracotta transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
