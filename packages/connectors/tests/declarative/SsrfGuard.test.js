import assert from 'node:assert';
import { describe, it, test } from 'node:test';
import { SsrfGuard } from '../../src/Core/Declarative/SsrfGuard.js';

// A stub resolver that maps a host to fixed addresses, so tests never hit real
// DNS. `dns.lookup(host, { all: true })` returns [{ address, family }].
function stubLookup(map) {
  return async host => {
    const addrs = map[host];
    if (!addrs) {
      const e = new Error(`stub: no record for ${host}`);
      e.code = 'ENOTFOUND';
      throw e;
    }
    return addrs;
  };
}

describe('SsrfGuard', () => {
  // A resolver that echoes literal IPs back (matches dns.lookup on a literal IP)
  // and maps the allowlisted host used across the literal-check tests to a public
  // address so those checks still exercise only the literal/allowlist logic.
  const echoLookup = async host => {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return [{ address: host, family: 4 }];
    if (host.startsWith('[')) return [{ address: host.slice(1, -1), family: 6 }];
    return [{ address: '93.184.216.34', family: 4 }];
  };
  const guard = new SsrfGuard(['api.example.com'], { lookup: echoLookup });

  it('allows an https URL on an allowlisted host', async () => {
    await assert.doesNotReject(() => guard.assertAllowed('https://api.example.com/v1/data'));
  });

  it('rejects a host not on the allowlist', async () => {
    await assert.rejects(
      () => guard.assertAllowed('https://evil.com/x'),
      /host "evil.com" is not allowed/
    );
  });

  it('rejects non-https schemes', async () => {
    await assert.rejects(() => guard.assertAllowed('http://api.example.com/x'), /must use https/);
  });

  it('rejects literal private/loopback/link-local IPs even if "allowlisted"', async () => {
    const g = new SsrfGuard(['169.254.169.254', '127.0.0.1', '10.0.0.5'], { lookup: echoLookup });
    await assert.rejects(
      () => g.assertAllowed('https://169.254.169.254/latest/meta-data'),
      /blocked IP/
    );
    await assert.rejects(() => g.assertAllowed('https://127.0.0.1/x'), /blocked IP/);
    await assert.rejects(() => g.assertAllowed('https://10.0.0.5/x'), /blocked IP/);
  });

  it('rejects a malformed URL', async () => {
    await assert.rejects(() => guard.assertAllowed('not a url'), /invalid URL/);
  });

  it('rejects IPv6 loopback/link-local/unique-local/IPv4-mapped (bracketed)', async () => {
    const g = new SsrfGuard([], { lookup: echoLookup });
    await assert.rejects(() => g.assertAllowed('https://[::1]/x'), /blocked IP/);
    await assert.rejects(() => g.assertAllowed('https://[fe80::1]/x'), /blocked IP/);
    await assert.rejects(() => g.assertAllowed('https://[fc00::1]/x'), /blocked IP/);
    await assert.rejects(() => g.assertAllowed('https://[fd00::1]/x'), /blocked IP/);
    await assert.rejects(() => g.assertAllowed('https://[::ffff:169.254.169.254]/x'), /blocked IP/);
  });

  it('matches an allowlisted host even with a trailing dot', async () => {
    const g = new SsrfGuard(['api.example.com'], { lookup: echoLookup });
    await assert.doesNotReject(() => g.assertAllowed('https://api.example.com./x'));
  });

  it('blocked IP wins over an allowlist entry (order invariant)', async () => {
    const g = new SsrfGuard(['127.0.0.1'], { lookup: echoLookup });
    await assert.rejects(() => g.assertAllowed('https://127.0.0.1/x'), /blocked IP/);
  });

  it('assertPublicHttps allows any public https host but blocks private IPs', async () => {
    const g = new SsrfGuard([], { lookup: echoLookup });
    await assert.doesNotReject(() =>
      g.assertPublicHttps('https://cdn.report-storage.example/r.json')
    );
    await assert.rejects(() => g.assertPublicHttps('http://cdn.example/r.json'), /must use https/);
    await assert.rejects(() => g.assertPublicHttps('https://169.254.169.254/r'), /blocked IP/);
    await assert.rejects(() => g.assertPublicHttps('https://[::1]/r'), /blocked IP/);
  });

  // --- DNS resolve-and-validate (Task 1.1) ---

  it('assertAllowed rejects a hostname that resolves to a private IP', async () => {
    const lookup = stubLookup({ 'internal.example.com': [{ address: '10.0.0.5', family: 4 }] });
    const guard = new SsrfGuard(['internal.example.com'], { lookup });
    await assert.rejects(
      () => guard.assertAllowed('https://internal.example.com/x'),
      /resolves to blocked/
    );
  });

  it('assertAllowed allows a hostname that resolves only to public IPs', async () => {
    const lookup = stubLookup({ 'example.com': [{ address: '93.184.216.34', family: 4 }] });
    const guard = new SsrfGuard(['example.com'], { lookup });
    await assert.doesNotReject(() => guard.assertAllowed('https://example.com/x'));
  });

  it('assertAllowed rejects when ANY resolved address is private (mixed A records)', async () => {
    const lookup = stubLookup({
      'rebind.example.com': [
        { address: '93.184.216.34', family: 4 },
        { address: '169.254.169.254', family: 4 },
      ],
    });
    const guard = new SsrfGuard(['rebind.example.com'], { lookup });
    await assert.rejects(
      () => guard.assertAllowed('https://rebind.example.com/x'),
      /resolves to blocked/
    );
  });

  it('assertAllowed rejects when a resolved IPv6 address is private', async () => {
    const lookup = stubLookup({ 'v6.example.com': [{ address: 'fd00::1', family: 6 }] });
    const guard = new SsrfGuard(['v6.example.com'], { lookup });
    await assert.rejects(
      () => guard.assertAllowed('https://v6.example.com/x'),
      /resolves to blocked/
    );
  });

  it('assertPublicHttps also resolves DNS and rejects a private resolved IP', async () => {
    const lookup = stubLookup({ 'cdn.evil.example': [{ address: '127.0.0.1', family: 4 }] });
    const guard = new SsrfGuard([], { lookup });
    await assert.rejects(
      () => guard.assertPublicHttps('https://cdn.evil.example/r.json'),
      /resolves to blocked/
    );
  });

  it('isBlockedIp is a static helper covering bare (un-bracketed) IPv4 and IPv6', () => {
    assert.strictEqual(SsrfGuard.isBlockedIp('10.0.0.5'), true);
    assert.strictEqual(SsrfGuard.isBlockedIp('127.0.0.1'), true);
    assert.strictEqual(SsrfGuard.isBlockedIp('169.254.169.254'), true);
    assert.strictEqual(SsrfGuard.isBlockedIp('93.184.216.34'), false);
    assert.strictEqual(SsrfGuard.isBlockedIp('::1'), true);
    assert.strictEqual(SsrfGuard.isBlockedIp('fe80::1'), true);
    assert.strictEqual(SsrfGuard.isBlockedIp('fd00::1'), true);
    assert.strictEqual(SsrfGuard.isBlockedIp('2606:2800:220:1:248:1893:25c8:1946'), false);
  });

  // --- Reserved ranges that reach infrastructure but were not in the blocklist ---

  it('isBlockedIp blocks CGNAT 100.64.0.0/10 (Alibaba/OCI metadata, GKE ranges)', () => {
    assert.strictEqual(SsrfGuard.isBlockedIp('100.100.100.200'), true); // Alibaba metadata
    assert.strictEqual(SsrfGuard.isBlockedIp('100.64.0.1'), true); // first host in range
    assert.strictEqual(SsrfGuard.isBlockedIp('100.127.255.255'), true); // last host in range
    assert.strictEqual(SsrfGuard.isBlockedIp('100.80.1.1'), true);
    // Boundaries: these sit OUTSIDE the /10 and must stay reachable.
    assert.strictEqual(SsrfGuard.isBlockedIp('100.63.255.255'), false);
    assert.strictEqual(SsrfGuard.isBlockedIp('100.128.0.1'), false);
  });

  it('isBlockedIp blocks the IPv6 unspecified address :: (routes to loopback on Linux)', () => {
    assert.strictEqual(SsrfGuard.isBlockedIp('::'), true); // bare, as dns.lookup returns it
    assert.strictEqual(SsrfGuard.isBlockedIp('[::]'), true); // bracketed, as URL.hostname returns it
  });

  it('isBlockedIp blocks benchmarking, protocol-assignment, multicast and broadcast ranges', () => {
    assert.strictEqual(SsrfGuard.isBlockedIp('198.18.0.1'), true); // 198.18.0.0/15
    assert.strictEqual(SsrfGuard.isBlockedIp('198.19.255.255'), true);
    assert.strictEqual(SsrfGuard.isBlockedIp('192.0.0.1'), true); // 192.0.0.0/24
    assert.strictEqual(SsrfGuard.isBlockedIp('224.0.0.1'), true); // 224.0.0.0/4 multicast
    assert.strictEqual(SsrfGuard.isBlockedIp('239.255.255.255'), true);
    assert.strictEqual(SsrfGuard.isBlockedIp('255.255.255.255'), true); // limited broadcast
    // Neighbours that must stay reachable.
    assert.strictEqual(SsrfGuard.isBlockedIp('198.17.255.255'), false);
    assert.strictEqual(SsrfGuard.isBlockedIp('198.20.0.1'), false);
    assert.strictEqual(SsrfGuard.isBlockedIp('192.0.1.1'), false);
    assert.strictEqual(SsrfGuard.isBlockedIp('223.255.255.255'), false);
    assert.strictEqual(SsrfGuard.isBlockedIp('240.0.0.1'), false);
  });

  it('isBlockedIp blocks the NAT64 well-known prefix 64:ff9b::/96', () => {
    assert.strictEqual(SsrfGuard.isBlockedIp('64:ff9b::7f00:1'), true); // embeds 127.0.0.1
    assert.strictEqual(SsrfGuard.isBlockedIp('[64:ff9b::a9fe:a9fe]'), true); // embeds 169.254.169.254
  });

  // --- Self-allowlisting: the allowlist is built FROM the manifest ---
  //
  // ManifestParser._collectHosts derives allowedHosts from raw.baseUrl, so a
  // manifest author picks their own allowlist. The blocklist is therefore the
  // only real boundary, and it must win regardless of what the manifest asked
  // for. The pre-existing "order invariant" case above pins that ordering for
  // 127.0.0.1; these pin it for the ranges that were missing from the
  // blocklist, which is where a self-allowlisting manifest actually got out.

  it('a manifest cannot self-allowlist a CGNAT metadata address via baseUrl', async () => {
    const g = new SsrfGuard(['100.100.100.200'], { lookup: echoLookup });
    await assert.rejects(
      () => g.assertAllowed('https://100.100.100.200/latest/meta-data'),
      /blocked IP/
    );
  });

  it('a manifest cannot self-allowlist the unspecified address [::]', async () => {
    const g = new SsrfGuard(['[::]'], { lookup: echoLookup });
    await assert.rejects(() => g.assertAllowed('https://[::]:80/x'), /blocked IP/);
  });

  // --- DNS resolution failures must not fail open ---

  function throwingLookup(code) {
    return async () => {
      const e = new Error(`stub: ${code}`);
      e.code = code;
      throw e;
    };
  }

  it('assertAllowed fails CLOSED when the resolver returns a temporary failure', async () => {
    const g = new SsrfGuard(['api.example.com'], { lookup: throwingLookup('EAI_AGAIN') });
    await assert.rejects(
      () => g.assertAllowed('https://api.example.com/x'),
      /could not be resolved/
    );
  });

  it('assertAllowed fails CLOSED on a resolver SERVFAIL or timeout', async () => {
    const servfail = new SsrfGuard(['api.example.com'], { lookup: throwingLookup('ESERVFAIL') });
    await assert.rejects(
      () => servfail.assertAllowed('https://api.example.com/x'),
      /could not be resolved/
    );
    const timeout = new SsrfGuard(['api.example.com'], { lookup: throwingLookup('ETIMEOUT') });
    await assert.rejects(
      () => timeout.assertAllowed('https://api.example.com/x'),
      /could not be resolved/
    );
  });

  it('assertPublicHttps also fails CLOSED on a temporary resolver failure', async () => {
    const g = new SsrfGuard([], { lookup: throwingLookup('EAI_AGAIN') });
    await assert.rejects(
      () => g.assertPublicHttps('https://cdn.example/r.json'),
      /could not be resolved/
    );
  });

  it('a genuinely non-existent name stays tolerated (fetch reports the DNS error)', async () => {
    // NXDOMAIN/ENODATA prove there is no address to connect to, so there is
    // nothing to block; letting fetch surface its own clearer error is kept.
    const nx = new SsrfGuard(['gone.example.com'], { lookup: throwingLookup('ENOTFOUND') });
    await assert.doesNotReject(() => nx.assertAllowed('https://gone.example.com/x'));
    const nodata = new SsrfGuard(['gone.example.com'], { lookup: throwingLookup('ENODATA') });
    await assert.doesNotReject(() => nodata.assertAllowed('https://gone.example.com/x'));
  });
});

// --- OW_ALLOW_LOCAL_EGRESS gate ---

const stubLookupLocal = async () => [{ address: '127.0.0.1', family: 4 }];

test('OW_ALLOW_LOCAL_EGRESS off: http+localhost still blocked', async () => {
  delete process.env.OW_ALLOW_LOCAL_EGRESS;
  const guard = new SsrfGuard(['localhost'], { lookup: stubLookupLocal });
  await assert.rejects(() => guard.assertAllowed('http://localhost:3000/x'), /https/);
  await assert.rejects(() => guard.assertAllowed('https://localhost:3000/x'), /blocked IP\/host/);
});

test('OW_ALLOW_LOCAL_EGRESS on: allowlisted http+localhost passes', async () => {
  process.env.OW_ALLOW_LOCAL_EGRESS = '1';
  try {
    const guard = new SsrfGuard(['localhost'], { lookup: stubLookupLocal });
    await guard.assertAllowed('http://localhost:3000/x'); // must not throw
  } finally {
    delete process.env.OW_ALLOW_LOCAL_EGRESS;
  }
});

test('OW_ALLOW_LOCAL_EGRESS on: non-allowlisted host still blocked', async () => {
  process.env.OW_ALLOW_LOCAL_EGRESS = '1';
  try {
    const guard = new SsrfGuard(['localhost'], { lookup: stubLookupLocal });
    await assert.rejects(() => guard.assertAllowed('http://evil.internal:3000/x'), /not allowed/);
  } finally {
    delete process.env.OW_ALLOW_LOCAL_EGRESS;
  }
});

test('OW_ALLOW_LOCAL_EGRESS on: assertPublicHttps relaxed for localhost', async () => {
  process.env.OW_ALLOW_LOCAL_EGRESS = '1';
  try {
    const guard = new SsrfGuard([], { lookup: stubLookupLocal });
    await guard.assertPublicHttps('http://localhost:9999/download'); // must not throw
  } finally {
    delete process.env.OW_ALLOW_LOCAL_EGRESS;
  }
});

// --- OW_ALLOW_LOCAL_EGRESS refused in production (defense-in-depth) ---
//
// Save/restore BOTH env vars around every case below (try/finally) so a
// thrown assertion never leaks OW_ALLOW_LOCAL_EGRESS or NODE_ENV into a
// sibling test — including restoring to "unset" rather than "" when the var
// was not previously set.

function withEnvRestore(fn) {
  const prevFlag = process.env.OW_ALLOW_LOCAL_EGRESS;
  const prevNodeEnv = process.env.NODE_ENV;
  return fn().finally(() => {
    if (prevFlag === undefined) delete process.env.OW_ALLOW_LOCAL_EGRESS;
    else process.env.OW_ALLOW_LOCAL_EGRESS = prevFlag;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });
}

test('OW_ALLOW_LOCAL_EGRESS on + NODE_ENV=production: flag is refused, allowlisted http+localhost still blocked', () =>
  withEnvRestore(async () => {
    process.env.OW_ALLOW_LOCAL_EGRESS = '1';
    process.env.NODE_ENV = 'production';
    const guard = new SsrfGuard(['localhost'], { lookup: stubLookupLocal });
    // Same assertions as the "off" case above — in production the flag must
    // behave exactly as if it were never set.
    await assert.rejects(() => guard.assertAllowed('http://localhost:3000/x'), /https/);
    await assert.rejects(() => guard.assertAllowed('https://localhost:3000/x'), /blocked IP\/host/);
  }));

test('OW_ALLOW_LOCAL_EGRESS on + NODE_ENV=production: assertPublicHttps also refuses the flag', () =>
  withEnvRestore(async () => {
    process.env.OW_ALLOW_LOCAL_EGRESS = '1';
    process.env.NODE_ENV = 'production';
    const guard = new SsrfGuard([], { lookup: stubLookupLocal });
    await assert.rejects(() => guard.assertPublicHttps('http://localhost:9999/download'), /https/);
  }));

test('OW_ALLOW_LOCAL_EGRESS on + NODE_ENV explicitly non-production: flag is still honored', () =>
  withEnvRestore(async () => {
    process.env.OW_ALLOW_LOCAL_EGRESS = '1';
    process.env.NODE_ENV = 'development';
    const guard = new SsrfGuard(['localhost'], { lookup: stubLookupLocal });
    await guard.assertAllowed('http://localhost:3000/x'); // must not throw
  }));

test('OW_ALLOW_LOCAL_EGRESS on + NODE_ENV unset: flag is still honored (matches pre-existing behavior)', () =>
  withEnvRestore(async () => {
    process.env.OW_ALLOW_LOCAL_EGRESS = '1';
    delete process.env.NODE_ENV;
    const guard = new SsrfGuard(['localhost'], { lookup: stubLookupLocal });
    await guard.assertAllowed('http://localhost:3000/x'); // must not throw
  }));
