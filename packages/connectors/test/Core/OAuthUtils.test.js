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
