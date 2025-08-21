import { expect } from 'chai';
import express, { Express } from 'express';

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
});
