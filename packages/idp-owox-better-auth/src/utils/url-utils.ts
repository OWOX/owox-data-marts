/**
 * Returns true if the host string is localhost or 127.0.0.1.
 */
export function isLocalhost(host?: string): boolean {
  return host === 'localhost' || host === '127.0.0.1';
}

/**
 * Returns true when the protocol + hostname pair represents a secure origin.
 * @param protocol - URL-style protocol string (e.g. 'https:')
 * @param hostname - hostname string (e.g. 'example.com')
 */
export function isSecureOrigin(protocol: string, hostname: string): boolean {
  return protocol === 'https:' && !isLocalhost(hostname);
}

/**
 * Extracts normalized origin from a URL string, returns null on failure.
 */
export function tryNormalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
