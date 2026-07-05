'use server'

import { revalidateTag } from 'next/cache'
import { EtfFormSchema, type EtfFormValues } from './etf-schema'

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
   * Parses payload with EtfFormSchema. On success, transforms the JSONB string
   * fields back to Record<string, number> by JSON.parse before POSTing to
   * ${BACKEND_URL}/etfs. On HTTP 201, calls revalidateTag('etfs') and returns
   * { success: true }. Mirrors createTransaction in actions.ts.
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

  const {
    geographical_distribution,
    sector_distribution,
    bond_maturities,
    bond_credit_scores,
    ...rest
  } = parsed.data

  const body: Record<string, unknown> = {
    ...rest,
    geographical_distribution: parseJsonbField(geographical_distribution) ?? {},
    sector_distribution: parseJsonbField(sector_distribution) ?? {},
  }
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
   * HTTP 200, calls revalidateTag('etfs'). On 404, returns a descriptive error.
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
  const jsonbKeys = new Set([
    'geographical_distribution',
    'sector_distribution',
    'bond_maturities',
    'bond_credit_scores',
  ])

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
   * DELETEs ${BACKEND_URL}/etfs/{id}. On HTTP 204, calls revalidateTag('etfs').
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
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function addPriceSnapshot(
  id: string,
  price: number,
  currency: string,
  timestamp: string
): Promise<{ success: true } | { error: string }> {
  /**
   * Server Action: append a manual price snapshot to etf_price_history.
   *
   * POSTs to ${BACKEND_URL}/etfs/{id}/price with { price, currency, timestamp }.
   * On HTTP 201, calls revalidateTag('etfs'). On 404, returns { error: 'ETF not found' }.
   *
   * Args:
   *   id: UUID string of the parent ETF.
   *   price: Positive numeric price in the given currency.
   *   currency: ISO 4217 3-character code (e.g. "EUR").
   *   timestamp: ISO 8601 datetime string for the observation point.
   *
   * Returns:
   *   { success: true } on HTTP 201, or { error: string } on any failure.
   */
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/etfs/${id}/price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price, currency, timestamp }),
    })

    if (res.status === 404) return { error: 'ETF not found' }
    if (res.status !== 201) {
      const text = await res.text()
      return { error: `Backend error ${res.status}: ${text}` }
    }

    revalidateTag('etfs')
    revalidateTag('portfolio-overview')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}
