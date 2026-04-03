/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#9d2235',
        ink: '#1a1a1a',
        soft: '#f8f4f4'
      },
      borderRadius: {
        xl2: '1.25rem'
      },
      boxShadow: {
        glass: '0 10px 30px rgba(157, 34, 53, 0.08)'
      },
      fontFamily: {
        sans: ['Poppins', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    }
  },
  plugins: []
};
