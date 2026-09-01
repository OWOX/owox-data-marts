import { describe, expect, it } from 'vitest';
import { safeCredentialDocumentationUrl } from './credential-documentation-url';

describe('safeCredentialDocumentationUrl', () => {
  it('normalizes an absolute HTTPS URL', () => {
    expect(safeCredentialDocumentationUrl('HTTPS://Docs.Example.com/api-keys')).toBe(
      'https://docs.example.com/api-keys'
    );
  });

  it.each([
    null,
    undefined,
    '',
    '/api-keys',
    'http://docs.example.com/api-keys',
    'javascript:alert(1)',
    'https://user:secret@docs.example.com/api-keys',
  ])('rejects an unsafe or missing URL: %s', value => {
    expect(safeCredentialDocumentationUrl(value)).toBeNull();
  });
});
