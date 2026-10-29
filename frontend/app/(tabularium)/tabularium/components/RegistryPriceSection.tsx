'use client'

import { useState } from 'react'
import type { EtfResponse } from './EtfForm'
import { TimelineChart } from './TimelineChart'
import { UpdatePricesButton } from './UpdatePricesButton'

export function RegistryPriceSection({ etfs }: { etfs: EtfResponse[] }): JSX.Element {
  /**
   * Groups the "Update prices" control and the Timeline Chart on the ETF Registry.
   *
   * The chart caches each ETF's series on the client, and the `etfs` prop does not
   * change when prices are refreshed, so the chart cannot detect stale data by
   * itself. This wrapper owns a `priceVersion` counter, incremented whenever an
   * update returns results, which the chart uses to drop its cache and reload.
   *
   * Args:
   *   etfs: The registry's ETFs, passed from the Server Component.
   *
   * Returns:
   *   JSX with the update control above the chart.
   */
  const [priceVersion, setPriceVersion] = useState(0)

  return (
    <>
      <UpdatePricesButton etfs={etfs} onUpdated={() => setPriceVersion((v) => v + 1)} />
      <TimelineChart etfs={etfs} priceVersion={priceVersion} />
    </>
  )
}
