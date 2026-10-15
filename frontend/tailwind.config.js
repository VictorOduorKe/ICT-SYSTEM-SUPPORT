/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Flat solid design system tokens (NO GRADIENTS)
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb', // Primary brand color
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        surface: {
          base: 'var(--color-surface-base)',
          card: 'var(--color-surface-card)',
          hover: 'var(--color-surface-hover)',
          border: 'var(--color-surface-border)',
        },
        content: {
          primary: 'var(--color-content-primary)',
          secondary: 'var(--color-content-secondary)',
          muted: 'var(--color-content-muted)',
          inverse: 'var(--color-content-inverse)',
        },
        status: {
          pending: '#d97706',      // Solid amber
          'pending-bg': '#fef3c7',
          'pending-dark': '#78350f',
          inprogress: '#2563eb',   // Solid blue
          'inprogress-bg': '#dbeafe',
          'inprogress-dark': '#1e3a8a',
          resolved: '#059669',     // Solid emerald
          'resolved-bg': '#d1fae5',
          'resolved-dark': '#064e3b',
          cancelled: '#e11d48',    // Solid rose
          'cancelled-bg': '#ffe4e6',
          'cancelled-dark': '#881337',
        },
      },
      backgroundImage: {
        // Enforce solid rule: explicitly prevent gradient generation
        none: 'none',
      },
    },
  },
  plugins: [],
};
