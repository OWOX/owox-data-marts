import { OWOXConfigError } from './errors.js';
import { API_KEY_PREFIX, parseOWOXApiKey } from './api-key.js';

type ApiKeyPayload = {
  apiOrigin: unknown;
  apiKeyId: unknown;
  apiKeySecret: unknown;
};

function encodeFixture(payload: ApiKeyPayload): string {
  return `${API_KEY_PREFIX}${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;
}

describe('parseOWOXApiKey', () => {
  it('parses a valid prefixed base64url JSON API key', () => {
    const apiKey = encodeFixture({
      apiOrigin: 'https://app.owox.com',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      apiKeySecret: 'secret-value',
    });

    expect(parseOWOXApiKey(apiKey)).toEqual({
      apiOrigin: 'https://app.owox.com',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      apiKeySecret: 'secret-value',
    });
  });

  it('rejects values without the API key prefix', () => {
    expect(() => parseOWOXApiKey('not-an-owox-key')).toThrow(OWOXConfigError);
    expect(() => parseOWOXApiKey('not-an-owox-key')).toThrow('OWOX_API_KEY is required');
  });

  it('rejects non-JSON encoded payloads', () => {
    const apiKey = `${API_KEY_PREFIX}${Buffer.from('not-json', 'utf8').toString('base64url')}`;

    expect(() => parseOWOXApiKey(apiKey)).toThrow('OWOX_API_KEY must contain a valid JSON payload');
  });

  it('rejects JSON payloads that are not objects', () => {
    const apiKey = `${API_KEY_PREFIX}${Buffer.from('"not-object"', 'utf8').toString('base64url')}`;

    expect(() => parseOWOXApiKey(apiKey)).toThrow('OWOX_API_KEY must contain a JSON object');
  });

  it.each([
    [
      'apiOrigin',
      { apiOrigin: '', apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv', apiKeySecret: 'secret' },
    ],
    ['apiKeyId', { apiOrigin: 'https://app.owox.com', apiKeyId: '', apiKeySecret: 'secret' }],
    [
      'apiKeySecret',
      {
        apiOrigin: 'https://app.owox.com',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
        apiKeySecret: '',
      },
    ],
  ])('rejects missing or empty %s', (_field, payload) => {
    expect(() => parseOWOXApiKey(encodeFixture(payload))).toThrow(
      'OWOX_API_KEY must include apiOrigin, apiKeyId, and apiKeySecret'
    );
  });

  it('rejects invalid API origins', () => {
    const apiKey = encodeFixture({
      apiOrigin: 'not a url',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      apiKeySecret: 'secret-value',
    });

    expect(() => parseOWOXApiKey(apiKey)).toThrow(
      'OWOX_API_KEY apiOrigin must be a valid http or https origin'
    );
  });

  it('does not include the API key or secret in validation error messages', () => {
    const apiKey = encodeFixture({
      apiOrigin: 'not a url',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      apiKeySecret: 'secret-value-that-must-not-leak',
    });

    try {
      parseOWOXApiKey(apiKey);
      throw new Error('Expected parseOWOXApiKey to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(OWOXConfigError);
      expect((error as Error).message).not.toContain(apiKey);
      expect((error as Error).message).not.toContain('secret-value-that-must-not-leak');
    }
  });
});
