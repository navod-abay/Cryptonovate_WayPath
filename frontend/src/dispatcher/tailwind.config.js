/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          500: '#0284c7',
          900: '#0c4a6e',
        },
      },
    },
  },
  plugins: [],
};
