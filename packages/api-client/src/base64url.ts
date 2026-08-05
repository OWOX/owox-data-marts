/**
 * base64url without `node:buffer`.
 *
 * This package runs inside a plugin iframe as well as in Node, and a single
 * `node:buffer` import is enough to break the browser build. `btoa`/`atob` are globals
 * in Node 22 and in every browser, so this needs no polyfill and no dependency.
 */

export function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBase64Url(value: string): string {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}
