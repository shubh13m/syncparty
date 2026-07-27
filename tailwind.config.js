/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: 'rgb(var(--brand-bg) / <alpha-value>)',
          panel: 'rgb(var(--brand-panel) / <alpha-value>)',
          hover: 'rgb(var(--brand-hover) / <alpha-value>)',
          border: 'rgb(var(--brand-border) / <alpha-value>)',
          muted: 'rgb(var(--brand-muted) / <alpha-value>)',
          text: 'rgb(var(--brand-text) / <alpha-value>)',
          accent: 'rgb(var(--brand-accent) / <alpha-value>)',
          'accent-fg': 'rgb(var(--brand-accent-fg) / <alpha-value>)',
          accent2: 'rgb(var(--brand-accent2) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['InterVariable', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

