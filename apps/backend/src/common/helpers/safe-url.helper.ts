import ipaddr from 'ipaddr.js';
import dns from 'node:dns/promises';
import { withGuardedDispatcher } from './guarded-dispatcher';

export type UnsafeUrlReason =
  | 'invalid-url'
  | 'protocol'
  | 'internal-host'
  | 'private-ipv4'
  | 'private-ipv6'
  /** Hostname produced no usable public address (NXDOMAIN, empty answers, or DNS failure). */
  | 'dns-unresolvable'
  | 'too-many-redirects';

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
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** Every hop is re-checked, so this bounds cost rather than exposure. */
const MAX_REDIRECT_HOPS = 5;

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

/**
 * `fetch` for a user-supplied URL, guarding every hop rather than only the first.
 *
 * `assertPublicHttpUrl` vets one URL, but `fetch` follows redirects by itself, so a
 * public host answering 302 with `http://169.254.169.254/` would still be requested.
 * The method and body are replayed on each hop: dropping them the way `redirect: follow`
 * does for 301/302/303 would silently deliver an empty request instead of the payload.
 *
 * @throws {UnsafeUrlError}
 */
export async function fetchPublicUrl(
  rawUrl: string,
  init: RequestInit,
  options?: SafeUrlOptions
): Promise<Response> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    await assertPublicHttpUrl(currentUrl, options);

    const response = await fetch(
      currentUrl,
      withGuardedDispatcher({ ...init, redirect: 'manual' })
    );
    const location = response.headers.get('location');
    if (!REDIRECT_STATUSES.has(response.status) || !location) {
      return response;
    }

    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new UnsafeUrlError('too-many-redirects', rawUrl);
}

/** No-op for anything that is not an IPv4 literal. @throws {UnsafeUrlError} */
export function assertNotPrivateIpv4(hostname: string, sourceUrl: string): void {
  if (isPrivateIpv4(hostname)) {
    throw new UnsafeUrlError('private-ipv4', sourceUrl);
  }
}

/** False for anything that is not an IPv4 literal, so callers can pass any hostname. */
export function isPrivateIpv4(hostname: string): boolean {
  const ipv4 = hostname.match(IPV4_LITERAL);
  if (!ipv4) {
    return false;
  }

  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 shared
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    a >= 240 // 240.0.0.0/4 reserved
  );
}

/**
 * True for every IPv6 form an outbound request must not reach.
 *
 * Classified rather than prefix-matched: `fe80::/10` runs to `febf:`, so testing for the
 * literal `fe80:` let `fe81::1` through, and `::ffff:127.0.0.1` reaches loopback through
 * the IPv4 stack while matching no prefix at all. Anything ipaddr.js does not call plain
 * `unicast` is refused, which also covers multicast, 6to4, Teredo and reserved space --
 * all of which can name an internal destination.
 */
export function isPrivateIpv6(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    // Deprecated forms such as `::127.0.0.1` do not parse. Unclassifiable is not
    // provably public, and this guard exists to fail closed.
    return true;
  }

  if (parsed.kind() === 'ipv4') {
    return isPrivateIpv4(address);
  }

  const ipv6 = parsed as ipaddr.IPv6;
  const range = ipv6.range();
  if (range === 'ipv4Mapped') {
    // The wrapped address decides, so `::ffff:8.8.8.8` stays usable while
    // `::ffff:127.0.0.1` and its hex spelling `::ffff:7f00:1` do not.
    return isPrivateIpv4(ipv6.toIPv4Address().toString());
  }

  return range !== 'unicast';
}
