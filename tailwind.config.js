/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0b0d1a',
          panel: '#151830',
          accent: '#7c5cff',
          accent2: '#00d4ff',
        },
      },
    },
  },
  plugins: [],
};

