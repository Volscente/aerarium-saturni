import { z } from 'zod'

export interface TransactionResponse {
  id: string
  owner: string
  broker_platform: 'ibkr' | 'n26'
  transaction_type: 'buy' | 'sell' | 'dividend' | 'split'
  asset_class: 'stock' | 'bond' | 'etf'
  ticker: string | null
  isin: string | null
  quantity: string | null
  price: string | null
  currency: string
  fees: string
  ratio: string | null
  transaction_date: string
  created_at: string
}

const ISIN_REGEX = /^[A-Z0-9]{12}$/

export const TransactionFormSchema = z.object({
  owner: z.string().min(1, 'Owner is required'),
  broker_platform: z.enum(['ibkr', 'n26']),
  transaction_type: z.enum(['buy', 'sell', 'dividend', 'split']),
  asset_class: z.enum(['stock', 'bond', 'etf']),
  ticker: z.string().max(20).optional(),
  isin: z.string().regex(ISIN_REGEX, 'ISIN must be 12 alphanumeric characters').optional(),
  quantity: z.coerce.number().positive('Quantity must be positive').optional(),
  price: z.coerce.number().positive('Price must be positive').optional(),
  currency: z.string().length(3, 'Currency must be a 3-character ISO 4217 code'),
  fees: z.coerce.number().min(0).default(0),
  ratio: z.string().regex(/^\d+:\d+$/, 'Ratio must be in N:M format (e.g. 4:1)').optional(),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
})

export type TransactionFormValues = z.infer<typeof TransactionFormSchema>
