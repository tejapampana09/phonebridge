/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      colors: {
        primary: '#1C1C1C',
        sidebar: '#252525',
        card: '#2D2D2D',
        hover: '#333333',
        accent: '#7B68EE',
        'accent-dark': '#6A5ACD',
        border: '#3A3A3A',
        muted: '#999999',
        dim: '#666666'
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
