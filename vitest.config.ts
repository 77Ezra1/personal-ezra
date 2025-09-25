import { createRequire } from 'module';
import path from 'path';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);
const jsYamlEntry = require.resolve('js-yaml');

export default defineConfig({
  resolve: {
    alias: {
      '@tauri-apps/plugin-stronghold': path.resolve(
        __dirname,
        'src/tauri-stronghold-stub.ts'
      ),
      '@tauri-apps/plugin-fs': path.resolve(__dirname, 'src/tauri-fs-stub.ts'),
      'js-yaml': jsYamlEntry,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts', './tests/vitest.setup.ts'],
  },
});
