import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',  // Dark mode via .dark class on <html>
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          500: 'var(--color-primary)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
        },
      },
      keyframes: {
        indeterminate: {
          '0%':   { transform: 'translateX(-200%)' },
          '100%': { transform: 'translateX(600%)' },
        },
      },
      animation: {
        indeterminate: 'indeterminate 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
