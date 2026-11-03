'use server'

import { revalidateTag } from 'next/cache'
import { EtfFormSchema, EtfPriceRefreshSchema, type EtfFormValues } from './etf-schema'

function parseJsonbField(value: string | undefined): Record<string, number> | null {
  if (!value?.trim()) return null
  try {
    return JSON.parse(value) as Record<string, number>
  } catch {
    return null
  }
}

export async function createEtf(
  payload: EtfFormValues
): Promise<{ success: true } | { error: string }> {
  /**
   * Server Action: validate, persist, and invalidate the ETF registry cache.
   *
   * Parses payload with EtfFormSchema. On success, transforms the bond JSONB
   * string fields back to Record<string, number> by JSON.parse before POSTing
   * to ${BACKEND_URL}/etfs — geographical_distribution/sector_distribution are
   * never sent; the backend derives them from holdings uploads. On HTTP 201, calls revalidateTag('etfs'),
   * revalidateTag('portfolio-overview'), and revalidateTag('holdings-exposure'),
   * then returns { success: true }. Mirrors createTransaction in actions.ts.
   *
   * Args:
   *   payload: EtfFormValues from EtfForm; validated client-side, re-validated
   *            here before the backend call.
   *
   * Returns:
   *   { success: true } on HTTP 201, or { error: string } on Zod or HTTP failure.
   */
  const parsed = EtfFormSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid form data' }
  }

  const { bond_maturities, bond_credit_scores, ...rest } = parsed.data

  const body: Record<string, unknown> = { ...rest }
  const bondMat = parseJsonbField(bond_maturities)
  const bondCred = parseJsonbField(bond_credit_scores)
  if (bondMat !== null) body.bond_maturities = bondMat
  if (bondCred !== null) body.bond_credit_scores = bondCred

  try {
    const res = await fetch(`${process.env.BACKEND_URL}/etfs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.status !== 201) {
      const text = await res.text()
      return { error: `Backend error ${res.status}: ${text}` }
    }

    revalidateTag('etfs')
    revalidateTag('portfolio-overview')
    revalidateTag('holdings-exposure')
    revalidateTag('holdings-geography')
    revalidateTag('holdings-sectors')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function updateEtf(
  id: string,
  payload: Partial<EtfFormValues>
): Promise<{ success: true } | { error: string }> {
  /**
   * Server Action: partially update an ETF and invalidate the registry cache.
   *
   * PUTs to ${BACKEND_URL}/etfs/{id} sending only non-undefined fields. On
   * HTTP 200, calls revalidateTag('etfs'), revalidateTag('portfolio-overview'),
   * and revalidateTag('holdings-exposure'). On 404, returns a descriptive error.
   *
   * Args:
   *   id: UUID string of the ETF to update.
   *   payload: Partial EtfFormValues; undefined-value keys are omitted from the
   *            JSON body to match the backend's EtfUpdate partial-update semantics.
   *
   * Returns:
   *   { success: true } on HTTP 200, or { error: string } on any failure.
   */
  const body: Record<string, unknown> = {}
  const jsonbKeys = new Set(['bond_maturities', 'bond_credit_scores'])

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue
    if (jsonbKeys.has(key)) {
      body[key] = parseJsonbField(value as string)
    } else {
      body[key] = value
    }
  }

  try {
    const res = await fetch(`${process.env.BACKEND_URL}/etfs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.status === 404) return { error: 'ETF not found' }
    if (res.status !== 200) {
      const text = await res.text()
      return { error: `Backend error ${res.status}: ${text}` }
    }

    revalidateTag('etfs')
    revalidateTag('portfolio-overview')
    revalidateTag('holdings-exposure')
    revalidateTag('holdings-geography')
    revalidateTag('holdings-sectors')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function deleteEtf(
  id: string
): Promise<{ success: true } | { error: string }> {
  /**
   * Server Action: delete an ETF and its cascaded holdings and price history.
   *
   * DELETEs ${BACKEND_URL}/etfs/{id}. On HTTP 204, calls revalidateTag('etfs'),
   * revalidateTag('portfolio-overview'), and revalidateTag('holdings-exposure').
   * Cascade deletion of etf_holdings and etf_price_history rows is handled by
   * the database ON DELETE CASCADE constraint established in TASK-1.
   *
   * Args:
   *   id: UUID string of the ETF to delete.
   *
   * Returns:
   *   { success: true } on HTTP 204, or { error: string } on 404 or network failure.
   */
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/etfs/${id}`, {
      method: 'DELETE',
    })

    if (res.status === 404) return { error: 'ETF not found' }
    if (res.status !== 204) {
      const text = await res.text()
      return { error: `Backend error ${res.status}: ${text}` }
    }

    revalidateTag('etfs')
    revalidateTag('portfolio-overview')
    revalidateTag('holdings-exposure')
    revalidateTag('holdings-geography')
    revalidateTag('holdings-sectors')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}

export interface EtfPriceEntry {
  id: string
  etf_id: string
  price: string
  currency: string
  timestamp: string
}

export async function fetchPriceHistory(
  id: string
): Promise<EtfPriceEntry[] | { error: string }> {
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/etfs/${id}/price-history`)
    if (res.status === 404) return { error: 'ETF not found' }
    if (!res.ok) return { error: `Backend error ${res.status}` }
    return res.json() as Promise<EtfPriceEntry[]>
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}

export interface EtfPriceRefreshResult {
  etf_id: string
  ticker: string
  status: 'updated' | 'failed'
  rows_written: number
  error: string | null
}

export async function refreshEtfPrices(
  etfIds: string[]
): Promise<{ results: EtfPriceRefreshResult[] } | { error: string }> {
  /**
   * Server Action: fetch prices from the external provider for the selected ETFs.
   *
   * Validates the selection with EtfPriceRefreshSchema, then POSTs { etf_ids }
   * to ${BACKEND_URL}/etfs/prices/refresh. The backend treats an omitted or empty
   * etf_ids as "all ETFs", so an empty selection is rejected here rather than
   * forwarded — deselecting everything must never refresh everything. The
   * backend answers HTTP 200 once the ids resolve and reports per-ETF failures
   * in the results, so a failed ETF is part of { results }, not { error }. On
   * 200, calls revalidateTag for 'etfs', 'portfolio-overview',
   * 'holdings-exposure', 'holdings-geography' and 'holdings-sectors' (the same
   * set every other ETF write action revalidates) — even when some ETFs failed,
   * because the others were written.
   *
   * Args:
   *   etfIds: UUID strings of the ETFs to update; must contain at least one.
   *
   * Returns:
   *   { results } with one entry per ETF on HTTP 200, or { error: string } on a
   *   Zod failure, a 404 (unknown ETF), any other non-200 status, or a network error.
   */
  const parsed = EtfPriceRefreshSchema.safeParse({ etf_ids: etfIds })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid selection' }
  }

  try {
    const res = await fetch(`${process.env.BACKEND_URL}/etfs/prices/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    })

    if (res.status === 404) return { error: 'ETF not found' }
    if (res.status !== 200) {
      const text = await res.text()
      return { error: `Backend error ${res.status}: ${text}` }
    }

    const results = (await res.json()) as EtfPriceRefreshResult[]

    revalidateTag('etfs')
    revalidateTag('portfolio-overview')
    revalidateTag('holdings-exposure')
    revalidateTag('holdings-geography')
    revalidateTag('holdings-sectors')
    return { results }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}
