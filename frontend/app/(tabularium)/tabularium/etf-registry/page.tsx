export const dynamic = 'force-dynamic'

import { AddEtfButton } from '../components/AddEtfButton'
import { EtfRegistryTable } from '../components/EtfRegistryTable'
import type { EtfResponse } from '../components/EtfForm'

async function fetchEtfs(): Promise<EtfResponse[]> {
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/etfs`, {
      next: { tags: ['etfs'] },
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export default async function EtfRegistryPage() {
  const etfs = await fetchEtfs()

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-roman text-3xl font-bold text-roman-gold">
          ETF Registry
        </h1>
        <AddEtfButton />
      </div>
      {etfs.length === 0 ? (
        <p className="text-roman-stone">No ETFs registered yet.</p>
      ) : (
        <EtfRegistryTable etfs={etfs} />
      )}
    </div>
  )
}
