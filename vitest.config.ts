import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@backend': path.resolve(__dirname, './backend'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
