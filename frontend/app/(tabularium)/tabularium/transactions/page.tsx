export const dynamic = 'force-dynamic'

import type { TransactionResponse } from '../transaction-schema'
import { TransactionTable } from '../components/TransactionTable'
import { AddTransactionButton } from '../components/AddTransactionButton'

async function fetchTransactions(): Promise<TransactionResponse[]> {
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/transactions`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export default async function TransactionsPage() {
  const transactions = await fetchTransactions()

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-roman text-3xl font-bold text-roman-gold">
          Transaction Ledger
        </h1>
        <AddTransactionButton />
      </div>
      <TransactionTable transactions={transactions} />
    </div>
  )
}
