import type * as FsNS from '@tauri-apps/api/fs';
import type * as PathNS from '@tauri-apps/api/path';
import { isTauri } from './env';

export type TauriApis = {
  fs: Pick<typeof import('@tauri-apps/api/fs'), 'readTextFile' | 'writeTextFile' | 'exists' | 'BaseDirectory' | 'createDir' | 'readBinaryFile' | 'writeBinaryFile' | 'removeFile'>;
  path: Pick<typeof import('@tauri-apps/api/path'), 'appDataDir' | 'join'>;
  isTauri: boolean;
};

export async function getApis(): Promise<TauriApis> {
  if (isTauri()) {
    const fs = await import('@tauri-apps/api/fs');
    const path = await import('@tauri-apps/api/path');
    return { fs, path, isTauri: true } as any;
  }
  const fs: Partial<FsNS> = {
    readTextFile: async () => '',
    writeTextFile: async () => {},
    exists: async () => false,
    createDir: async () => {},
    readBinaryFile: async () => new Uint8Array(),
    writeBinaryFile: async () => {},
    removeFile: async () => {},
    BaseDirectory: {} as any,
  };
  const path: Partial<PathNS> = {
    appDataDir: async () => '/',
    join: async (...parts: string[]) => parts.join('/'),
  };
  return { fs: fs as any, path: path as any, isTauri: false };
}
