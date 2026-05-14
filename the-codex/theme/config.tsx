import { Github } from 'lucide-react'
import type { DocsThemeConfig } from 'nextra-theme-docs'
import { Navbar } from './components/Navbar'
import { SidebarTitle } from './components/Sidebar'
import { Footer } from './components/Footer'
import { CodeBlock } from './components/CodeBlock'
import { Search } from './components/Search'

const config: DocsThemeConfig = {
  logo: (
    <span className="font-roman font-semibold text-roman-gold">
      Aerarium Saturni — The Codex
    </span>
  ),
  project: {
    link: 'https://github.com/Volscente/aerarium-saturni',
    icon: <Github className="h-5 w-5" />,
  },
  docsRepositoryBase:
    'https://github.com/Volscente/aerarium-saturni/tree/main/the-codex',

  navbar: {
    component: Navbar,
  },

  footer: {
    component: Footer,
  },

  search: {
    component: Search,
  },

  sidebar: {
    titleComponent: SidebarTitle,
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },

  components: {
    pre: CodeBlock,
  },

  nextThemes: {
    defaultTheme: 'dark',
    forcedTheme: 'dark',
    storageKey: 'the-codex-theme',
  },

  darkMode: false,

  primaryHue: { light: 18, dark: 18 },
  primarySaturation: { light: 58, dark: 58 },
}

export default config
