import type { Config } from 'tailwindcss';

export default {
  darkMode: ['variant', '&:where([data-theme="dark"], [data-theme="dark"] *)'],
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter Variable',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono Variable',
          'JetBrains Mono',
          'ui-monospace',
          'SF Mono',
          'Menlo',
          'Cascadia Code',
          'Consolas',
          'DejaVu Sans Mono',
          'monospace',
        ],
      },
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        'text-subtle': 'var(--text-subtle)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        imessage: 'var(--imessage)',
        sms: 'var(--sms)',
        'wa-out': 'var(--wa-out)',
        'wa-out-text': 'var(--wa-out-text)',
        'wa-accent': 'var(--wa-accent)',
        success: 'var(--success)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '180ms',
        medium: '240ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.25, 1, 0.5, 1)',
        emphasized: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
