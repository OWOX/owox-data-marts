import { expect } from 'chai';

import {
  buildCorsAllowedHeaders,
  buildCorsConfig,
  parseCorsAllowedHeaders,
} from '../../src/web/cors.js';

describe('CORS configuration', () => {
  describe('allowed headers', () => {
    it('keeps default allowed headers when no extra headers are configured', () => {
      expect(buildCorsAllowedHeaders('')).to.deep.equal([
        'content-type',
        'authorization',
        'x-owox-authorization',
      ]);
    });

    it('adds comma-separated headers from the environment value', () => {
      expect(buildCorsAllowedHeaders('ngrok-skip-browser-warning, x-custom-header')).to.deep.equal([
        'content-type',
        'authorization',
        'x-owox-authorization',
        'ngrok-skip-browser-warning',
        'x-custom-header',
      ]);
    });

    it('normalizes and de-duplicates extra headers', () => {
      expect(
        buildCorsAllowedHeaders(' X-Custom-Header, x-custom-header, AUTHORIZATION ')
      ).to.deep.equal(['content-type', 'authorization', 'x-owox-authorization', 'x-custom-header']);
    });

    it('ignores invalid extra header names', () => {
      expect(parseCorsAllowedHeaders('x-valid, invalid header, also:invalid')).to.deep.equal([
        'x-valid',
      ]);
    });

    it('logs a warning when invalid extra header names are encountered', () => {
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (message: string) => {
        warnings.push(message);
      };

      try {
        parseCorsAllowedHeaders('x-valid, invalid header, also:invalid');
        expect(warnings).to.have.lengthOf(1);
        expect(warnings[0]).to.include(
          'Ignored invalid CORS allowed header name(s): "invalid header", "also:invalid"'
        );
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  describe('buildCorsConfig', () => {
    let originalAllowedHeaders: string | undefined;
    let originalOrigin: string | undefined;

    beforeEach(() => {
      originalAllowedHeaders = process.env.CORS_ALLOWED_HEADERS;
      originalOrigin = process.env.GOOGLE_SHEETS_EXTENSION_ORIGIN;
    });

    afterEach(() => {
      if (originalAllowedHeaders === undefined) {
        delete process.env.CORS_ALLOWED_HEADERS;
      } else {
        process.env.CORS_ALLOWED_HEADERS = originalAllowedHeaders;
      }

      if (originalOrigin === undefined) {
        delete process.env.GOOGLE_SHEETS_EXTENSION_ORIGIN;
      } else {
        process.env.GOOGLE_SHEETS_EXTENSION_ORIGIN = originalOrigin;
      }
    });

    it('returns default CORS options when env variables are not set', () => {
      delete process.env.CORS_ALLOWED_HEADERS;
      delete process.env.GOOGLE_SHEETS_EXTENSION_ORIGIN;

      const config = buildCorsConfig();
      expect(config).to.deep.equal({
        allowedHeaders: ['content-type', 'authorization', 'x-owox-authorization'],
        credentials: true,
        maxAge: 86_400,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        optionsSuccessStatus: 204,
        origin: [],
      });
    });

    it('returns custom allowed headers and origins based on env variables', () => {
      process.env.CORS_ALLOWED_HEADERS = 'ngrok-skip-browser-warning, x-custom-header';
      process.env.GOOGLE_SHEETS_EXTENSION_ORIGIN = 'https://extension1.com, https://extension2.com';

      const config = buildCorsConfig();
      expect(config.allowedHeaders).to.deep.equal([
        'content-type',
        'authorization',
        'x-owox-authorization',
        'ngrok-skip-browser-warning',
        'x-custom-header',
      ]);
      expect(config.origin).to.deep.equal(['https://extension1.com', 'https://extension2.com']);
    });
  });
});
