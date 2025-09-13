import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@tauri-apps/api/fs': path.resolve(__dirname, 'src/tauri-fs-impl.ts'),
      '@tauri-apps/plugin-stronghold': path.resolve(__dirname, 'src/tauri-stronghold-stub.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts', './tests/vitest.setup.ts'],
  },
  server: {
    port: 5173,
  },
});
