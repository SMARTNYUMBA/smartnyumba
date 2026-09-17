/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#060810', 900: '#0C1117', 800: '#131B27',
          700: '#1D2837', 600: '#283548', 500: '#374559',
        },
        brand: {
          50:'#FFFBEB', 100:'#FEF3C7', 200:'#FDE68A', 300:'#FCD34D',
          400:'#FBBF24', 500:'#F59E0B', 600:'#D97706', 700:'#B45309',
          800:'#92400E', 900:'#78350F',
        },
        canvas: {
          50:'#FAFAF8', 100:'#F5F4F0', 200:'#ECEAE4', 300:'#D9D6CE',
        },
        success: { light:'#DCFCE7', DEFAULT:'#16A34A', dark:'#15803D' },
        warning: { light:'#FFF7ED', DEFAULT:'#EA580C', dark:'#C2410C' },
        danger:  { light:'#FFF1F2', DEFAULT:'#E11D48', dark:'#BE123C' },
        info:    { light:'#EFF6FF', DEFAULT:'#2563EB', dark:'#1D4ED8' },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans:    ['Outfit', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'card':  '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.06)',
        'modal': '0 20px 60px rgba(0,0,0,0.2), 0 8px 20px rgba(0,0,0,0.1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease',
        'slide-up': 'slideUp 0.28s ease',
        'skeleton': 'skeleton 1.6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:   { from:{opacity:0}, to:{opacity:1} },
        slideUp:  { from:{opacity:0,transform:'translateY(10px)'}, to:{opacity:1,transform:'translateY(0)'} },
        skeleton: { '0%,100%':{opacity:1}, '50%':{opacity:0.4} },
      },
    },
  },
  plugins: [],
}
