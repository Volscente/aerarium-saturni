const BROKER_LOGO_MAP: Record<string, string> = {
  n26: '/brokers/n26.png',
  ibkr: '/brokers/ibkr.jpeg',
  interactivebrokers: '/brokers/ibkr.jpeg',
}

/**
 * Maps a broker platform name to its static logo path.
 *
 * Normalises the input to lowercase and strips spaces and hyphens
 * before lookup. Returns null for any unrecognised platform so
 * callers can render the Building2 fallback icon instead.
 *
 * @param platform - The broker_platform string from PortfolioRowResponse.
 * @returns Path to the logo asset under /brokers/, or null if unknown.
 */
export function brokerLogoPath(platform: string): string | null {
  const key = platform.toLowerCase().replace(/[\s-]/g, '')
  return BROKER_LOGO_MAP[key] ?? null
}
