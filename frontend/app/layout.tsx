import type { ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'
import '../styles/globals.css'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider defaultTheme="dark" storageKey="the-codex-theme">
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
