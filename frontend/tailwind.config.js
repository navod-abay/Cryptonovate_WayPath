/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/dispatcher/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/driver/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/loader/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/store_manager/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          500: '#0284c7',
          900: '#0c4a6e',
        }
      },
    },
  },
  plugins: [],
}
