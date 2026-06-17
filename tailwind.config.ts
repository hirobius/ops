import tokens from './tailwind.config.tokens.cjs';

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: tokens.theme.extend,
  },
};
