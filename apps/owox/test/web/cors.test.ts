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
    let originalGoogleSheetsOrigin: string | undefined;
    let originalMicrosoftExtensionEnabled: string | undefined;
    let originalMicrosoftExtensionOrigins: string | undefined;

    beforeEach(() => {
      originalAllowedHeaders = process.env.CORS_ALLOWED_HEADERS;
      originalGoogleSheetsOrigin = process.env.GOOGLE_SHEETS_EXTENSION_ORIGIN;
      originalMicrosoftExtensionEnabled = process.env.IDP_OWOX_EXTENSION_MICROSOFT_ENABLED;
      originalMicrosoftExtensionOrigins = process.env.IDP_OWOX_EXTENSION_ALLOWED_ORIGINS;
    });

    afterEach(() => {
      if (originalAllowedHeaders === undefined) {
        delete process.env.CORS_ALLOWED_HEADERS;
      } else {
        process.env.CORS_ALLOWED_HEADERS = originalAllowedHeaders;
      }

      if (originalGoogleSheetsOrigin === undefined) {
        delete process.env.GOOGLE_SHEETS_EXTENSION_ORIGIN;
      } else {
        process.env.GOOGLE_SHEETS_EXTENSION_ORIGIN = originalGoogleSheetsOrigin;
      }

      if (originalMicrosoftExtensionEnabled === undefined) {
        delete process.env.IDP_OWOX_EXTENSION_MICROSOFT_ENABLED;
      } else {
        process.env.IDP_OWOX_EXTENSION_MICROSOFT_ENABLED = originalMicrosoftExtensionEnabled;
      }

      if (originalMicrosoftExtensionOrigins === undefined) {
        delete process.env.IDP_OWOX_EXTENSION_ALLOWED_ORIGINS;
      } else {
        process.env.IDP_OWOX_EXTENSION_ALLOWED_ORIGINS = originalMicrosoftExtensionOrigins;
      }
    });

    it('returns default CORS options when env variables are not set', () => {
      delete process.env.CORS_ALLOWED_HEADERS;
      delete process.env.GOOGLE_SHEETS_EXTENSION_ORIGIN;
      delete process.env.IDP_OWOX_EXTENSION_MICROSOFT_ENABLED;
      delete process.env.IDP_OWOX_EXTENSION_ALLOWED_ORIGINS;

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
      process.env.IDP_OWOX_EXTENSION_MICROSOFT_ENABLED = 'true';
      process.env.IDP_OWOX_EXTENSION_ALLOWED_ORIGINS =
        'https://excel-extension.com, https://extension2.com';

      const config = buildCorsConfig();
      expect(config.allowedHeaders).to.deep.equal([
        'content-type',
        'authorization',
        'x-owox-authorization',
        'ngrok-skip-browser-warning',
        'x-custom-header',
      ]);
      expect(config.origin).to.deep.equal([
        'https://extension1.com',
        'https://extension2.com',
        'https://excel-extension.com',
      ]);
    });

    it('allows Microsoft extension origins without Google Sheets configuration', () => {
      delete process.env.GOOGLE_SHEETS_EXTENSION_ORIGIN;
      process.env.IDP_OWOX_EXTENSION_MICROSOFT_ENABLED = 'true';
      process.env.IDP_OWOX_EXTENSION_ALLOWED_ORIGINS =
        ' https://excel-extension.com, https://excel-extension.com ';

      const config = buildCorsConfig();

      expect(config.origin).to.deep.equal(['https://excel-extension.com']);
    });

    it('normalizes Microsoft extension origins before exact CORS matching', () => {
      delete process.env.GOOGLE_SHEETS_EXTENSION_ORIGIN;
      process.env.IDP_OWOX_EXTENSION_MICROSOFT_ENABLED = 'true';
      process.env.IDP_OWOX_EXTENSION_ALLOWED_ORIGINS =
        'https://excel-extension.com/task-pane, https://excel-extension.com/';

      const config = buildCorsConfig();

      expect(config.origin).to.deep.equal(['https://excel-extension.com']);
    });

    it('does not allow Microsoft extension origins while the feature is disabled', () => {
      delete process.env.GOOGLE_SHEETS_EXTENSION_ORIGIN;
      process.env.IDP_OWOX_EXTENSION_MICROSOFT_ENABLED = 'false';
      process.env.IDP_OWOX_EXTENSION_ALLOWED_ORIGINS = 'https://excel-extension.com';

      const config = buildCorsConfig();

      expect(config.origin).to.deep.equal([]);
    });
  });
});
