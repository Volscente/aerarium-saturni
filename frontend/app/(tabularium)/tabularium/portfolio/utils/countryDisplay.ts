const REGION_DISPLAY_NAMES = new Intl.DisplayNames(['en'], { type: 'region' })

export function countryFlagEmoji(code: string): string {
  /**
   * Converts an ISO 3166-1 alpha-2 code into its flag emoji.
   *
   * Each letter maps to a Unicode Regional Indicator Symbol
   * (U+1F1E6..U+1F1FF for A..Z); rendering two of them side by side is
   * what displays as a flag. No lookup table needed -- every valid
   * alpha-2 code converts directly.
   *
   * Args:
   *   code: A 2-letter ISO 3166-1 alpha-2 country code.
   *
   * Returns:
   *   The flag emoji string.
   */
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
}

export function countryDisplayName(code: string | null): string {
  /**
   * Returns a full, human-readable country name for an ISO alpha-2 code.
   *
   * Uses the browser's built-in Intl.DisplayNames (CLDR territory names)
   * rather than a maintained lookup table. Falls back to the raw code if
   * it can't be resolved (e.g. a non-standard code slipping through).
   *
   * Args:
   *   code: A 2-letter ISO 3166-1 alpha-2 country code, or null.
   *
   * Returns:
   *   The full country name, "Unknown" when code is null, or the raw
   *   code itself if Intl.DisplayNames can't resolve it.
   */
  if (!code) return 'Unknown'
  try {
    return REGION_DISPLAY_NAMES.of(code) ?? code
  } catch {
    return code
  }
}

export function countryLabel(code: string | null): string {
  /**
   * Full display label combining flag + name, e.g. "🇨🇭 Switzerland".
   *
   * Args:
   *   code: A 2-letter ISO 3166-1 alpha-2 country code, or null.
   *
   * Returns:
   *   "Unknown" (no flag) when code is null; otherwise "<flag> <name>".
   */
  if (!code) return 'Unknown'
  return `${countryFlagEmoji(code)} ${countryDisplayName(code)}`
}
