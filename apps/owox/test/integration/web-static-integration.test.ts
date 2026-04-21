import { expect } from 'chai';
import express, { Express } from 'express';
import request from 'supertest';

import { setupWebStaticAssets } from '../../src/web/index.js';

describe('Integration: setupWebStaticAssets with real @owox/web package', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
  });

  it('should work with real @owox/web package', () => {
    // This test specifically verifies that our utility works with the actual
    // @owox/web package, not mocked dependencies
    const result = setupWebStaticAssets(app, {
      excludedRoutes: ['/api'],
      packageName: '@owox/web',
    });

    // Should successfully find and configure real package
    expect(result).to.be.true;
  });

  it('should fail gracefully with non-existent package', () => {
    const result = setupWebStaticAssets(app, {
      excludedRoutes: ['/api'],
      packageName: '@non-existent/package',
    });

    // Should handle missing package gracefully
    expect(result).to.be.false;
  });

  it('should attach required security headers to the main HTML response', async () => {
    const configured = setupWebStaticAssets(app, {
      excludedRoutes: ['/api'],
      packageName: '@owox/web',
    });
    expect(configured).to.be.true;

    const response = await request(app).get('/');

    expect(response.status).to.equal(200);
    expect(response.headers['content-type']).to.match(/text\/html/);
    expect(response.headers['strict-transport-security']).to.equal('max-age=31536000');
    expect(response.headers['content-security-policy']).to.equal("frame-ancestors 'none'");
    expect(response.headers['x-content-type-options']).to.equal('nosniff');
    expect(response.headers['x-xss-protection']).to.equal('1; mode=block');
    expect(response.headers['referrer-policy']).to.equal('no-referrer-when-downgrade');
  });
});
