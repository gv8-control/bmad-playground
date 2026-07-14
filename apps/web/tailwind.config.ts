import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent:       'transparent',
      current:           'currentColor',
      bg:               '#0D0D11',
      surface:          '#16161C',
      'surface-raised': '#1E1E26',
      border:           '#2B2B38',
      'border-subtle':  '#232330',
      'text-1':         '#EDECF5',
      'text-2':         '#8D8CA0',
      'text-3':         '#56556A',
      accent:           '#7B6EE8',
      'accent-hover':   '#9083F2',
      'accent-fg':      '#FFFFFF',
      positive:         '#3ECF8E',
      'positive-bg':    'rgba(62,207,142,0.08)',
      caution:          '#F2A944',
      'caution-bg':     'rgba(242,169,68,0.08)',
      negative:         '#F06B6B',
      'negative-bg':    'rgba(240,107,107,0.08)',
      overlay:          'rgba(0,0,0,0.65)',
    },
    fontFamily: {
      sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      mono: ['JetBrains Mono', 'Fira Mono', 'monospace'],
    },
    fontWeight: {
      regular: '400',
      medium: '500',
      semibold: '600',
    },
    borderRadius: {
      DEFAULT: '4px',
      sm:   '4px',
      md:   '8px',
      lg:   '12px',
      xl:   '16px',
      '2xl': '24px',
      full: '9999px',
    },
    extend: {
      fontSize: {
        xs:    ['0.75rem',  { lineHeight: '1rem' }],
        sm:    ['0.875rem', { lineHeight: '1.25rem' }],
        base:  ['1rem',     { lineHeight: '1.5rem' }],
        lg:    ['1.125rem', { lineHeight: '1.75rem' }],
        xl:    ['1.25rem',  { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem',   { lineHeight: '2rem' }],
      },
      boxShadow: {
        floating: '0 8px 24px rgba(0,0,0,0.4)',
      },
      spacing: {
        '1':  '4px',
        '2':  '8px',
        '3':  '12px',
        '4':  '16px',
        '5':  '20px',
        '6':  '24px',
        '8':  '32px',
        '10': '40px',
        '12': '48px',
        '16': '64px',
      },
    },
  },
  plugins: [],
};

export default config;
