import type { Config } from 'tailwindcss';

/**
 * Hirobius Studio — Tailwind config.
 *
 * Bound to the canonical HDS tokens via CSS custom properties. The actual
 * values come from src/styles/tokens.generated.css (imported in globals.css),
 * which is generated from the parent's hirobius.tokens.json on `pnpm tokens`.
 *
 * Do NOT hardcode hex values here. If a token is missing from the canonical
 * set, add it to hirobius.tokens.json upstream.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--semantic-color-surface-page)',
        raised: 'var(--semantic-color-surface-raised)',
        overlay: 'var(--semantic-color-surface-overlay)',
        inverse: 'var(--semantic-color-surface-inverse)',
        accent: 'var(--semantic-color-surface-accent)',
        accentSubtle: 'var(--semantic-color-surface-accentSubtle)',

        primary: 'var(--semantic-color-content-primary)',
        secondary: 'var(--semantic-color-content-secondary)',
        disabled: 'var(--semantic-color-content-disabled)',
        onAccent: 'var(--semantic-color-content-onAccent)',
        contentAccent: 'var(--semantic-color-content-accent)',

        borderDefault: 'var(--semantic-color-border-default)',
        borderSubtle: 'var(--semantic-color-border-subtle)',
        borderStrong: 'var(--semantic-color-border-strong)',
        borderAccent: 'var(--semantic-color-border-accent)',

        error: 'var(--semantic-color-feedback-error)',
        success: 'var(--semantic-color-feedback-success)',
        warning: 'var(--semantic-color-feedback-warning)',
      },
      fontFamily: {
        display: ['"Clash Display"', '"Inter"', 'system-ui', 'sans-serif'],
        body: ['"Satoshi"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Geist Mono"', '"Courier New"', 'monospace'],
      },
      fontSize: {
        // Tied to HDS type ramp (semantic.typography.*) with line-height + weight defaults.
        // The clamp() values for display/h1/h2/h3 live in globals.css :root.
        display: ['var(--semantic-typography-display-font-size)', { lineHeight: '1.0', fontWeight: '500', letterSpacing: '-0.03em' }],
        h1: ['var(--semantic-typography-h1-font-size)', { lineHeight: '1.05', fontWeight: '500', letterSpacing: '-0.02em' }],
        h2: ['var(--semantic-typography-h2-font-size)', { lineHeight: '1.15', fontWeight: '500', letterSpacing: '-0.015em' }],
        h3: ['var(--semantic-typography-h3-font-size)', { lineHeight: '1.3', fontWeight: '500', letterSpacing: '-0.01em' }],
        body: ['17px', { lineHeight: '1.5', fontWeight: '400' }],
        ui: ['15px', { lineHeight: '1.4', fontWeight: '500' }],
        eyebrow: ['13px', { lineHeight: '1.2', fontWeight: '500', letterSpacing: '0.08em' }],
        mono: ['13px', { lineHeight: '1.4', fontWeight: '400' }],
      },
      borderRadius: {
        action: '12px',     // semantic.radius.action — buttons, inputs, badges
        container: '8px',   // primitive.radius.8 — cards, sheets, modals
      },
      maxWidth: {
        prose: '60ch',
        editorial: '72ch',
      },
    },
  },
  plugins: [],
};

export default config;
