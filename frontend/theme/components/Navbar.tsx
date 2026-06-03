'use client'

import { useState, useEffect } from 'react'
import { BookOpen, Github, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Navbar } from 'nextra-theme-docs'

export function CustomNavbar() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <Navbar
      logo={
        <span className="flex shrink-0 items-center gap-2 text-roman-gold font-roman font-semibold text-lg hover:text-roman-terracotta transition-colors">
          <BookOpen className="h-5 w-5 shrink-0" />
          <span className="hidden sm:inline">Aerarium Saturni — The Codex</span>
        </span>
      }
      projectLink="https://github.com/Volscente/aerarium-saturni"
      projectIcon={<Github className="h-5 w-5" />}
    >
      {mounted && (
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="text-roman-stone hover:text-roman-terracotta transition-colors"
          aria-label="Toggle light/dark mode"
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      )}
    </Navbar>
  )
}
