/**
 * Returns a Tailwind text-colour class for a performance value.
 *
 * Positive  → 'text-green-600'
 * Negative  → 'text-red-600'
 * Zero/null → 'text-neutral-500'
 *
 * @param value - Performance value (absolute fiat or percentage); null when unavailable.
 * @returns A Tailwind CSS class string.
 */
export function perfClass(value: number | null): string {
  if (value === null || value === 0) return 'text-neutral-500'
  return value > 0 ? 'text-green-600' : 'text-red-600'
}
