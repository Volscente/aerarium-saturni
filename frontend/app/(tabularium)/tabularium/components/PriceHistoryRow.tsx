'use client'

import { useState, useTransition } from 'react'
import { updatePriceSnapshot, deletePriceSnapshot } from '../etf-actions'
import type { EtfPriceEntry } from '../etf-actions'

export interface PriceHistoryRowProps {
  etfId: string
  entry: EtfPriceEntry
  onChanged: () => void
}

export function PriceHistoryRow({
  etfId,
  entry,
  onChanged,
}: PriceHistoryRowProps): JSX.Element {
  /**
   * Single price-history row with inline edit and delete.
   *
   * Renders as a static row by default; clicking Edit swaps it for an inline
   * form (date, price, currency) pre-filled from entry, mirroring
   * PriceUpdateButton's add-form fields. On Save, calls the
   * updatePriceSnapshot Server Action; on Delete (after window.confirm),
   * calls deletePriceSnapshot. Either action calls onChanged on success so
   * the owning EtfRegistryTable can re-fetch this ETF's price history —
   * priceHistoryMap is a client-side cache with no cache tag of its own, so
   * it does not pick up revalidateTag('etfs') automatically.
   *
   * Args:
   *   etfId: UUID of the parent ETF.
   *   entry: The price snapshot this row renders.
   *   onChanged: Called after a successful update or delete.
   *
   * Returns:
   *   JSX: either the static row or the inline edit-form row.
   */
  const [isEditing, setIsEditing] = useState(false)
  const [price, setPrice] = useState(entry.price)
  const [currency, setCurrency] = useState(entry.currency)
  const [date, setDate] = useState(entry.timestamp.split('T')[0])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const dt = new Date(entry.timestamp)
  const day = String(dt.getDate()).padStart(2, '0')
  const month = String(dt.getMonth() + 1).padStart(2, '0')
  const year = dt.getFullYear()

  const handleEdit = () => {
    setPrice(entry.price)
    setCurrency(entry.currency)
    setDate(entry.timestamp.split('T')[0])
    setError(null)
    setIsEditing(true)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setError(null)
  }

  const handleSave = () => {
    const priceNum = parseFloat(price)
    if (!priceNum || priceNum <= 0) {
      setError('Price must be positive')
      return
    }
    if (currency.length !== 3) {
      setError('Currency must be 3 characters')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await updatePriceSnapshot(
        etfId,
        entry.id,
        priceNum,
        currency,
        new Date(date).toISOString()
      )
      if ('error' in result) {
        setError(result.error)
      } else {
        setIsEditing(false)
        onChanged()
      }
    })
  }

  const handleDelete = () => {
    if (
      !window.confirm(
        `Delete the ${entry.currency} ${parseFloat(entry.price).toFixed(4)} price entry from ${day}.${month}.${year}?`
      )
    ) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await deletePriceSnapshot(etfId, entry.id)
      if ('error' in result) {
        setError(result.error)
      } else {
        onChanged()
      }
    })
  }

  if (isEditing) {
    return (
      <tr className="border-b border-roman-stone/10">
        <td className="py-1.5 pr-6" colSpan={2}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded border border-roman-stone/40 bg-transparent px-2 py-1 text-xs text-roman-stone focus:border-roman-gold focus:outline-none dark:text-roman-parchment"
          />
        </td>
        <td className="py-1.5 pr-6">
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            step="0.0001"
            min="0.0001"
            className="w-full rounded border border-roman-stone/40 bg-transparent px-2 py-1 text-xs text-roman-stone focus:border-roman-gold focus:outline-none dark:text-roman-parchment"
          />
        </td>
        <td className="py-1.5 pr-6">
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
            className="w-14 rounded border border-roman-stone/40 bg-transparent px-2 py-1 text-xs text-roman-stone focus:border-roman-gold focus:outline-none dark:text-roman-parchment"
          />
        </td>
        <td className="py-1.5">
          <div className="flex gap-1">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded border border-roman-gold/50 bg-roman-gold/10 px-2 py-1 text-xs text-roman-gold hover:bg-roman-gold/20 transition-colors disabled:opacity-50"
            >
              {isPending ? '…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="rounded border border-roman-stone/30 px-2 py-1 text-xs text-roman-stone hover:border-roman-terracotta hover:text-roman-terracotta transition-colors"
            >
              Cancel
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-roman-stone/10">
      <td className="py-1.5 pr-6 tabular-nums">{`${day}.${month}.${year}`}</td>
      <td className="py-1.5 pr-6 tabular-nums">{dt.toLocaleTimeString()}</td>
      <td className="py-1.5 pr-6 tabular-nums font-mono">
        {parseFloat(entry.price).toFixed(4)}
      </td>
      <td className="py-1.5 pr-6 font-mono">{entry.currency}</td>
      <td className="py-1.5">
        <div className="flex gap-1">
          <button
            onClick={handleEdit}
            className="rounded border border-roman-stone/30 px-2 py-0.5 text-xs text-roman-stone hover:border-roman-gold/50 hover:text-roman-gold transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="rounded border border-roman-stone/30 px-2 py-0.5 text-xs text-roman-stone hover:border-roman-terracotta hover:text-roman-terracotta transition-colors disabled:opacity-50"
          >
            Delete
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </td>
    </tr>
  )
}
