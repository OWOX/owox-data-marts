import { expect } from 'chai';
import express, { Express } from 'express';
import request from 'supertest';

import { setupWebStaticAssets } from '../../src/web/index.js';

const EXPECTED_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['strict-transport-security', 'max-age=31536000'],
  ['content-security-policy', "frame-ancestors 'none'"],
  ['x-content-type-options', 'nosniff'],
  ['x-xss-protection', '1; mode=block'],
  ['referrer-policy', 'no-referrer-when-downgrade'],
];

/**
 * Save + restore SECURITY_HEADERS_ENABLED around each test so tests in
 * different describe blocks don't leak state into each other. Pass the empty
 * string to clear the variable (matches our "unset == disabled" semantics).
 */
function withSecurityEnv(value: string): {
  after: () => void;
  before: () => void;
} {
  let previous: string | undefined;
  return {
    after() {
      if (previous === undefined) {
        delete process.env.SECURITY_HEADERS_ENABLED;
      } else {
        process.env.SECURITY_HEADERS_ENABLED = previous;
      }
    },
    before() {
      previous = process.env.SECURITY_HEADERS_ENABLED;
      if (value === '') {
        delete process.env.SECURITY_HEADERS_ENABLED;
      } else {
        process.env.SECURITY_HEADERS_ENABLED = value;
      }
    },
  };
}

describe('setupWebStaticAssets', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
  });

  describe('when @owox/web package is available', () => {
    it('should return boolean indicating setup status', () => {
      const result = setupWebStaticAssets(app);

      // Result should be boolean
      expect(result).to.be.a('boolean');
    });

    it('should accept custom excluded routes', () => {
      const result = setupWebStaticAssets(app, {
        excludedRoutes: ['/api', '/health', '/metrics'],
      });

      expect(result).to.be.a('boolean');
    });

    it('should accept custom package name', () => {
      const result = setupWebStaticAssets(app, {
        packageName: '@custom/web-package',
      });

      expect(result).to.be.a('boolean');
    });

    it('should accept both custom package name and excluded routes', () => {
      const result = setupWebStaticAssets(app, {
        excludedRoutes: ['/api', '/admin'],
        packageName: '@owox/web',
      });

      expect(result).to.be.a('boolean');
    });

    it('should work with empty options', () => {
      const result = setupWebStaticAssets(app, {});

      expect(result).to.be.a('boolean');
    });
  });

  describe('Express app configuration', () => {
    it('should configure app successfully', () => {
      // Configure static assets
      setupWebStaticAssets(app);

      // Check that app remains a valid Express function
      expect(app).to.be.a('function');
      expect(app).to.have.property('use');
    });

    it('should handle custom excluded routes configuration', () => {
      const customOptions = {
        excludedRoutes: ['/api/v1', '/api/v2', '/health'],
      };

      setupWebStaticAssets(app, customOptions);

      expect(app).to.be.a('function');
      expect(app).to.have.property('use');
    });

    it('should handle custom package name configuration', () => {
      const customOptions = {
        packageName: '@custom/ui-package',
      };

      setupWebStaticAssets(app, customOptions);

      expect(app).to.be.a('function');
      expect(app).to.have.property('use');
    });
  });

  describe('security headers — SECURITY_HEADERS_ENABLED=true', () => {
    const envGuard = withSecurityEnv('true');

    beforeEach(() => {
      envGuard.before();
      // /api/* is registered BEFORE static so the SPA fallback won't catch it.
      app.get('/api/flags', (_req, res) => {
        res.json({});
      });

      const configured = setupWebStaticAssets(app);
      expect(configured, '@owox/web must be built for these tests').to.be.true;
    });

    afterEach(() => {
      envGuard.after();
    });

    it('should set all 5 security headers on SPA fallback HTML response', async () => {
      const response = await request(app).get('/data-marts');

      expect(response.status).to.equal(200);
      expect(response.headers['content-type']).to.match(/text\/html/);
      for (const [name, value] of EXPECTED_SECURITY_HEADERS) {
        expect(response.headers[name], `missing ${name}`).to.equal(value);
      }
    });

    it('should set all 5 security headers on root / HTML response', async () => {
      const response = await request(app).get('/');

      expect(response.status).to.equal(200);
      expect(response.headers['content-type']).to.match(/text\/html/);
      for (const [name, value] of EXPECTED_SECURITY_HEADERS) {
        expect(response.headers[name], `missing ${name}`).to.equal(value);
      }
    });

    it('should NOT set security headers on API responses (outside HTML scope)', async () => {
      const response = await request(app).get('/api/flags');

      expect(response.status).to.equal(200);
      for (const [name] of EXPECTED_SECURITY_HEADERS) {
        expect(response.headers[name], `unexpected ${name}`).to.be.undefined;
      }
    });
  });

  describe('security headers — SECURITY_HEADERS_ENABLED unset (default)', () => {
    const envGuard = withSecurityEnv('');

    beforeEach(() => {
      envGuard.before();
      app.get('/api/flags', (_req, res) => {
        res.json({});
      });

      const configured = setupWebStaticAssets(app);
      expect(configured, '@owox/web must be built for these tests').to.be.true;
    });

    afterEach(() => {
      envGuard.after();
    });

    it('should NOT set security headers on SPA fallback HTML response', async () => {
      const response = await request(app).get('/data-marts');

      expect(response.status).to.equal(200);
      for (const [name] of EXPECTED_SECURITY_HEADERS) {
        expect(response.headers[name], `unexpected ${name}`).to.be.undefined;
      }
    });

    it('should NOT set security headers on root / HTML response', async () => {
      const response = await request(app).get('/');

      expect(response.status).to.equal(200);
      for (const [name] of EXPECTED_SECURITY_HEADERS) {
        expect(response.headers[name], `unexpected ${name}`).to.be.undefined;
      }
    });
  });

  describe('security headers — SECURITY_HEADERS_ENABLED=false', () => {
    const envGuard = withSecurityEnv('false');

    beforeEach(() => {
      envGuard.before();
      const configured = setupWebStaticAssets(app);
      expect(configured, '@owox/web must be built for these tests').to.be.true;
    });

    afterEach(() => {
      envGuard.after();
    });

    it('should treat literal "false" as disabled', async () => {
      const response = await request(app).get('/');

      expect(response.status).to.equal(200);
      for (const [name] of EXPECTED_SECURITY_HEADERS) {
        expect(response.headers[name], `unexpected ${name}`).to.be.undefined;
      }
    });
  });
});
