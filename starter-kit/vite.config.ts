import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Ensure a single React instance shared with the parent package
    dedupe: ['react', 'react-dom'],
    alias: {
      // Re-map @/ for any parent source files transitively imported
      '@': path.resolve(__dirname, '../src'),
    },
  },
  server: {
    port: 3001,
  },
});
