import { OwoxBetterAuthIdp } from '@owox/idp-owox-better-auth';
import { expect } from 'chai';
import express from 'express';
import request from 'supertest';

function createProvider(): OwoxBetterAuthIdp {
  return Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
    authErrorController: { registerRoutes: () => null },
    authFlowMiddleware: { idpStartMiddleware: () => null },
    betterAuthProxyHandler: { setupBetterAuthHandler: () => null },
    googleSheetsAuthController: { registerRoutes: () => null },
    onboardingController: { registerRoutes: () => null },
    pageController: { registerRoutes: () => null },
    passwordFlowController: { registerRoutes: () => null },
  }) as OwoxBetterAuthIdp;
}

describe('packaged IDP body parsing', () => {
  it('does not apply the auth parser limit to backend API routes', async () => {
    const app = express();
    createProvider().registerRoutes(app);

    app.use(express.json({ limit: '2mb' }));
    app.post('/api/body-parser-probe', (req, res) => {
      res.json({ size: req.body.value.length });
    });

    const value = 'x'.repeat(128 * 1024);
    const response = await request(app).post('/api/body-parser-probe').send({ value });

    expect(response.status).to.equal(200);
    expect(response.body).to.deep.equal({ size: value.length });
  });

  it('still parses JSON bodies for auth routes', async () => {
    const app = express();
    createProvider().registerRoutes(app);

    app.post('/auth/body-parser-probe', (req, res) => {
      res.json(req.body);
    });

    const response = await request(app).post('/auth/body-parser-probe').send({ parsed: true });

    expect(response.status).to.equal(200);
    expect(response.body).to.deep.equal({ parsed: true });
  });
});
