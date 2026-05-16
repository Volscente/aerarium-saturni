'use client'

import { useState, useEffect } from 'react'
import { BookOpen, Github, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'

export function CustomNavbar() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <nav className="sticky top-0 z-20 w-full border-b border-roman-stone bg-roman-parchment dark:bg-roman-obsidian">
      <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-4 px-6">
        <a
          href="/"
          className="flex shrink-0 items-center gap-2 text-roman-gold font-roman font-semibold text-lg hover:text-roman-terracotta transition-colors"
        >
          <BookOpen className="h-5 w-5 flex-shrink-0" />
          <span className="hidden sm:inline">Aerarium Saturni — The Codex</span>
        </a>

        <div className="ml-auto flex items-center gap-4">
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-roman-stone hover:text-roman-terracotta transition-colors"
              aria-label="Toggle light/dark mode"
            >
              {theme === 'dark' ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>
          )}

          <a
            href="https://github.com/Volscente/aerarium-saturni"
            target="_blank"
            rel="noopener noreferrer"
            className="text-roman-stone hover:text-roman-terracotta transition-colors"
            aria-label="GitHub repository"
          >
            <Github className="h-5 w-5" />
          </a>
        </div>
      </div>
    </nav>
  )
}
