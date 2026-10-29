import express from 'express';
import type { AddressInfo } from 'net';
import { configureTrustProxy } from './trust-proxy.config';

async function clientIp(env: NodeJS.ProcessEnv, forwardedFor: string): Promise<string> {
  const app = express();
  configureTrustProxy(app, env);
  app.get('/', (req, res) => {
    res.json({ ip: req.ip, protocol: req.protocol });
  });
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { 'x-forwarded-for': forwardedFor, 'x-forwarded-proto': 'https' },
    });
    const body = (await response.json()) as { ip: string; protocol: string };
    expect(body.protocol).toBe('https');
    return body.ip;
  } finally {
    server.close();
  }
}

describe('configureTrustProxy', () => {
  // A client-forged entry, then what a load balancer appends: the client and itself.
  const forwardedFor = '198.51.100.9, 203.0.113.7, 192.0.2.1';

  it('trusts one proxy by default, and when the value is blank', async () => {
    await expect(clientIp({}, forwardedFor)).resolves.toBe('192.0.2.1');
    await expect(clientIp({ TRUST_PROXY_HOPS: ' ' }, forwardedFor)).resolves.toBe('192.0.2.1');
  });

  it('takes the client address behind the configured number of proxies', async () => {
    await expect(clientIp({ TRUST_PROXY_HOPS: '2' }, forwardedFor)).resolves.toBe('203.0.113.7');
  });

  it('refuses anything but a whole number from 0 to 10', () => {
    for (const value of ['true', '-1', '1.5', 'loopback', '11', '99999999999999999999']) {
      expect(() => configureTrustProxy(express(), { TRUST_PROXY_HOPS: value })).toThrow(
        'TRUST_PROXY_HOPS'
      );
    }
  });
});
