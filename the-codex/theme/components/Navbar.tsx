import { BookOpen, Github } from 'lucide-react'
import type { Item, PageItem, MenuItem } from 'nextra/normalize-pages'
import { Search } from './Search'

type NavBarProps = {
  flatDirectories: Item[]
  items: (PageItem | MenuItem)[]
}

export function Navbar({ flatDirectories, items }: NavBarProps) {
  return (
    <nav className="sticky top-0 z-20 w-full border-b border-roman-stone bg-roman-obsidian">
      <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-4 px-6">
        <a
          href="/"
          className="flex shrink-0 items-center gap-2 text-roman-gold font-roman font-semibold text-lg hover:text-roman-terracotta transition-colors"
        >
          <BookOpen className="h-5 w-5 flex-shrink-0" />
          <span className="hidden sm:inline">Aerarium Saturni — The Codex</span>
        </a>

        <Search
          className="mx-4 w-64 shrink-0"
          directories={flatDirectories}
        />

        <div className="ml-auto flex items-center gap-4">
          {items
            .filter((item) => item.type === 'page' || item.type === 'menu')
            .map((item) => (
              <a
                key={item.route}
                href={item.route}
                className="text-sm text-roman-parchment/80 hover:text-roman-terracotta transition-colors"
              >
                {item.title}
              </a>
            ))}

          <a
            href="https://github.com/Volscente/aerarium-saturni"
            target="_blank"
            rel="noopener noreferrer"
            className="text-roman-stone hover:text-roman-parchment transition-colors"
            aria-label="GitHub repository"
          >
            <Github className="h-5 w-5" />
          </a>
        </div>
      </div>
    </nav>
  )
}
