'use client'

import { useState, useTransition } from 'react'
import { deleteTransaction } from '../actions'
import type { TransactionResponse } from '../transaction-schema'
import { TransactionDrawer } from './TransactionDrawer'

export interface TransactionTableProps {
  transactions: TransactionResponse[]
}

export function TransactionTable({ transactions }: TransactionTableProps): JSX.Element {
  /**
   * Client-side transaction ledger table with per-row Edit and Delete actions.
   *
   * Owns `editingTransaction` state that drives the edit drawer. The Edit button
   * sets `editingTransaction` to the selected row; the drawer closes by resetting
   * it to null. The Delete button shows a confirmation dialog then calls the
   * `deleteTransaction` Server Action; errors are surfaced inline above the table.
   *
   * Args:
   *   transactions: Full transaction list passed from the Server Component; not
   *     re-fetched here.
   *
   * Returns:
   *   JSX containing the transaction table with action buttons and edit drawer.
   */
  const [editingTransaction, setEditingTransaction] = useState<TransactionResponse | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleDelete = (tx: TransactionResponse) => {
    if (
      !window.confirm(
        `Delete this ${tx.transaction_type} transaction for ${tx.ticker ?? tx.isin ?? 'unknown asset'} on ${tx.transaction_date}? This action cannot be undone.`
      )
    ) {
      return
    }
    setDeleteError(null)
    startTransition(async () => {
      const result = await deleteTransaction(tx.id)
      if ('error' in result) setDeleteError(result.error)
    })
  }

  if (transactions.length === 0) {
    return <p className="text-roman-stone">No transactions recorded yet.</p>
  }

  return (
    <>
      {deleteError && (
        <p className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {deleteError}
        </p>
      )}

      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm text-roman-stone">
          <thead>
            <tr className="border-b border-roman-stone/30 text-left">
              <th className="py-3 pr-4 font-medium text-roman-gold">Date</th>
              <th className="py-3 pr-4 font-medium text-roman-gold">Owner</th>
              <th className="py-3 pr-4 font-medium text-roman-gold">Broker</th>
              <th className="py-3 pr-4 font-medium text-roman-gold">Type</th>
              <th className="py-3 pr-4 font-medium text-roman-gold">Asset Class</th>
              <th className="py-3 pr-4 font-medium text-roman-gold">Ticker</th>
              <th className="py-3 pr-4 font-medium text-roman-gold">ISIN</th>
              <th className="py-3 pr-4 font-medium text-roman-gold">Quantity</th>
              <th className="py-3 pr-4 font-medium text-roman-gold">Price</th>
              <th className="py-3 pr-4 font-medium text-roman-gold">Currency</th>
              <th className="py-3 pr-4 font-medium text-roman-gold">Fees</th>
              <th className="py-3 font-medium text-roman-gold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr
                key={tx.id}
                className="border-b border-roman-stone/20 hover:bg-roman-stone/5 transition-colors"
              >
                <td className="py-3 pr-4">{tx.transaction_date}</td>
                <td className="py-3 pr-4">{tx.owner}</td>
                <td className="py-3 pr-4 uppercase">{tx.broker_platform}</td>
                <td className="py-3 pr-4 capitalize">{tx.transaction_type}</td>
                <td className="py-3 pr-4 capitalize">{tx.asset_class}</td>
                <td className="py-3 pr-4">{tx.ticker ?? '—'}</td>
                <td className="py-3 pr-4 font-mono">{tx.isin ?? '—'}</td>
                <td className="py-3 pr-4 tabular-nums">{tx.quantity ?? '—'}</td>
                <td className="py-3 pr-4 tabular-nums">{tx.price ?? '—'}</td>
                <td className="py-3 pr-4">{tx.currency}</td>
                <td className="py-3 pr-4 tabular-nums">{tx.fees}</td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingTransaction(tx)}
                      className="rounded border border-roman-stone/30 px-2 py-1 text-xs text-roman-stone hover:border-roman-gold/50 hover:text-roman-gold transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(tx)}
                      disabled={isPending}
                      className="rounded border border-roman-stone/30 px-2 py-1 text-xs text-roman-stone hover:border-roman-terracotta hover:text-roman-terracotta transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit drawer — key forces remount when editing a different transaction */}
      <TransactionDrawer
        key={editingTransaction?.id ?? 'none'}
        isOpen={!!editingTransaction}
        onClose={() => setEditingTransaction(null)}
        transaction={editingTransaction}
      />
    </>
  )
}
