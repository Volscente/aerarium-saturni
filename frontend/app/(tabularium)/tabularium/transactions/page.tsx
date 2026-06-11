export const dynamic = 'force-dynamic'

interface TransactionResponse {
  id: string
  owner: string
  broker_platform: 'ibkr' | 'n26'
  transaction_type: 'buy' | 'sell' | 'dividend' | 'split'
  asset_class: 'stock' | 'bond' | 'etf'
  ticker: string | null
  isin: string | null
  quantity: string
  price: string | null
  currency: string
  fees: string
  transaction_date: string
  created_at: string
}

async function fetchTransactions(): Promise<TransactionResponse[]> {
  const res = await fetch(`${process.env.BACKEND_URL}/transactions`)
  if (!res.ok) throw new Error(`Failed to fetch transactions: ${res.status}`)
  return res.json()
}

export default async function TransactionsPage() {
  const transactions = await fetchTransactions()

  return (
    <div className="px-6 py-8">
      <h1 className="mb-6 font-roman text-3xl font-bold text-roman-gold">
        Transaction Ledger
      </h1>

      {transactions.length === 0 ? (
        <p className="text-roman-stone">No transactions recorded yet.</p>
      ) : (
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
                <th className="py-3 font-medium text-roman-gold">Fees</th>
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
                  <td className="py-3 pr-4 tabular-nums">{tx.quantity}</td>
                  <td className="py-3 pr-4 tabular-nums">{tx.price ?? '—'}</td>
                  <td className="py-3 pr-4">{tx.currency}</td>
                  <td className="py-3 tabular-nums">{tx.fees}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
