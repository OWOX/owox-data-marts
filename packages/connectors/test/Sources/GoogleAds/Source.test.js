import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadGasClass(path.join(__dirname, '../../../src/Constants/HttpConstants.js'));
loadGasClass(path.join(__dirname, '../../../src/Core/AbstractSource.js'));
loadGasClass(path.join(__dirname, '../../../src/Sources/GoogleAds/Source.js'));
const proto = globalThis.GoogleAdsSource.prototype;

const callGetAccessToken = tokenError => {
  globalThis.OAuthUtils = {
    getAccessToken: async () => {
      throw tokenError;
    },
  };
  const self = {
    config: {
      AuthType: { value: 'oauth2', items: { ClientId: {}, ClientSecret: {}, RefreshToken: {} } },
      logMessage: () => {},
    },
  };
  return proto.getAccessToken.call(self).catch(e => e);
};

// getAccessToken rewraps every auth failure into a new Error. Without an explicit
// hand-off the isWarning flag is dropped and a dead refresh token pages as an error.
describe('getAccessToken error wrapping', () => {
  it('preserves the warning flag through the rewrap', async () => {
    const error = await callGetAccessToken(
      Object.assign(new Error('Token error: invalid_grant'), { isWarning: true })
    );
    expect(error.message).toContain('Authentication failed');
    expect(error.isWarning).toBe(true);
  });

  it('leaves unflagged failures as errors', async () => {
    const error = await callGetAccessToken(new Error('Token error: invalid_client'));
    expect(error.isWarning).toBeFalsy();
  });
});
