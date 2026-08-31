/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// NOTE: node:dns/promises is loaded through a LAZY DYNAMIC import, deliberately,
// and must not be converted back to a top-level `import ... from`.
//
// The connector bundle is assembled by ConnectorBuilder.processEntityFile
// (vite.config.js), which concatenates every Core file into a single scope and
// STRIPS every line starting with `import`. SsrfGuard is the only Core file that
// imports a node builtin, so a static import here silently vanished from dist/
// and left `dnsLookup(...)` referencing nothing. The resulting ReferenceError
// was swallowed by _assertResolvesToPublic's former bare catch, which failed
// OPEN -- so in the SHIPPED BUNDLE the resolve-and-validate check never ran at
// all, while every unit test (importing this ESM source directly) stayed green.
//
// A dynamic import is not at the start of a line, so the stripper leaves it
// alone, and source and bundle now execute the exact same path.
//
// `redactUrl` is a different case and a STATIC import is correct for it: it is a
// Core file, so the bundler concatenates its (hoisted) declaration into the same
// scope and stripping this line leaves the call resolving fine — the same way
// every other Declarative file reaches Core symbols.
import { redactUrl } from '../AbstractSource.js';

let dnsLookupPromise;

async function defaultLookup(host) {
  dnsLookupPromise ??= import('node:dns/promises').then(m => m.lookup);
  const lookup = await dnsLookupPromise;
  return lookup(host, { all: true });
}

let localEgressWarned = false;
let localEgressRefusedWarned = false;

/**
 * Network egress boundary for declarative connectors. Every outbound URL the
 * Requester builds is validated here: scheme must be https, host must be on the
 * manifest-declared allowlist, and neither the literal host NOR any address it
 * resolves to may be a private, loopback, or link-local target (cloud metadata
 * at 169.254.169.254).
 *
 * DNS resolve-and-validate (assertAllowed/assertPublicHttps are async) closes the
 * static "public-hostname → internal-IP" DNS-rebinding vector: after the literal
 * checks pass, the host is resolved (all A/AAAA) and the request is rejected if
 * ANY resolved address is blocked.
 *
 * RESIDUAL (deferred): this validates the addresses resolved HERE, but the
 * subsequent fetch re-resolves the host independently, so a sub-second TTL rebind
 * between this check and connect is still theoretically possible. Full
 * anti-rebinding requires pinning the connection to the pre-validated IP at
 * socket-connect time (an undici Agent `connect.lookup` dispatcher). `undici` is
 * not a direct dependency of this package, so connection-time IP-pinning is
 * intentionally NOT implemented here; the manual per-hop re-validation in
 * AbstractSource.urlFetchWithRetry (redirects) plus this resolve-check cover the
 * practical cases.
 */
const BLOCKED_IPV4 = [
  /^127\./, // loopback
  /^10\./, // RFC1918
  /^192\.168\./, // RFC1918
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // RFC1918 172.16/12
  /^169\.254\./, // link-local (cloud metadata)
  /^0\./, // "this" network
  // CGNAT 100.64.0.0/10 (second octet 64-127). Not merely "reserved": it is
  // where Alibaba Cloud and OCI serve instance metadata (100.100.100.200),
  // and where GKE places several internal ranges.
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^198\.1[89]\./, // 198.18.0.0/15 benchmarking (RFC 2544)
  /^192\.0\.0\./, // 192.0.0.0/24 IETF protocol assignments
  /^(22[4-9]|23\d)\./, // 224.0.0.0/4 multicast
  /^255\.255\.255\.255$/, // limited broadcast
];

// IPv6 patterns. `URL.hostname` wraps literals in brackets (e.g. "[::1]"), but
// `dns.lookup` returns BARE addresses (e.g. "::1"), so these match an optional
// leading bracket to cover both call sites.
const BLOCKED_IPV6 = [
  /^\[?::1\]?$/i, // loopback
  // The unspecified address "::". Distinct from "::1" and NOT covered by that
  // pattern, which requires the trailing 1 -- on Linux a connect() to :: lands
  // on loopback, so it is a loopback bypass in practice.
  /^\[?::\]?$/i,
  /^\[?fe[89ab][0-9a-f]:/i, // link-local fe80::/10
  /^\[?fc[0-9a-f][0-9a-f]:/i, // unique-local fc00::/7
  /^\[?fd[0-9a-f][0-9a-f]:/i, // unique-local fc00::/7
  /^\[?::ffff:/i, // IPv4-mapped (covers mapped private IPv4)
  // NAT64 well-known prefix 64:ff9b::/96 embeds an arbitrary IPv4 address in
  // its low 32 bits, so on a network with a NAT64 gateway it is a direct route
  // to any blocked IPv4 target (64:ff9b::7f00:1 is 127.0.0.1).
  /^\[?64:ff9b::/i,
];

// Resolver failures that PROVE there is no address to connect to. For these the
// subsequent fetch will fail identically, so there is nothing to block and the
// clearer fetch-level DNS error is worth preserving. Every OTHER failure means
// "we do not know", and because fetch re-resolves independently it may well
// succeed where we failed -- so those must fail closed. See
// _assertResolvesToPublic.
const CONCLUSIVE_DNS_FAILURES = new Set(['ENOTFOUND', 'ENODATA']);

export class SsrfGuard {
  /**
   * True if `ip` is a private/loopback/link-local address. Accepts both the
   * bracketed form `URL.hostname` produces for IPv6 literals and the bare form
   * `dns.lookup` returns.
   * @param {string} ip
   * @returns {boolean}
   */
  static isBlockedIp(ip) {
    if (typeof ip !== 'string' || ip.length === 0) return false;
    // IPv6 if it contains a colon (bracketed or bare).
    if (ip.includes(':')) {
      return BLOCKED_IPV6.some(re => re.test(ip));
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      return BLOCKED_IPV4.some(re => re.test(ip));
    }
    return false;
  }

  /**
   * @param {string[]} allowedHosts - hostnames declared in the manifest
   * @param {{ lookup?: (host: string) => Promise<Array<{address:string,family:number}>> }} [deps]
   *   `lookup` is injectable for tests; defaults to a promisified
   *   `dns.lookup(host, { all: true })`.
   */
  constructor(allowedHosts = [], { lookup } = {}) {
    this.allowedHosts = new Set(allowedHosts.map(h => h.toLowerCase().replace(/\.$/, '')));
    this.lookup = lookup || defaultLookup;
  }

  /**
   * Test/dev egress relaxation. When OW_ALLOW_LOCAL_EGRESS==='1', SsrfGuard
   * drops the https-only + private/loopback IP checks (BUT keeps the manifest
   * host allowlist). Off by default; notes it once so it can never be silently on.
   *
   * Defense-in-depth: in production (NODE_ENV==='production') the flag is
   * always refused, even if set — a leaked/misconfigured env var can never
   * disable SSRF protection in prod. The refusal is logged once with a
   * distinct message, separate from the "honored" notice.
   *
   * Both notices deliberately use `console.log` (stdout), NOT `console.warn`/
   * `console.error` (stderr): the real connector-runner child process this
   * class runs inside has its stderr treated as an unconditional run FAILURE
   * signal by the backend (ConnectorOutputCaptureService.captureError wraps
   * every stderr line as an ERROR message, and ConnectorExecutorService
   * demotes a configuration's result to failed the moment ANY error message
   * is captured — see connector-executor.service.ts). These two lines are
   * informational-only (expected, one-time-per-process test/dev egress
   * notices, not a fault), so they must not surface as a run error merely
   * because OW_ALLOW_LOCAL_EGRESS was legitimately honored.
   * @returns {boolean}
   */
  static _allowLocalEgress() {
    const flagSet = process.env.OW_ALLOW_LOCAL_EGRESS === '1';
    if (!flagSet) return false;

    if (process.env.NODE_ENV === 'production') {
      if (!localEgressRefusedWarned) {
        localEgressRefusedWarned = true;
        // eslint-disable-next-line no-console
        console.log(
          '[SsrfGuard] OW_ALLOW_LOCAL_EGRESS ignored in production — SSRF protection remains enabled.'
        );
      }
      return false;
    }

    if (!localEgressWarned) {
      localEgressWarned = true;
      // eslint-disable-next-line no-console
      console.log(
        '[SsrfGuard] OW_ALLOW_LOCAL_EGRESS=1 — local/private egress is ALLOWED (test/dev only).'
      );
    }
    return true;
  }

  /**
   * @param {string} rawUrl
   * @throws if the URL is not allowed
   */
  async assertAllowed(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      // Redacted: a rejection here is thrown, and a thrown error is persisted to
      // viewer-readable run history exactly like a log line. The string may be a
      // credential-bearing URL — `authentication.inject.into: "query"` puts the
      // credential in the query string — so only the unparsable origin+path part
      // is echoed back, which is what identifies the offending value anyway.
      throw new Error(`SsrfGuard: invalid URL "${redactUrl(rawUrl)}"`);
    }

    const allowLocal = SsrfGuard._allowLocalEgress();

    if (!allowLocal && url.protocol !== 'https:') {
      throw new Error(`SsrfGuard: URL must use https, got "${url.protocol}"`);
    }

    const host = url.hostname.toLowerCase().replace(/\.$/, '');

    if (!allowLocal && this._isBlockedLiteralHost(host)) {
      throw new Error(`SsrfGuard: blocked IP/host "${host}"`);
    }

    if (!this.allowedHosts.has(host)) {
      throw new Error(`SsrfGuard: host "${host}" is not allowed`);
    }

    if (!allowLocal) {
      await this._assertResolvesToPublic(host);
    }
  }

  /**
   * For dynamic download URLs returned by a trusted API: enforce https + the
   * private/loopback/link-local IP blocklist (literal AND resolved), but NOT the
   * manifest allowlist (the host is not known at manifest-authoring time).
   * @param {string} rawUrl
   */
  async assertPublicHttps(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      // Redacted for the same reason as assertAllowed, and this is the likelier
      // of the two to see a secret: the only caller passes a URL taken straight
      // out of an upstream response (AsyncRetriever's `poll.resultUrlPath`),
      // which is typically a SIGNED download link.
      throw new Error(`SsrfGuard: invalid URL "${redactUrl(rawUrl)}"`);
    }
    if (SsrfGuard._allowLocalEgress()) return;
    if (url.protocol !== 'https:') {
      throw new Error(`SsrfGuard: URL must use https, got "${url.protocol}"`);
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (this._isBlockedLiteralHost(host)) {
      throw new Error(`SsrfGuard: blocked IP/host "${host}"`);
    }
    await this._assertResolvesToPublic(host);
  }

  /**
   * Literal-host block: "localhost", or a literal IP that is private/blocked.
   * (Hostnames are resolved separately in _assertResolvesToPublic.)
   * @param {string} host
   * @returns {boolean}
   */
  _isBlockedLiteralHost(host) {
    if (host === 'localhost') return true;
    return SsrfGuard.isBlockedIp(host);
  }

  /**
   * Resolve the host (all A/AAAA) and reject if ANY resolved address is blocked.
   *
   * A resolution failure is NOT uniformly safe to ignore. Only a conclusive
   * "this name has no address" (ENOTFOUND/ENODATA) is tolerated and left for
   * the subsequent fetch to report -- such a host cannot reach an internal
   * target. An INCONCLUSIVE failure (EAI_AGAIN, ESERVFAIL, a resolver timeout)
   * means the check did not run, and since `fetch` re-resolves independently it
   * can still connect; treating that as "allowed" would let a transient lookup
   * failure skip the guard entirely. Those fail closed.
   * @param {string} host
   */
  async _assertResolvesToPublic(host) {
    // A literal IP was already vetted by _isBlockedLiteralHost; resolving it is a
    // no-op that just echoes it back, so skip the lookup for literals.
    const isLiteralIp =
      host.startsWith('[') || host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    if (isLiteralIp) return;

    let addrs;
    try {
      addrs = await this.lookup(host);
    } catch (err) {
      if (CONCLUSIVE_DNS_FAILURES.has(err?.code)) {
        // No such name: nothing to block; let fetch surface the DNS error.
        return;
      }
      throw new Error(
        `SsrfGuard: host "${host}" could not be resolved for validation (${err?.code || err?.message || 'unknown error'})`
      );
    }
    const list = Array.isArray(addrs) ? addrs : [addrs];
    for (const a of list) {
      const address = a && typeof a === 'object' ? a.address : a;
      if (SsrfGuard.isBlockedIp(address)) {
        throw new Error(`SsrfGuard: host "${host}" resolves to blocked address "${address}"`);
      }
    }
  }
}
