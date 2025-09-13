import { vi } from 'vitest';

vi.mock('@tauri-apps/api/fs', () => ({
  readBinaryFile: vi.fn(),
  writeBinaryFile: vi.fn(),
  createDir: vi.fn(),
  removeFile: vi.fn(),
  exists: vi.fn(),
}));

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn(async () => '/tmp/'),
  join: (...args: string[]) => args.join('/'),
}));

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn(async () => ({
      execute: vi.fn(),
      select: vi.fn(async () => []),
    })),
  },
}));

vi.mock('./src/lib/crypto', () => ({
  encryptString: vi.fn(async (_k: Uint8Array, v: string) => v),
  decryptString: vi.fn(async (_k: Uint8Array, v: string) => v),
  deriveKey: vi.fn(),
  encryptWithPassword: vi.fn(),
  decryptWithPassword: vi.fn(),
}));

import { Blob } from 'node:buffer';
(globalThis as any).Blob = Blob;
