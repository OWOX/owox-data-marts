import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadGasClass(path.join(__dirname, '../../src/Core/Utils/OAuthUtils.js'));
const OAuthUtils = globalThis.OAuthUtils;

const stubFetch = json => {
  globalThis.HttpUtils = {
    fetch: async () => ({ getContentText: async () => JSON.stringify(json) }),
  };
};

const config = { logMessage: () => {} };

describe('getAccessToken', () => {
  it('flags invalid_grant as a warning and keeps the flag through the rewrap', async () => {
    stubFetch({ error: 'invalid_grant' });
    const error = await OAuthUtils.getAccessToken({ config, tokenUrl: 'x', formData: {} }).catch(
      e => e
    );
    expect(error.message).toBe('Failed to get access token: Token error: invalid_grant');
    expect(error.isWarning).toBe(true);
  });

  it('does not flag other token errors as warnings', async () => {
    stubFetch({ error: 'invalid_client' });
    const error = await OAuthUtils.getAccessToken({ config, tokenUrl: 'x', formData: {} }).catch(
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
        config,
        tokenUrl: 'x',
        serviceAccountKeyJson: JSON.stringify({ client_email: 'a@b.c', private_key: 'k' }),
        scope: 's',
      })
      .catch(e => e);
    expect(error.message).toContain('Service Account authentication failed');
    expect(error.isWarning).toBe(true);
  });
});
