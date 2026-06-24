import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#10131a',
          dim: '#10131a',
          bright: '#363941',
        },
        'surface-container': {
          lowest: '#0b0e15',
          low: '#191b23',
          DEFAULT: '#1d2027',
          high: '#272a31',
          highest: '#32353c',
        },
        'on-surface': {
          DEFAULT: '#e1e2ec',
          variant: '#c2c6d6',
        },
        outline: {
          DEFAULT: '#8c909f',
          variant: '#424754',
        },
        primary: {
          DEFAULT: '#adc6ff',
          on: '#002e6a',
          container: '#4d8eff',
          'on-container': '#00285d',
        },
        secondary: {
          DEFAULT: '#ddb7ff',
          on: '#490080',
          container: '#6f00be',
          'on-container': '#d6a9ff',
        },
        error: {
          DEFAULT: '#ffb4ab',
          on: '#690005',
          container: '#93000a',
          'on-container': '#ffdad6',
        },
        accent: {
          green: '#10b981',
        }
      },
      fontFamily: {
        display: ['var(--font-outfit)', 'sans-serif'],
        body: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
      },
    },
  },
  plugins: [],
};
export default config;
