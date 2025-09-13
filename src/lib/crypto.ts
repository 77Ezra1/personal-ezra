import { argon2id } from 'hash-wasm';
import { gcm } from '@noble/ciphers/aes';

function b64encode(data: Uint8Array) {
  return btoa(String.fromCharCode(...data));
}

function b64decode(str: string) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

export async function deriveKey(password: string, salt: Uint8Array) {
  const hash = await argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 64 * 1024,
    hashLength: 32,
    outputType: 'binary',
  });
  return new Uint8Array(hash);
}

export async function encryptWithPassword(password: string, plaintext: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aes = gcm(key, nonce);
  const cipher = aes.encrypt(new TextEncoder().encode(plaintext));
  return { ciphertext: b64encode(cipher), nonce: b64encode(nonce), salt: b64encode(salt) };
}

export async function decryptWithPassword(password: string, data: { ciphertext: string; nonce: string; salt: string }) {
  const salt = b64decode(data.salt);
  const key = await deriveKey(password, salt);
  const nonce = b64decode(data.nonce);
  const cipher = b64decode(data.ciphertext);
  const aes = gcm(key, nonce);
  const plain = aes.decrypt(cipher);
  return new TextDecoder().decode(plain);
}

export async function encryptString(key: Uint8Array, plaintext: string) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = gcm(key, nonce).encrypt(new TextEncoder().encode(plaintext));
  return JSON.stringify({ ciphertext: b64encode(cipher), nonce: b64encode(nonce) });
}

export async function decryptString(key: Uint8Array, data: string) {
  const { ciphertext, nonce } = JSON.parse(data);
  const plain = gcm(key, b64decode(nonce)).decrypt(b64decode(ciphertext));
  return new TextDecoder().decode(plain);
}
