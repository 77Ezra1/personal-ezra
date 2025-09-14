import { vi } from 'vitest';

vi.mock('@tauri-apps/api/fs', () => ({
  readTextFile: vi.fn(),
  writeFile: vi.fn(),
  createDir: vi.fn(),
  exists: vi.fn().mockResolvedValue(true),
  BaseDirectory: { AppData: 'AppData' },
}));
vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('C:/mock/AppData/pms-web'),
  join: vi.fn().mockImplementation((...parts: string[]) => parts.join('/')),
}));
vi.mock('@tauri-apps/plugin-sql', () => ({
  Database: { load: vi.fn().mockResolvedValue({ execute: vi.fn(), select: vi.fn() }) }
}));
vi.mock('../src/lib/crypto', () => ({
  encryptString: vi.fn(async (_k: Uint8Array, v: string) => v),
  decryptString: vi.fn(async (_k: Uint8Array, v: string) => v),
}));
import { Blob } from 'node:buffer';
(globalThis as any).Blob = Blob;
