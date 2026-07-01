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
});
