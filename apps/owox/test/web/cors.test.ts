import { expect } from 'chai';

import { buildCorsAllowedHeaders, parseCorsAllowedHeaders } from '../../src/web/cors.js';

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
  });
});
