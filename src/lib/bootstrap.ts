import { appDataDir, join } from '@tauri-apps/api/path';
import { exists, createDir, readBinaryFile, writeBinaryFile } from '@tauri-apps/api/fs';
import { initDb } from './db';
import { deriveKey } from './crypto';

let appDir = '';
let sessionKey: Uint8Array | null = null;

export async function bootstrap() {
  appDir = await appDataDir();
  await initDb(appDir);
  await createDir(await join(appDir, 'data', 'docs'), { recursive: true });
  const saltPath = await join(appDir, 'master_salt');
  let salt: Uint8Array;
  if (await exists(saltPath)) {
    salt = new Uint8Array(await readBinaryFile(saltPath));
    const pwd = prompt('Enter master password') || '';
    sessionKey = await deriveKey(pwd, salt);
  } else {
    salt = crypto.getRandomValues(new Uint8Array(16));
    const pwd = prompt('Set master password') || '';
    sessionKey = await deriveKey(pwd, salt);
    await writeBinaryFile(saltPath, salt);
  }
}

export function getAppDir() {
  return appDir;
}

export function getSessionKey() {
  return sessionKey;
}
