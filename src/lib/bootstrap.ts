import { getApis } from './tauri-safe';
import { deriveKey } from './crypto';
import { initDb } from './db';

let appDir = '';
let sessionKey: Uint8Array | null = null;

export async function bootstrap(): Promise<void> {
  try {
    const api = await getApis();

    if (api.isTauri) {
      try {
        const { once } = await import('@tauri-apps/api/event');
        await Promise.race([
          once('tauri://ready'),
          new Promise((r) => setTimeout(r, 800)),
        ]);
      } catch (e) {
        console.warn('wait tauri ready failed (ignored):', e);
      }
    }

    appDir = await api.path.appDataDir();
    await initDb(appDir);
    await api.fs.createDir(await api.path.join(appDir, 'data', 'docs'), { recursive: true });
    const saltPath = await api.path.join(appDir, 'master_salt');
    let salt: Uint8Array;
    if (await api.fs.exists(saltPath)) {
      salt = new Uint8Array(await api.fs.readBinaryFile(saltPath));
      const pwd = prompt('Enter master password') || '';
      sessionKey = await deriveKey(pwd, salt);
    } else {
      salt = crypto.getRandomValues(new Uint8Array(16));
      const pwd = prompt('Set master password') || '';
      sessionKey = await deriveKey(pwd, salt);
      await api.fs.writeBinaryFile(saltPath, salt);
    }
  } catch (e) {
    console.error('bootstrap failed (will not block UI):', e);
  }
}

export function getAppDir() {
  return appDir;
}

export function getSessionKey() {
  return sessionKey;
}
