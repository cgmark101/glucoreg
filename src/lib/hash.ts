const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const ALGORITHM = 'PBKDF2';
const HASH = 'SHA-256';

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str: string): ArrayBuffer {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - normalized.length % 4);
  const bin = atob(normalized + padding);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), ALGORITHM, false, ['deriveBits']);
  const buf = salt.buffer as unknown as ArrayBuffer;
  const derived = await crypto.subtle.deriveBits(
    { name: ALGORITHM, salt: buf, iterations: ITERATIONS, hash: HASH },
    key,
    KEY_LENGTH * 8,
  );
  return `${base64url(buf)}.${base64url(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split('.');
  if (!saltB64 || !hashB64) return false;
  const salt = base64urlDecode(saltB64);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), ALGORITHM, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: ALGORITHM, salt, iterations: ITERATIONS, hash: HASH },
    key,
    KEY_LENGTH * 8,
  );
  return base64url(derived) === hashB64;
}
