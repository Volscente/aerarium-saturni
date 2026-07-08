'use server'

import { revalidateTag } from 'next/cache'
import { TransactionFormSchema, type TransactionFormValues } from './transaction-schema'

export async function updateTransaction(
  id: string,
  payload: TransactionFormValues
): Promise<{ success: true } | { error: string }> {
  /**
   * Re-validates payload with TransactionFormSchema, calls PUT /transactions/{id},
   * and invalidates both cache tags on success.
   *
   * Args:
   *   id: UUID of the transaction to update.
   *   payload: Full form values from TransactionForm (all fields, not just changed ones).
   *
   * Returns:
   *   { success: true } on HTTP 200 from the backend.
   *   { error: string } on Zod parse failure or any non-200 response.
   */
  const parsed = TransactionFormSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid form data' }
  }

  const { ticker, isin, ...rest } = parsed.data
  const body = {
    ...rest,
    ticker: ticker || undefined,
    isin: isin || undefined,
  }

  try {
    const res = await fetch(`${process.env.BACKEND_URL}/transactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.status !== 200) {
      const text = await res.text()
      return { error: `Backend error ${res.status}: ${text}` }
    }

    revalidateTag('transactions')
    revalidateTag('portfolio-overview')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function deleteTransaction(
  id: string
): Promise<{ success: true } | { error: string }> {
  /**
   * Calls DELETE /transactions/{id} and invalidates both cache tags on success.
   *
   * Args:
   *   id: UUID of the transaction to delete.
   *
   * Returns:
   *   { success: true } on HTTP 204 from the backend.
   *   { error: string } on any non-204 response or network error.
   */
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/transactions/${id}`, {
      method: 'DELETE',
    })

    if (res.status !== 204) {
      const text = await res.text()
      return { error: `Backend error ${res.status}: ${text}` }
    }

    revalidateTag('transactions')
    revalidateTag('portfolio-overview')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function createTransaction(
  payload: TransactionFormValues
): Promise<{ success: true } | { error: string }> {
  /**
   * Server Action: validate, persist, and invalidate the transaction cache.
   *
   * Parses `payload` with `TransactionFormSchema` (Zod). On parse success, POSTs
   * to `${process.env.BACKEND_URL}/transactions`. On HTTP 201, calls
   * `revalidateTag('transactions')` to invalidate the ledger cache and returns
   * `{ success: true }`. On Zod parse failure or non-201 HTTP response, returns
   * `{ error: string }` without throwing — callers receive a structured error
   * they can render inline.
   *
   * Args:
   *   payload: Raw form values from `TransactionForm`; validated client-side
   *            first, then re-validated here before the backend round-trip.
   *
   * Returns:
   *   `{ success: true }` on HTTP 201 from the backend, or `{ error: string }`
   *   on Zod parse failure or any non-201 response.
   */
  const parsed = TransactionFormSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid form data' }
  }

  const { ticker, isin, ...rest } = parsed.data
  const body = {
    ...rest,
    ticker: ticker || undefined,
    isin: isin || undefined,
  }

  try {
    const res = await fetch(`${process.env.BACKEND_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.status !== 201) {
      const text = await res.text()
      return { error: `Backend error ${res.status}: ${text}` }
    }

    revalidateTag('transactions')
    revalidateTag('portfolio-overview')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}
