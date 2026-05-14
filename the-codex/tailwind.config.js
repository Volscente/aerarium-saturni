/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './theme/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './rehype/**/*.{js,ts}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        roman: {
          obsidian: '#1A1A2E',
          parchment: '#F5F0E8',
          terracotta: '#C0553A',
          gold: '#B8860B',
          stone: '#8B8680',
        },
      },
      fontFamily: {
        roman: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
