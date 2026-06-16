import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Dedicated Vitest config (separate from vite.config.ts so the dev server
// config — host/proxy/etc. — stays untouched). Uses jsdom so component tests
// can render React + react-router and read/write localStorage.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
