'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Search as SearchIcon, X } from 'lucide-react'
import FlexSearch from 'flexsearch'
import type { Item } from 'nextra/normalize-pages'
import type { SearchData } from 'nextra'

type SearchResult = {
  id: string
  url: string
  title: string
  excerpt: string
}

type SearchIndexes = [any, any]

type PageDoc = {
  id: number
  title: string
  content: string
}

type SectionDoc = {
  id: string
  url: string
  title: string
  pageId: string
  content: string
  display?: string
}

const MIN_QUERY_LENGTH = 2

const indexCache: Record<string, SearchIndexes> = {}
const loadingPromises = new Map<string, Promise<void>>()

async function loadIndexes(basePath: string, locale: string): Promise<void> {
  const key = `${basePath}@${locale}`
  if (indexCache[key]) return

  const existing = loadingPromises.get(key)
  if (existing) return existing

  const promise = (async () => {
    const res = await fetch(`${basePath}/_next/static/chunks/nextra-data-${locale}.json`)
    const searchData: SearchData = await res.json()

    // @ts-ignore
    const pageIndex = new (FlexSearch as any).Document({
      cache: 100,
      tokenize: 'full',
      document: {
        id: 'id',
        index: [
          { field: 'title', boost: (_words: any, _term: any, _idx: any) => 2 },
          { field: 'content', boost: (_words: any, _term: any, _idx: any) => 1 },
        ],
        store: ['title'],
      },
      context: {
        resolution: 9,
        depth: 2,
        bidirectional: true,
      },
    })

    // @ts-ignore
    const sectionIndex = new (FlexSearch as any).Document({
      cache: 100,
      tokenize: 'full',
      document: {
        id: 'id',
        tag: 'pageId',
        index: [
          { field: 'title', boost: (_words: any, _term: any, _idx: any) => 2 },
          { field: 'content', boost: (_words: any, _term: any, _idx: any) => 1 },
        ],
        store: ['title', 'content', 'url', 'display'],
      },
      context: {
        resolution: 9,
        depth: 2,
        bidirectional: true,
      },
    })

    let pageId = 0
    for (const [route, structurizedData] of Object.entries(searchData)) {
      let pageContent = ''
      ++pageId

      for (const [key, content] of Object.entries(structurizedData.data)) {
        const [headingId, headingValue] = key.split('#')
        const url = route + (headingId ? `#${headingId}` : '')
        const title = headingValue || structurizedData.title
        const paragraphs = content.split('\n')

        sectionIndex.add({
          id: url,
          url,
          title,
          pageId: `page_${pageId}`,
          content: title,
          ...(paragraphs[0] ? { display: paragraphs[0] } : {}),
        })

        for (let i = 0; i < paragraphs.length; i++) {
          sectionIndex.add({
            id: `${url}_${i}`,
            url,
            title,
            pageId: `page_${pageId}`,
            content: paragraphs[i],
          })
        }

        pageContent += ` ${title} ${content}`
      }

      pageIndex.add({ id: pageId, title: structurizedData.title, content: pageContent })
    }

    indexCache[key] = [pageIndex, sectionIndex]
  })()

  loadingPromises.set(key, promise)
  return promise
}

/** Custom search component injected via DocsThemeConfig.search.component.
 *
 * On first keystroke: fetches /_next/static/chunks/nextra-data-${locale}.json
 * (same endpoint as Nextra's built-in search), builds two FlexSearch.Document
 * indexes — pageIndex and sectionIndex — with a boost function that returns
 * 2 for the title field and 1 for content, prioritising h1/h2 headings.
 * Subsequent searches reuse cached indexes.
 *
 * FlexSearch is already bundled by nextra-theme-docs; import it directly:
 *   import FlexSearch from 'flexsearch'  (no entry in package.json needed)
 *
 * Args:
 *   className: Optional CSS class forwarded to the search container div.
 *   directories: Flat directory list from Nextra, used to resolve page titles
 *                for results that lack a stored title in the index.
 *
 * Returns:
 *   A controlled input with a dropdown results list rendered in Roman palette
 *   Tailwind classes. Keyboard navigation (ArrowUp/Down, Enter, Escape) mirrors
 *   the behaviour of Nextra's built-in Flexsearch component.
 */
export function Search({
  className,
  directories: _directories,
}: {
  className?: string
  directories: Item[]
}) {
  const router = useRouter()
  // Nextra generates the search index with DEFAULT_LOCALE = 'en-US' when no i18n is configured.
  const { locale = 'en-US', basePath } = router

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const doSearch = useCallback(
    async (q: string) => {
      if (q.trim().length < MIN_QUERY_LENGTH) {
        setResults([])
        return
      }

      setLoading(true)
      try {
        await loadIndexes(basePath, locale)
        const key = `${basePath}@${locale}`
        const indexes = indexCache[key]
        if (!indexes) return

        const [, sectionIndex] = indexes
        const rawResults = sectionIndex.search(q, 5, { enrich: true })

        const seen = new Set<string>()
        const merged: SearchResult[] = []

        for (const group of rawResults) {
          for (const hit of group.result) {
            const stored = hit.doc as SectionDoc
            if (!stored?.url || seen.has(stored.url)) continue
            seen.add(stored.url)
            merged.push({
              id: String(hit.id),
              url: stored.url,
              title: stored.title,
              excerpt: stored.display ?? stored.content?.slice(0, 120) ?? '',
            })
            if (merged.length >= 5) break
          }
          if (merged.length >= 5) break
        }

        setResults(merged)
        setActive(0)
      } finally {
        setLoading(false)
      }
    },
    [basePath, locale],
  )

  useEffect(() => {
    const id = setTimeout(() => doSearch(query), 150)
    return () => clearTimeout(id)
  }, [query, doSearch])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const result = results[active]
      if (result) {
        router.push(result.url)
        setOpen(false)
        setQuery('')
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
      inputRef.current?.blur()
    }
  }

  return (
    <div className={['relative', className].filter(Boolean).join(' ')}>
      <div className="flex items-center rounded-md border border-roman-stone/60 bg-roman-parchment/90 dark:bg-roman-obsidian/80 px-3 py-1.5 focus-within:border-roman-terracotta transition-colors">
        <SearchIcon className="mr-2 h-4 w-4 flex-shrink-0 text-roman-stone" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder="Search The Codex…"
          className="w-full bg-transparent text-sm text-roman-obsidian dark:text-roman-parchment placeholder:text-roman-stone outline-none"
          aria-label="Search documentation"
          aria-autocomplete="list"
          aria-controls="search-results"
          aria-activedescendant={open && results[active] ? `result-${active}` : undefined}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}
            className="ml-1 text-roman-stone hover:text-roman-terracotta"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && query.trim().length >= MIN_QUERY_LENGTH && (
        <ul
          id="search-results"
          ref={listRef}
          role="listbox"
          className="absolute left-0 z-50 mt-1 max-h-80 w-96 overflow-y-auto rounded-md border border-roman-stone/50 bg-roman-parchment dark:bg-roman-obsidian py-1 shadow-lg"
        >
          {loading && (
            <li className="px-4 py-3 text-sm text-roman-stone">Searching…</li>
          )}
          {!loading && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-roman-stone">No results for &ldquo;{query}&rdquo;</li>
          )}
          {!loading &&
            results.map((result, i) => (
              <li
                key={result.id}
                id={`result-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  router.push(result.url)
                  setOpen(false)
                  setQuery('')
                }}
                className={[
                  'cursor-pointer px-4 py-2.5 transition-colors',
                  i === active
                    ? 'bg-roman-terracotta/20 text-roman-obsidian dark:text-roman-parchment'
                    : 'text-roman-obsidian/80 dark:text-roman-parchment/80 hover:bg-roman-stone/10',
                ].join(' ')}
              >
                <p className="text-sm font-medium text-roman-gold">{result.title}</p>
                {result.excerpt && (
                  <p className="mt-0.5 truncate text-xs text-roman-stone">{result.excerpt}</p>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
