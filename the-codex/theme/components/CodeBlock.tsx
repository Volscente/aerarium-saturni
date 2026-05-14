'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

type CodeBlockProps = React.HTMLAttributes<HTMLPreElement> & {
  children?: React.ReactNode
}

export function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const text =
      typeof children === 'string'
        ? children
        : (document.querySelector(`[data-copy-target="${props.id}"]`)?.textContent ?? '')

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="group relative my-4">
      <pre
        {...props}
        className={[
          'overflow-x-auto rounded-md border border-roman-stone/50 bg-roman-parchment/90 dark:bg-roman-obsidian/80 p-4 text-sm text-roman-obsidian dark:text-roman-parchment',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </pre>
      <button
        onClick={handleCopy}
        aria-label="Copy code"
        className="absolute right-2 top-2 rounded p-1.5 text-roman-stone opacity-0 transition-opacity hover:text-roman-terracotta group-hover:opacity-100 focus:opacity-100"
      >
        {copied ? (
          <Check className="h-4 w-4 text-roman-terracotta" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}
