import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadGasClass(path.join(__dirname, '../../src/Core/Utils/OAuthUtils.js'));
const OAuthUtils = globalThis.OAuthUtils;
// LOG_LEVEL is a bare global in production, referenced only inside method bodies.
globalThis.LOG_LEVEL = { INFO: 'info', WARN: 'warn', ERROR: 'error' };

// The token endpoint is reached through the global fetch, and the caller is handed a
// context rather than a config.
const stubFetch = json => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify(json),
  });
};

const context = { log: () => {}, sourceConfig: {} };

describe('getAccessToken', () => {
  it('flags invalid_grant as a warning and keeps the flag through the rewrap', async () => {
    stubFetch({ error: 'invalid_grant' });
    const error = await OAuthUtils.getAccessToken({ context, tokenUrl: 'x', formData: {} }).catch(
      e => e
    );
    expect(error.message).toBe('Failed to get access token: Token error: invalid_grant');
    expect(error.isWarning).toBe(true);
  });

  it('does not flag other token errors as warnings', async () => {
    stubFetch({ error: 'invalid_client' });
    const error = await OAuthUtils.getAccessToken({ context, tokenUrl: 'x', formData: {} }).catch(
      e => e
    );
    expect(error.isWarning).toBeFalsy();
  });
});

describe('getServiceAccountToken', () => {
  // This path wraps getAccessToken a second time; the flag has to survive both wraps
  // or the connector-runner classifies a dead refresh token as a hard error.
  it('keeps the invalid_grant warning flag through the service-account wrap', async () => {
    stubFetch({ error: 'invalid_grant' });
    // Real createJWT would need a valid RSA key; stub only that, keeping the real
    // getAccessToken so both wrapping layers are actually exercised.
    const utils = { ...OAuthUtils, createJWT: () => 'stub.jwt.token' };
    const error = await utils
      .getServiceAccountToken({
        context,
        tokenUrl: 'x',
        serviceAccountKeyJson: JSON.stringify({ client_email: 'a@b.c', private_key: 'k' }),
        scope: 's',
      })
      .catch(e => e);
    expect(error.message).toContain('Service Account authentication failed');
    expect(error.isWarning).toBe(true);
  });
});
