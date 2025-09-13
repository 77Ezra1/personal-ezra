import { mkdir, writeFile, readFile, remove, exists } from '@tauri-apps/plugin-fs';

export const createDir = mkdir;
export const writeBinaryFile = writeFile;
export const readBinaryFile = readFile;
export const removeFile = remove;
export { exists };
