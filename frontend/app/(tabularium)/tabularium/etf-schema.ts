import { z } from 'zod'

const ISIN_REGEX = /^[A-Z0-9]{12}$/

function isValidJson(value: string): boolean {
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

export const EtfFormSchema = z.object({
  ticker: z.string().min(1, 'Ticker is required').max(20),
  isin: z.string().regex(ISIN_REGEX, 'ISIN must be 12 alphanumeric characters'),
  name: z.string().min(1, 'Name is required').max(200),
  issuer: z.string().min(1, 'Issuer is required').max(100),
  asset_class: z.string().min(1, 'Asset class is required').max(50),
  tracked_index: z.string().min(1, 'Tracked index is required').max(200),
  ter: z.coerce.number().positive('TER must be positive'),
  domicile: z.string().min(1, 'Domicile is required').max(50),
  currency_hedged: z.boolean().default(false),
  fiscal_year_end: z.string().min(1, 'Fiscal year end is required').max(10),
  german_tax_classification: z.string().min(1, 'German tax classification is required').max(50),
  replication_strategy: z.string().min(1, 'Replication strategy is required').max(50),
  dividend_policy: z.string().min(1, 'Dividend policy is required').max(50),
  dividend_frequency: z.string().max(20).optional(),
  fund_size: z.coerce.number().positive().optional(),
  monthly_volume: z.coerce.number().positive().optional(),
  volatility_1y: z.coerce.number().min(0).optional(),
  volatility_3y: z.coerce.number().min(0).optional(),
  holdings_overview: z.string().optional(),
  geographical_distribution: z
    .string()
    .min(1, 'Geographical distribution is required')
    .refine(isValidJson, 'Must be valid JSON (e.g. {"US": 63.0, "EU": 20.0})'),
  sector_distribution: z
    .string()
    .min(1, 'Sector distribution is required')
    .refine(isValidJson, 'Must be valid JSON (e.g. {"Technology": 25.0})'),
  bond_maturities: z
    .string()
    .refine((val) => !val || isValidJson(val), 'Must be valid JSON')
    .optional(),
  bond_credit_scores: z
    .string()
    .refine((val) => !val || isValidJson(val), 'Must be valid JSON')
    .optional(),
})

export type EtfFormValues = z.infer<typeof EtfFormSchema>
