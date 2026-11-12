/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        card: '#1f1f1f',
        digit: '#b3b3b3',
        muted: '#9a9a9a',
        faint: '#8a8a8a',
        ink: '#e6e6e6',
        accent: '#F5B83D',
      },
      fontFamily: {
        outfit: ['Outfit_400Regular'],
        'outfit-medium': ['Outfit_500Medium'],
        'outfit-semibold': ['Outfit_600SemiBold'],
      },
    },
  },
  plugins: [],
};
