'use client'

import { useRef, useState } from 'react'

export interface HoldingsUploadProps {
  etfId: string
}

type UploadStatus =
  | { inserted_rows: number }
  | { error: string }
  | null

export function HoldingsUpload({ etfId }: HoldingsUploadProps): JSX.Element {
  /**
   * CSV batch upload component for ETF holdings replacement.
   *
   * Renders a styled label wrapping a hidden file input. On file selection,
   * POSTs the CSV to /api/etfs/{id}/holdings/upload (the Next.js route handler
   * that proxies to the backend). Shows "Inserted N rows" on success or a
   * structured error message on failure. Resets the input after each attempt
   * to allow re-uploading the same file.
   *
   * Args:
   *   etfId: UUID of the ETF whose holdings will be replaced.
   *
   * Returns:
   *   JSX containing the file trigger label and status message.
   */
  const [status, setStatus] = useState<UploadStatus>(null)
  const [isPending, setIsPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsPending(true)
    setStatus(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/etfs/${etfId}/holdings/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = (await res.json()) as unknown

      if (res.ok && data !== null && typeof data === 'object' && 'inserted_rows' in data) {
        setStatus({ inserted_rows: (data as { inserted_rows: number }).inserted_rows })
      } else if (data !== null && typeof data === 'object' && 'detail' in data) {
        setStatus({ error: String((data as { detail: unknown }).detail) })
      } else {
        setStatus({ error: `Upload failed (${res.status})` })
      }
    } catch (err) {
      setStatus({ error: err instanceof Error ? err.message : 'Upload failed' })
    } finally {
      setIsPending(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="cursor-pointer rounded border border-roman-stone/30 px-2 py-1 text-xs text-roman-stone hover:border-roman-gold/50 hover:text-roman-gold transition-colors text-center select-none">
        {isPending ? 'Uploading…' : 'Holdings CSV'}
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={handleChange}
          disabled={isPending}
        />
      </label>
      {status && 'inserted_rows' in status && (
        <p className="text-xs text-roman-stone">
          Inserted {status.inserted_rows} rows
        </p>
      )}
      {status && 'error' in status && (
        <p className="text-xs text-red-500 max-w-[160px] break-words">{status.error}</p>
      )}
    </div>
  )
}
