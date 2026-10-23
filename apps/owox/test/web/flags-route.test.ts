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

  it('exposes DUCKDB_STORAGE_ENABLED', () => {
    const original = process.env.DUCKDB_STORAGE_ENABLED;
    process.env.DUCKDB_STORAGE_ENABLED = 'false';
    try {
      const app = {
        get(path: string, handler: (req: Request, res: Response) => void) {
          routes.push({ handler, path });
        },
      } as unknown as Express;
      registerPublicFlagsRoute(app);
      let body: Record<string, unknown> | undefined;
      const res = {
        json(payload: Record<string, unknown>) {
          body = payload;
        },
        setHeader() {},
      } as unknown as Response;

      routes.find(route => route.path === '/api/flags')?.handler({} as Request, res);

      expect(body?.DUCKDB_STORAGE_ENABLED).to.equal('false');
    } finally {
      if (original === undefined) delete process.env.DUCKDB_STORAGE_ENABLED;
      else process.env.DUCKDB_STORAGE_ENABLED = original;
    }
  });

  it('computes a flag at request time when the route is given its resolver', () => {
    const original = process.env.DUCKDB_STORAGE_ENABLED;
    delete process.env.DUCKDB_STORAGE_ENABLED;
    let enabled = 'true';
    try {
      const app = {
        get(path: string, handler: (req: Request, res: Response) => void) {
          routes.push({ handler, path });
        },
      } as unknown as Express;
      registerPublicFlagsRoute(app, { computed: { DUCKDB_STORAGE_ENABLED: () => enabled } });
      const bodies: Array<Record<string, unknown>> = [];
      const res = {
        json(payload: Record<string, unknown>) {
          bodies.push(payload);
        },
        setHeader() {},
      } as unknown as Response;
      const route = routes.find(route => route.path === '/api/flags');

      route?.handler({} as Request, res);
      enabled = 'false';
      route?.handler({} as Request, res);

      expect(bodies.map(body => body.DUCKDB_STORAGE_ENABLED)).to.deep.equal(['true', 'false']);
    } finally {
      if (original !== undefined) process.env.DUCKDB_STORAGE_ENABLED = original;
    }
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
