import { Scale } from 'lucide-react'

type FooterProps = {
  menu: boolean
}

export function Footer({ menu: _menu }: FooterProps) {
  return (
    <footer className="border-t border-roman-stone/40 bg-roman-parchment dark:bg-roman-obsidian py-6">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between px-6 text-sm text-roman-stone">
        <span className="flex items-center gap-1.5">
          <Scale className="h-4 w-4 flex-shrink-0" />
          {new Date().getFullYear()} Aerarium Saturni
        </span>
        <a
          href="https://github.com/Volscente/aerarium-saturni"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-roman-terracotta transition-colors"
        >
          GitHub
        </a>
      </div>
    </footer>
  )
}
