'use client'

import { useState, useTransition } from 'react'
import { createEtf, updateEtf } from '../etf-actions'
import { EtfFormSchema } from '../etf-schema'

export interface EtfResponse {
  id: string
  ticker: string
  isin: string
  name: string
  issuer: string
  asset_class: string
  tracked_index: string
  ter: string
  domicile: string
  currency_hedged: boolean
  fiscal_year_end: string
  german_tax_classification: string
  replication_strategy: string
  dividend_policy: string
  dividend_frequency: string | null
  fund_size: string | null
  monthly_volume: string | null
  volatility_1y: string | null
  volatility_3y: string | null
  holdings_overview: string | null
  geographical_distribution: Record<string, number>
  sector_distribution: Record<string, number>
  bond_maturities: Record<string, number> | null
  bond_credit_scores: Record<string, number> | null
  created_at: string
}

export interface EtfFormProps {
  onSuccess: () => void
  etf?: EtfResponse
}

interface FormState {
  ticker: string
  isin: string
  name: string
  issuer: string
  asset_class: string
  tracked_index: string
  ter: string
  domicile: string
  currency_hedged: boolean
  fiscal_year_end: string
  german_tax_classification: string
  replication_strategy: string
  dividend_policy: string
  dividend_frequency: string
  fund_size: string
  monthly_volume: string
  volatility_1y: string
  volatility_3y: string
  holdings_overview: string
  geographical_distribution: string
  sector_distribution: string
  bond_maturities: string
  bond_credit_scores: string
}

function initialState(etf?: EtfResponse): FormState {
  if (etf) {
    return {
      ticker: etf.ticker,
      isin: etf.isin,
      name: etf.name,
      issuer: etf.issuer,
      asset_class: etf.asset_class,
      tracked_index: etf.tracked_index,
      ter: etf.ter,
      domicile: etf.domicile,
      currency_hedged: etf.currency_hedged,
      fiscal_year_end: etf.fiscal_year_end,
      german_tax_classification: etf.german_tax_classification,
      replication_strategy: etf.replication_strategy,
      dividend_policy: etf.dividend_policy,
      dividend_frequency: etf.dividend_frequency ?? '',
      fund_size: etf.fund_size ?? '',
      monthly_volume: etf.monthly_volume ?? '',
      volatility_1y: etf.volatility_1y ?? '',
      volatility_3y: etf.volatility_3y ?? '',
      holdings_overview: etf.holdings_overview ?? '',
      geographical_distribution: JSON.stringify(etf.geographical_distribution, null, 2),
      sector_distribution: JSON.stringify(etf.sector_distribution, null, 2),
      bond_maturities: etf.bond_maturities
        ? JSON.stringify(etf.bond_maturities, null, 2)
        : '',
      bond_credit_scores: etf.bond_credit_scores
        ? JSON.stringify(etf.bond_credit_scores, null, 2)
        : '',
    }
  }
  return {
    ticker: '',
    isin: '',
    name: '',
    issuer: '',
    asset_class: 'Equities',
    tracked_index: '',
    ter: '',
    domicile: '',
    currency_hedged: false,
    fiscal_year_end: '',
    german_tax_classification: '',
    replication_strategy: '',
    dividend_policy: 'Accumulating',
    dividend_frequency: '',
    fund_size: '',
    monthly_volume: '',
    volatility_1y: '',
    volatility_3y: '',
    holdings_overview: '',
    geographical_distribution: '',
    sector_distribution: '',
    bond_maturities: '',
    bond_credit_scores: '',
  }
}

const inputClass =
  'w-full rounded border border-roman-stone/40 bg-transparent px-3 py-2 text-sm text-roman-stone placeholder:text-roman-stone/50 focus:border-roman-gold focus:outline-none transition-colors dark:text-roman-parchment'

const selectClass =
  'w-full rounded border border-roman-stone/40 bg-roman-parchment px-3 py-2 text-sm text-roman-stone focus:border-roman-gold focus:outline-none transition-colors dark:bg-roman-obsidian dark:text-roman-parchment'

const textareaClass =
  'w-full rounded border border-roman-stone/40 bg-transparent px-3 py-2 text-sm text-roman-stone placeholder:text-roman-stone/50 focus:border-roman-gold focus:outline-none transition-colors dark:text-roman-parchment font-mono resize-y'

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

export function EtfForm({ onSuccess, etf }: EtfFormProps): JSX.Element {
  /**
   * ETF create/edit form with asset-class-conditional field visibility.
   *
   * Maintains a single formState object. Field visibility matrix:
   *   Always:    all required scalar fields, geographical/sector distribution
   *   Equities:  fund_size, monthly_volume, volatility_1y, volatility_3y
   *   Bonds:     bond_maturities, bond_credit_scores
   *
   * When `etf` prop is provided, operates in edit mode — pre-populates fields
   * and calls updateEtf on submit. Otherwise creates a new ETF via createEtf.
   *
   * Args:
   *   onSuccess: Callback invoked when the Server Action returns { success: true }.
   *   etf: Optional existing ETF for edit mode; initializes form fields from it.
   *
   * Returns:
   *   JSX containing the form with dynamic field set and inline validation errors.
   */
  const [formState, setFormState] = useState<FormState>(() => initialState(etf))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const set =
    (field: keyof FormState) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) =>
      setFormState((prev) => ({ ...prev, [field]: e.target.value }))

  const setChecked =
    (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setFormState((prev) => ({ ...prev, [field]: e.target.checked }))

  const isEquities = formState.asset_class === 'Equities'
  const isBonds = formState.asset_class === 'Bonds'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const rawData: Record<string, unknown> = { ...formState }
    if (formState.dividend_frequency === '') delete rawData.dividend_frequency
    if (formState.fund_size === '') delete rawData.fund_size
    if (formState.monthly_volume === '') delete rawData.monthly_volume
    if (formState.volatility_1y === '') delete rawData.volatility_1y
    if (formState.volatility_3y === '') delete rawData.volatility_3y
    if (formState.holdings_overview === '') delete rawData.holdings_overview
    if (formState.bond_maturities === '') delete rawData.bond_maturities
    if (formState.bond_credit_scores === '') delete rawData.bond_credit_scores

    const result = EtfFormSchema.safeParse(rawData)
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
      const response = etf
        ? await updateEtf(etf.id, result.data)
        : await createEtf(result.data)
      if ('error' in response) {
        setServerError(response.error)
      } else {
        onSuccess()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Ticker */}
      <div>
        <Label htmlFor="ticker">Ticker</Label>
        <input
          id="ticker"
          type="text"
          value={formState.ticker}
          onChange={(e) =>
            setFormState((prev) => ({
              ...prev,
              ticker: e.target.value.toUpperCase(),
            }))
          }
          placeholder="e.g. VWCE"
          maxLength={20}
          className={inputClass}
        />
        <FieldError errors={fieldErrors.ticker} />
      </div>

      {/* ISIN */}
      <div>
        <Label htmlFor="isin">ISIN</Label>
        <input
          id="isin"
          type="text"
          value={formState.isin}
          onChange={(e) =>
            setFormState((prev) => ({
              ...prev,
              isin: e.target.value.toUpperCase(),
            }))
          }
          placeholder="e.g. IE00B3RBWM25"
          maxLength={12}
          className={inputClass}
        />
        <FieldError errors={fieldErrors.isin} />
      </div>

      {/* Name */}
      <div>
        <Label htmlFor="name">Fund Name</Label>
        <input
          id="name"
          type="text"
          value={formState.name}
          onChange={set('name')}
          placeholder="e.g. Vanguard FTSE All-World UCITS ETF"
          className={inputClass}
        />
        <FieldError errors={fieldErrors.name} />
      </div>

      {/* Issuer */}
      <div>
        <Label htmlFor="issuer">Issuer</Label>
        <input
          id="issuer"
          type="text"
          value={formState.issuer}
          onChange={set('issuer')}
          placeholder="e.g. Vanguard"
          className={inputClass}
        />
        <FieldError errors={fieldErrors.issuer} />
      </div>

      {/* Asset Class */}
      <div>
        <Label htmlFor="asset_class">Asset Class</Label>
        <select
          id="asset_class"
          value={formState.asset_class}
          onChange={set('asset_class')}
          className={selectClass}
        >
          <option value="Equities">Equities</option>
          <option value="Bonds">Bonds</option>
          <option value="Commodities">Commodities</option>
          <option value="Real Estate">Real Estate</option>
          <option value="Mixed Assets">Mixed Assets</option>
        </select>
        <FieldError errors={fieldErrors.asset_class} />
      </div>

      {/* Tracked Index */}
      <div>
        <Label htmlFor="tracked_index">Tracked Index</Label>
        <input
          id="tracked_index"
          type="text"
          value={formState.tracked_index}
          onChange={set('tracked_index')}
          placeholder="e.g. FTSE All-World"
          className={inputClass}
        />
        <FieldError errors={fieldErrors.tracked_index} />
      </div>

      {/* TER */}
      <div>
        <Label htmlFor="ter">TER (e.g. 0.0022 for 0.22%)</Label>
        <input
          id="ter"
          type="number"
          value={formState.ter}
          onChange={set('ter')}
          placeholder="e.g. 0.0022"
          step="0.0001"
          min="0.0001"
          className={inputClass}
        />
        <FieldError errors={fieldErrors.ter} />
      </div>

      {/* Domicile */}
      <div>
        <Label htmlFor="domicile">Domicile</Label>
        <input
          id="domicile"
          type="text"
          value={formState.domicile}
          onChange={set('domicile')}
          placeholder="e.g. Ireland"
          className={inputClass}
        />
        <FieldError errors={fieldErrors.domicile} />
      </div>

      {/* Fiscal Year End */}
      <div>
        <Label htmlFor="fiscal_year_end">Fiscal Year End</Label>
        <input
          id="fiscal_year_end"
          type="text"
          value={formState.fiscal_year_end}
          onChange={set('fiscal_year_end')}
          placeholder="e.g. 31-Dec"
          maxLength={10}
          className={inputClass}
        />
        <FieldError errors={fieldErrors.fiscal_year_end} />
      </div>

      {/* German Tax Classification */}
      <div>
        <Label htmlFor="german_tax_classification">German Tax Classification</Label>
        <input
          id="german_tax_classification"
          type="text"
          value={formState.german_tax_classification}
          onChange={set('german_tax_classification')}
          placeholder="e.g. Aktien"
          className={inputClass}
        />
        <FieldError errors={fieldErrors.german_tax_classification} />
      </div>

      {/* Replication Strategy */}
      <div>
        <Label htmlFor="replication_strategy">Replication Strategy</Label>
        <select
          id="replication_strategy"
          value={formState.replication_strategy}
          onChange={set('replication_strategy')}
          className={selectClass}
        >
          <option value="">Select…</option>
          <option value="Full replication">Full replication</option>
          <option value="Optimized sampling">Optimized sampling</option>
          <option value="Synthetic (swap-based)">Synthetic (swap-based)</option>
        </select>
        <FieldError errors={fieldErrors.replication_strategy} />
      </div>

      {/* Dividend Policy */}
      <div>
        <Label htmlFor="dividend_policy">Dividend Policy</Label>
        <select
          id="dividend_policy"
          value={formState.dividend_policy}
          onChange={set('dividend_policy')}
          className={selectClass}
        >
          <option value="Accumulating">Accumulating</option>
          <option value="Distributing">Distributing</option>
        </select>
        <FieldError errors={fieldErrors.dividend_policy} />
      </div>

      {/* Dividend Frequency (optional) */}
      <div>
        <Label htmlFor="dividend_frequency">Dividend Frequency (optional)</Label>
        <input
          id="dividend_frequency"
          type="text"
          value={formState.dividend_frequency}
          onChange={set('dividend_frequency')}
          placeholder="e.g. Quarterly"
          className={inputClass}
        />
        <FieldError errors={fieldErrors.dividend_frequency} />
      </div>

      {/* Currency Hedged */}
      <div className="flex items-center gap-2">
        <input
          id="currency_hedged"
          type="checkbox"
          checked={formState.currency_hedged}
          onChange={setChecked('currency_hedged')}
          className="h-4 w-4 rounded border-roman-stone/40 accent-roman-gold"
        />
        <label htmlFor="currency_hedged" className="text-sm text-roman-stone">
          Currency hedged
        </label>
      </div>

      {/* Holdings Overview (optional) */}
      <div>
        <Label htmlFor="holdings_overview">Holdings Overview (optional)</Label>
        <textarea
          id="holdings_overview"
          value={formState.holdings_overview}
          onChange={set('holdings_overview')}
          placeholder="Brief description of major holdings…"
          rows={2}
          className={textareaClass}
        />
        <FieldError errors={fieldErrors.holdings_overview} />
      </div>

      {/* Equities-only fields */}
      {isEquities && (
        <>
          <div>
            <Label htmlFor="fund_size">Fund Size in EUR (optional)</Label>
            <input
              id="fund_size"
              type="number"
              value={formState.fund_size}
              onChange={set('fund_size')}
              placeholder="e.g. 15000000000"
              step="1"
              min="0"
              className={inputClass}
            />
            <FieldError errors={fieldErrors.fund_size} />
          </div>
          <div>
            <Label htmlFor="monthly_volume">Monthly Volume in EUR (optional)</Label>
            <input
              id="monthly_volume"
              type="number"
              value={formState.monthly_volume}
              onChange={set('monthly_volume')}
              placeholder="e.g. 500000000"
              step="1"
              min="0"
              className={inputClass}
            />
            <FieldError errors={fieldErrors.monthly_volume} />
          </div>
          <div>
            <Label htmlFor="volatility_1y">1Y Volatility % (optional)</Label>
            <input
              id="volatility_1y"
              type="number"
              value={formState.volatility_1y}
              onChange={set('volatility_1y')}
              placeholder="e.g. 0.1450"
              step="0.0001"
              min="0"
              className={inputClass}
            />
            <FieldError errors={fieldErrors.volatility_1y} />
          </div>
          <div>
            <Label htmlFor="volatility_3y">3Y Volatility % (optional)</Label>
            <input
              id="volatility_3y"
              type="number"
              value={formState.volatility_3y}
              onChange={set('volatility_3y')}
              placeholder="e.g. 0.1650"
              step="0.0001"
              min="0"
              className={inputClass}
            />
            <FieldError errors={fieldErrors.volatility_3y} />
          </div>
        </>
      )}

      {/* Geographical Distribution */}
      <div>
        <Label htmlFor="geographical_distribution">
          Geographical Distribution (JSON)
        </Label>
        <textarea
          id="geographical_distribution"
          value={formState.geographical_distribution}
          onChange={set('geographical_distribution')}
          placeholder={'{"US": 63.0, "EU": 20.0, "JP": 6.0}'}
          rows={3}
          className={textareaClass}
        />
        <FieldError errors={fieldErrors.geographical_distribution} />
      </div>

      {/* Sector Distribution */}
      <div>
        <Label htmlFor="sector_distribution">Sector Distribution (JSON)</Label>
        <textarea
          id="sector_distribution"
          value={formState.sector_distribution}
          onChange={set('sector_distribution')}
          placeholder={'{"Technology": 25.0, "Financials": 18.0}'}
          rows={3}
          className={textareaClass}
        />
        <FieldError errors={fieldErrors.sector_distribution} />
      </div>

      {/* Bonds-only fields */}
      {isBonds && (
        <>
          <div>
            <Label htmlFor="bond_maturities">Bond Maturities (JSON)</Label>
            <textarea
              id="bond_maturities"
              value={formState.bond_maturities}
              onChange={set('bond_maturities')}
              placeholder={'{"0-3Y": 15.0, "3-7Y": 35.0, "7-15Y": 30.0}'}
              rows={3}
              className={textareaClass}
            />
            <FieldError errors={fieldErrors.bond_maturities} />
          </div>
          <div>
            <Label htmlFor="bond_credit_scores">Bond Credit Scores (JSON)</Label>
            <textarea
              id="bond_credit_scores"
              value={formState.bond_credit_scores}
              onChange={set('bond_credit_scores')}
              placeholder={'{"AAA": 20.0, "AA": 35.0, "A": 25.0}'}
              rows={3}
              className={textareaClass}
            />
            <FieldError errors={fieldErrors.bond_credit_scores} />
          </div>
        </>
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
        {isPending ? 'Saving…' : etf ? 'Save Changes' : 'Save ETF'}
      </button>
    </form>
  )
}
