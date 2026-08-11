/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Every colour resolves through a CSS variable so a single `data-theme`
        // swap re-skins the whole app with no duplicated utility classes.
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        sunken: 'rgb(var(--c-sunken) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-soft': 'rgb(var(--c-line-soft) / <alpha-value>)',

        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--c-ink-soft) / <alpha-value>)',
        'ink-faint': 'rgb(var(--c-ink-faint) / <alpha-value>)',

        brand: {
          DEFAULT: 'rgb(var(--c-brand) / <alpha-value>)',
          soft: 'rgb(var(--c-brand-soft) / <alpha-value>)',
          deep: 'rgb(var(--c-brand-deep) / <alpha-value>)'
        },
        saffron: 'rgb(var(--c-saffron) / <alpha-value>)',
        jade: 'rgb(var(--c-jade) / <alpha-value>)',
        gold: 'rgb(var(--c-gold) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',

        bubble: 'rgb(var(--c-bubble) / <alpha-value>)',
        'bubble-own': 'rgb(var(--c-bubble-own) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Fraunces', 'Playfair Display', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }]
      },
      borderRadius: {
        '4xl': '1.75rem'
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        float: 'var(--shadow-float)',
        pop: 'var(--shadow-pop)',
        glow: '0 0 0 1px rgb(var(--c-brand) / 0.25), 0 8px 28px -10px rgb(var(--c-brand) / 0.35)'
      },
      backgroundImage: {
        'brand-sheen': 'linear-gradient(135deg, rgb(var(--c-brand)) 0%, rgb(var(--c-brand-deep)) 100%)',
        'saffron-sheen': 'linear-gradient(135deg, rgb(var(--c-saffron)) 0%, rgb(var(--c-brand)) 100%)'
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
        snap: 'cubic-bezier(0.32, 0.72, 0, 1)'
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.94)' },
          '60%': { transform: 'scale(1.02)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        },
        'typing-dot': {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.35' },
          '30%': { transform: 'translateY(-4px)', opacity: '1' }
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '0.7' },
          '100%': { transform: 'scale(2.2)', opacity: '0' }
        },
        breathe: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' }
        },
        'burst': {
          '0%': { transform: 'scale(0.4)', opacity: '0' },
          '45%': { transform: 'scale(1.35)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        },
        'spark': {
          '0%': { transform: 'scale(0) translate(0,0)', opacity: '1' },
          '100%': { transform: 'scale(1) translate(var(--dx), var(--dy))', opacity: '0' }
        },
        'lift': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-1px)' }
        },
        'count-up': {
          '0%': { transform: 'translateY(0.4em)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        'send-off': {
          '0%': { transform: 'translate(0,0) scale(1)', opacity: '1' },
          '100%': { transform: 'translate(6px,-6px) scale(0.8)', opacity: '0' }
        }
      },
      animation: {
        'fade-up': 'fade-up 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pop-in': 'pop-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.8s infinite',
        'typing-dot': 'typing-dot 1.2s infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        breathe: 'breathe 2.4s ease-in-out infinite',
        burst: 'burst 0.34s cubic-bezier(0.22, 1, 0.36, 1) both',
        spark: 'spark 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'count-up': 'count-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        'send-off': 'send-off 0.32s cubic-bezier(0.4, 0, 1, 1) forwards'
      }
    }
  },
  plugins: []
};
