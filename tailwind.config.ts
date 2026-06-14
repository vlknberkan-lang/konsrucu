/**
 * KonsRücü — tailwind.config.ts
 * Cobalt Steel semantic token'ları + KonsRücü "kr" teal aksanı.
 * Tüm renkler globals.css'teki HSL kanallarına bağlanır → opaklık modifier'ları çalışır (bg-kr/10).
 */
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // marka çapaları (ham)
        midnight: '#0a1628',
        cobalt: '#2e54e8',
        paper: '#f5f7fa',

        // semantic (HSL kanal → hsl(var()))
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          muted: 'hsl(var(--surface-muted))',
        },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },

        // KonsRücü teal aksanı
        kr: {
          DEFAULT: 'hsl(var(--kr))',
          foreground: 'hsl(var(--kr-foreground))',
          soft: 'hsl(var(--kr-soft))',
          ink: 'hsl(var(--kr-ink))',
        },

        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        border: 'hsl(var(--border))',
        'border-subtle': 'hsl(var(--border-subtle))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',

        success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))', soft: 'hsl(var(--success-soft))' },
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))', soft: 'hsl(var(--warning-soft))' },
        danger: { DEFAULT: 'hsl(var(--danger))', foreground: 'hsl(var(--danger-foreground))', soft: 'hsl(var(--danger-soft))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        info: { DEFAULT: 'hsl(var(--info))', foreground: 'hsl(var(--info-foreground))', soft: 'hsl(var(--info-soft))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: '12px',
        '2xl': '16px',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        wordmark: ['var(--font-wordmark)'],
        body: ['var(--font-body)'],
        sans: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      letterSpacing: {
        brand: '-0.035em',
        'brand-tight': '-0.03em',
        label: '0.16em',
      },
      boxShadow: {
        card: '0 1px 2px rgba(10,22,40,.05)',
        pop: '0 8px 24px rgba(10,22,40,.12)',
        float: '0 12px 32px rgba(10,25,41,.16)',
        mock: '0 30px 80px -30px rgba(10,22,40,.35), 0 8px 24px rgba(10,22,40,.06)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22,1,0.36,1)',
      },
    },
  },
  plugins: [],
}

export default config
