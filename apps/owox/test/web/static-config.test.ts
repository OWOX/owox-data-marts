import { expect } from 'chai';
import express, { Express } from 'express';

import { setupWebStaticAssets } from '../../src/web/index.js';

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
});
