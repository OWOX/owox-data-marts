import type { Express, Request, Response } from 'express';

import { expect } from 'chai';

import { registerPublicFlagsRoute } from '../../src/web/flags-route.js';

describe('registerPublicFlagsRoute', () => {
  let routes: Array<{
    handler: (req: Request, res: Response) => void;
    path: string;
  }>;
  const originalPublicOrigin = process.env.PUBLIC_ORIGIN;
  const originalPort = process.env.PORT;

  function readFlags(): Record<string, unknown> {
    let body: Record<string, unknown> = {};
    const res = {
      json(payload: Record<string, unknown>) {
        body = payload;
      },
      setHeader() {},
    } as unknown as Response;
    routes[0].handler({} as Request, res);
    return body;
  }

  beforeEach(() => {
    routes = [];
    process.env.PUBLIC_ORIGIN = 'https://public.example.test';
    process.env.PORT = '3127';
  });

  afterEach(() => {
    if (originalPublicOrigin === undefined) {
      delete process.env.PUBLIC_ORIGIN;
    } else {
      process.env.PUBLIC_ORIGIN = originalPublicOrigin;
    }

    if (originalPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = originalPort;
    }
  });

  it('exposes PUBLIC_ORIGIN through the default public flags route', async () => {
    const app = {
      get(path: string, handler: (req: Request, res: Response) => void) {
        routes.push({ handler, path });
      },
    } as unknown as Express;

    registerPublicFlagsRoute(app);

    const route = routes.find(route => route.path === '/api/flags');
    let body: Record<string, unknown> | undefined;
    const res = {
      json(payload: Record<string, unknown>) {
        body = payload;
      },
      setHeader() {},
    } as unknown as Response;

    expect(route).not.to.equal(undefined);
    route?.handler({} as Request, res);

    expect(body?.PUBLIC_ORIGIN).to.equal('https://public.example.test');
  });

  it('exposes fallback PUBLIC_ORIGIN when the environment value is absent', async () => {
    delete process.env.PUBLIC_ORIGIN;
    const app = {
      get(path: string, handler: (req: Request, res: Response) => void) {
        routes.push({ handler, path });
      },
    } as unknown as Express;

    registerPublicFlagsRoute(app);

    const route = routes.find(route => route.path === '/api/flags');
    let body: Record<string, unknown> | undefined;
    const res = {
      json(payload: Record<string, unknown>) {
        body = payload;
      },
      setHeader() {},
    } as unknown as Response;

    expect(route).not.to.equal(undefined);
    route?.handler({} as Request, res);

    expect(body?.PUBLIC_ORIGIN).to.equal('http://localhost:3127');
  });

  it('exposes resolved PUBLIC_ORIGIN when a custom whitelist omits it', async () => {
    const app = {
      get(path: string, handler: (req: Request, res: Response) => void) {
        routes.push({ handler, path });
      },
    } as unknown as Express;

    registerPublicFlagsRoute(app, { whitelist: ['LICENSED_APP_EDITION'] });

    const route = routes.find(route => route.path === '/api/flags');
    let body: Record<string, unknown> | undefined;
    const res = {
      json(payload: Record<string, unknown>) {
        body = payload;
      },
      setHeader() {},
    } as unknown as Response;

    expect(route).not.to.equal(undefined);
    route?.handler({} as Request, res);

    expect(body?.PUBLIC_ORIGIN).to.equal('https://public.example.test');
  });

  describe('Cloud billing configuration', () => {
    const keys = [
      'IDP_PROVIDER',
      'CLOUD_BILLING_ENABLED',
      'CLOUD_BILLING_API_ORIGIN',
      'IDP_OWOX_BASE_URL',
    ] as const;
    const previous = keys.map(key => process.env[key]);
    const app = {
      get(path: string, handler: (req: Request, res: Response) => void) {
        routes.push({ handler, path });
      },
    } as unknown as Express;

    beforeEach(() => {
      process.env.IDP_OWOX_BASE_URL = 'https://idp.example.test';
      process.env.IDP_PROVIDER = 'owox-better-auth';
      process.env.CLOUD_BILLING_ENABLED = 'true';
      delete process.env.CLOUD_BILLING_API_ORIGIN;
    });

    afterEach(() => {
      for (const [index, key] of keys.entries()) {
        const value = previous[index];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    it('publishes the explicit billing origin independently of the IDP URL', () => {
      process.env.CLOUD_BILLING_API_ORIGIN = 'https://billing.example.test/';
      registerPublicFlagsRoute(app);
      const flags = readFlags();
      expect(flags).to.include({ CLOUD_BILLING_API_ORIGIN: 'https://billing.example.test' });
      expect(flags).not.to.have.property('IDP_OWOX_BASE_URL');
    });

    it('requires the billing origin at registration even if an IDP URL is set', () => {
      expect(() => registerPublicFlagsRoute(app)).to.throw('CLOUD_BILLING_API_ORIGIN');
      expect(routes).to.be.empty;
    });

    for (const invalidOrigin of [
      'invalid',
      'https:/billing.example.test',
      'http://billing.example.test',
      'https://user:password@billing.example.test',
      'https://billing.example.test/api',
      'https://billing.example.test?foo=bar',
      'https://billing.example.test#fragment',
    ]) {
      it(`rejects an invalid billing origin at registration (${invalidOrigin})`, () => {
        process.env.CLOUD_BILLING_API_ORIGIN = invalidOrigin;
        expect(() => registerPublicFlagsRoute(app)).to.throw('CLOUD_BILLING_API_ORIGIN');
        expect(routes).to.be.empty;
      });
    }

    it('ignores the origin when the flag is disabled', () => {
      delete process.env.CLOUD_BILLING_ENABLED;
      process.env.CLOUD_BILLING_API_ORIGIN = 'invalid';
      registerPublicFlagsRoute(app);
      expect(readFlags().CLOUD_BILLING_API_ORIGIN).to.equal(undefined);
    });

    it('does not expose billing with a self-hosted provider', () => {
      process.env.IDP_PROVIDER = 'better-auth';
      process.env.CLOUD_BILLING_API_ORIGIN = 'https://billing.example.test';
      registerPublicFlagsRoute(app);
      expect(readFlags().CLOUD_BILLING_API_ORIGIN).to.equal(undefined);
    });
  });
});
