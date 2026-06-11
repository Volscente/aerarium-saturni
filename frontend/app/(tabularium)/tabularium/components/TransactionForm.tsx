'use client'

import { useState, useTransition } from 'react'
import { createTransaction } from '../actions'
import { TransactionFormSchema } from '../transaction-schema'

type TransactionType = 'buy' | 'sell' | 'dividend' | 'split'
type BrokerPlatform = 'ibkr' | 'n26'
type AssetClass = 'stock' | 'bond' | 'etf'

export interface TransactionFormProps {
  onSuccess: () => void
}

const inputClass =
  'w-full rounded border border-roman-stone/40 bg-transparent px-3 py-2 text-sm text-roman-stone placeholder:text-roman-stone/50 focus:border-roman-gold focus:outline-none transition-colors dark:text-roman-parchment'

const selectClass =
  'w-full rounded border border-roman-stone/40 bg-roman-parchment px-3 py-2 text-sm text-roman-stone focus:border-roman-gold focus:outline-none transition-colors dark:bg-roman-obsidian dark:text-roman-parchment'

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-roman-stone mb-1">
      {children}
    </label>
  )
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null
  return <p className="mt-1 text-xs text-red-500">{errors[0]}</p>
}

export function TransactionForm({ onSuccess }: TransactionFormProps): JSX.Element {
  /**
   * Dynamic transaction entry form with context-sensitive field visibility.
   *
   * Maintains controlled state for `transactionType` and `assetClass`. Renders
   * fields per the visibility matrix below. On submit, validates against
   * `TransactionFormSchema` (Zod) and calls `createTransaction`; on success
   * calls `onSuccess()` to close the drawer. Inline error messages are rendered
   * below each field using Zod issue messages.
   *
   * Field visibility matrix:
   *   All types:  owner, broker_platform, transaction_type, asset_class, currency, ticker?, isin?, transaction_date (always shown)
   *   Buy / Sell: quantity, price, fees (required)
   *   Dividend:   price (label: "Amount per share") (required); quantity? (optional)
   *   Split:      ratio (label: "Ratio e.g. 4:1") (required)
   *
   * Args:
   *   onSuccess: Callback invoked when the Server Action returns `{ success: true }`.
   *
   * Returns:
   *   JSX containing the form with dynamic field set and inline validation errors.
   */
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const [transactionType, setTransactionType] = useState<TransactionType>('buy')
  const [owner, setOwner] = useState('')
  const [brokerPlatform, setBrokerPlatform] = useState<BrokerPlatform>('ibkr')
  const [assetClass, setAssetClass] = useState<AssetClass>('stock')
  const [currency, setCurrency] = useState('')
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [ticker, setTicker] = useState('')
  const [isin, setIsin] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [fees, setFees] = useState('')
  const [ratio, setRatio] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const rawData: Record<string, unknown> = {
      owner,
      broker_platform: brokerPlatform,
      transaction_type: transactionType,
      asset_class: assetClass,
      currency,
      transaction_date: transactionDate,
      ticker: ticker || undefined,
      isin: isin || undefined,
      fees: fees !== '' ? fees : '0',
    }

    if (transactionType === 'buy' || transactionType === 'sell') {
      if (quantity !== '') rawData.quantity = quantity
      if (price !== '') rawData.price = price
    } else if (transactionType === 'dividend') {
      if (price !== '') rawData.price = price
      if (quantity !== '') rawData.quantity = quantity
    } else if (transactionType === 'split') {
      rawData.ratio = ratio
    }

    const result = TransactionFormSchema.safeParse(rawData)

    if (!result.success) {
      const errs: Record<string, string[]> = {}
      for (const issue of result.error.issues) {
        const path = issue.path[0]?.toString()
        if (path) {
          if (!errs[path]) errs[path] = []
          errs[path].push(issue.message)
        }
      }
      setFieldErrors(errs)
      return
    }

    setFieldErrors({})
    setServerError(null)

    startTransition(async () => {
      const response = await createTransaction(result.data)
      if ('error' in response) {
        setServerError(response.error)
      } else {
        onSuccess()
      }
    })
  }

  const showQuantityRequired = transactionType === 'buy' || transactionType === 'sell'
  const showQuantityOptional = transactionType === 'dividend'
  const showPrice =
    transactionType === 'buy' || transactionType === 'sell' || transactionType === 'dividend'
  const showFees = transactionType === 'buy' || transactionType === 'sell'
  const showRatio = transactionType === 'split'
  const priceLabel = transactionType === 'dividend' ? 'Amount per Share' : 'Price per Unit'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Transaction Type */}
      <div>
        <Label htmlFor="transaction_type">Transaction Type</Label>
        <select
          id="transaction_type"
          value={transactionType}
          onChange={(e) => setTransactionType(e.target.value as TransactionType)}
          className={selectClass}
        >
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
          <option value="dividend">Dividend</option>
          <option value="split">Split</option>
        </select>
        <FieldError errors={fieldErrors.transaction_type} />
      </div>

      {/* Owner */}
      <div>
        <Label htmlFor="owner">Owner</Label>
        <input
          id="owner"
          type="text"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="e.g. simone"
          className={inputClass}
        />
        <FieldError errors={fieldErrors.owner} />
      </div>

      {/* Broker Platform */}
      <div>
        <Label htmlFor="broker_platform">Broker Platform</Label>
        <select
          id="broker_platform"
          value={brokerPlatform}
          onChange={(e) => setBrokerPlatform(e.target.value as BrokerPlatform)}
          className={selectClass}
        >
          <option value="ibkr">IBKR</option>
          <option value="n26">N26</option>
        </select>
        <FieldError errors={fieldErrors.broker_platform} />
      </div>

      {/* Asset Class */}
      <div>
        <Label htmlFor="asset_class">Asset Class</Label>
        <select
          id="asset_class"
          value={assetClass}
          onChange={(e) => setAssetClass(e.target.value as AssetClass)}
          className={selectClass}
        >
          <option value="stock">Stock</option>
          <option value="bond">Bond</option>
          <option value="etf">ETF</option>
        </select>
        <FieldError errors={fieldErrors.asset_class} />
      </div>

      {/* Currency */}
      <div>
        <Label htmlFor="currency">Currency (ISO 4217)</Label>
        <input
          id="currency"
          type="text"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          placeholder="e.g. USD"
          maxLength={3}
          className={inputClass}
        />
        <FieldError errors={fieldErrors.currency} />
      </div>

      {/* Transaction Date */}
      <div>
        <Label htmlFor="transaction_date">Transaction Date</Label>
        <input
          id="transaction_date"
          type="date"
          value={transactionDate}
          onChange={(e) => setTransactionDate(e.target.value)}
          className={inputClass}
        />
        <FieldError errors={fieldErrors.transaction_date} />
      </div>

      {/* Ticker (optional) */}
      <div>
        <Label htmlFor="ticker">Ticker (optional)</Label>
        <input
          id="ticker"
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="e.g. AAPL"
          maxLength={20}
          className={inputClass}
        />
        <FieldError errors={fieldErrors.ticker} />
      </div>

      {/* ISIN (optional) */}
      <div>
        <Label htmlFor="isin">ISIN (optional)</Label>
        <input
          id="isin"
          type="text"
          value={isin}
          onChange={(e) => setIsin(e.target.value.toUpperCase())}
          placeholder="e.g. US0378331005"
          maxLength={12}
          className={inputClass}
        />
        <FieldError errors={fieldErrors.isin} />
      </div>

      {/* Quantity — required for Buy/Sell */}
      {showQuantityRequired && (
        <div>
          <Label htmlFor="quantity">Quantity</Label>
          <input
            id="quantity"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 10.5"
            step="0.0001"
            min="0.0001"
            className={inputClass}
          />
          <FieldError errors={fieldErrors.quantity} />
        </div>
      )}

      {/* Quantity — optional for Dividend */}
      {showQuantityOptional && (
        <div>
          <Label htmlFor="quantity">Quantity (optional)</Label>
          <input
            id="quantity"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 10.5"
            step="0.0001"
            min="0.0001"
            className={inputClass}
          />
          <FieldError errors={fieldErrors.quantity} />
        </div>
      )}

      {/* Price / Amount per Share */}
      {showPrice && (
        <div>
          <Label htmlFor="price">{priceLabel}</Label>
          <input
            id="price"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 175.00"
            step="0.0001"
            min="0.0001"
            className={inputClass}
          />
          <FieldError errors={fieldErrors.price} />
        </div>
      )}

      {/* Fees — Buy/Sell only */}
      {showFees && (
        <div>
          <Label htmlFor="fees">Fees</Label>
          <input
            id="fees"
            type="number"
            value={fees}
            onChange={(e) => setFees(e.target.value)}
            placeholder="0.00"
            step="0.0001"
            min="0"
            className={inputClass}
          />
          <FieldError errors={fieldErrors.fees} />
        </div>
      )}

      {/* Ratio — Split only */}
      {showRatio && (
        <div>
          <Label htmlFor="ratio">Ratio (e.g. 4:1)</Label>
          <input
            id="ratio"
            type="text"
            value={ratio}
            onChange={(e) => setRatio(e.target.value)}
            placeholder="e.g. 4:1"
            className={inputClass}
          />
          <FieldError errors={fieldErrors.ratio} />
        </div>
      )}

      {/* Server error */}
      {serverError && (
        <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {serverError}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded border border-roman-gold/50 bg-roman-gold/10 px-4 py-2 text-sm font-medium text-roman-gold hover:bg-roman-gold/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Saving…' : 'Save Transaction'}
      </button>
    </form>
  )
}
