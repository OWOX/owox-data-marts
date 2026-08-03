import dns from 'node:dns/promises';

export type UnsafeUrlReason =
  | 'invalid-url'
  | 'protocol'
  | 'internal-host'
  | 'private-ipv4'
  | 'private-ipv6'
  /** Hostname produced no usable public address (NXDOMAIN, empty answers, or DNS failure). */
  | 'dns-unresolvable';

export class UnsafeUrlError extends Error {
  constructor(
    readonly reason: UnsafeUrlReason,
    readonly url: string
  ) {
    super(`Unsafe URL (${reason}): ${url}`);
    this.name = 'UnsafeUrlError';
  }
}

export interface SafeUrlOptions {
  /** Defaults to ['http:', 'https:']. Plugin delivery URLs pass ['https:']. */
  readonly allowedProtocols?: readonly string[];
}

const DEFAULT_PROTOCOLS = ['http:', 'https:'] as const;
const IPV4_LITERAL = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Guards outbound requests to user-supplied URLs against SSRF.
 *
 * Without this, a caller can point us at `http://169.254.169.254/` (cloud metadata,
 * which returns service-account credentials) or at internal services that trust the
 * network perimeter. Both the literal hostname and every address it resolves to are
 * checked, so a public hostname whose DNS record points inside is rejected too.
 *
 * Fail closed on DNS: a name that does not resolve is refused rather than deferred to
 * whatever `fetch` later happens to get. That skips the private-IP check and is how a
 * flaky or adversarial resolver can smuggle an internal hop past the guard.
 *
 * @throws {UnsafeUrlError}
 */
export async function assertPublicHttpUrl(rawUrl: string, options?: SafeUrlOptions): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError('invalid-url', rawUrl);
  }

  const allowedProtocols = options?.allowedProtocols ?? DEFAULT_PROTOCOLS;
  if (!allowedProtocols.includes(url.protocol)) {
    throw new UnsafeUrlError('protocol', rawUrl);
  }

  // Strip IPv6 brackets (e.g. [::1] -> ::1)
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1') {
    throw new UnsafeUrlError('internal-host', rawUrl);
  }

  // Literals never need DNS: either they are already known-private, or known-public.
  if (IPV4_LITERAL.test(hostname)) {
    assertNotPrivateIpv4(hostname, rawUrl);
    return url;
  }

  if (hostname.includes(':')) {
    if (isPrivateIpv6(hostname)) {
      throw new UnsafeUrlError('private-ipv6', rawUrl);
    }
    return url;
  }

  // One family failing (ENOTFOUND for A when only AAAA exists) is normal. Failing both
  // — or receiving empty answers — means we never inspected an address, so we refuse.
  const ipv4Addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
  const ipv6Addresses = await dns.resolve6(hostname).catch(() => [] as string[]);

  if (ipv4Addresses.length === 0 && ipv6Addresses.length === 0) {
    throw new UnsafeUrlError('dns-unresolvable', rawUrl);
  }

  for (const address of ipv4Addresses) {
    assertNotPrivateIpv4(address, rawUrl);
  }

  for (const address of ipv6Addresses) {
    if (isPrivateIpv6(address)) {
      throw new UnsafeUrlError('private-ipv6', rawUrl);
    }
  }

  return url;
}

/** No-op for anything that is not an IPv4 literal. @throws {UnsafeUrlError} */
export function assertNotPrivateIpv4(hostname: string, sourceUrl: string): void {
  const ipv4 = hostname.match(IPV4_LITERAL);
  if (!ipv4) {
    return;
  }

  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  const isPrivate =
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 shared
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    a >= 240; // 240.0.0.0/4 reserved

  if (isPrivate) {
    throw new UnsafeUrlError('private-ipv4', sourceUrl);
  }
}

/** True for ::1, ::, fe80::/10 and fc00::/7. */
export function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  );
}
