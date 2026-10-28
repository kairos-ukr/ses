module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      screens: {
        // Телефон у альбомній орієнтації: низький екран — компактніші панелі
        short: { raw: '(max-height: 500px)' },
      },
    },
  },
  plugins: [],
}
