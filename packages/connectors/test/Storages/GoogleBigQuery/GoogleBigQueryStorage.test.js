import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const abstractStoragePath = path.join(__dirname, '../../../src/Core/AbstractStorage.js');
const storagePath = path.join(
  __dirname,
  '../../../src/Storages/GoogleBigQuery/GoogleBigQueryStorage.js'
);

// getBigQueryClient() calls the real require('google-auth-library') at runtime
// (set as a global by connector-runner.js in production); vm.runInThisContext
// has no `require` of its own, so we provide the real one here too — this
// exercises the actual OAuth2Client, not a stand-in for it.
globalThis.require = createRequire(import.meta.url);

loadGasClass(abstractStoragePath);
loadGasClass(storagePath);
const proto = globalThis.GoogleBigQueryStorage.prototype;

const configValue = value => ({ value });

const fakeStorage = (configOverrides = {}) => ({
  _bigqueryClient: null,
  config: {
    OAuthAccessToken: configValue('access-token'),
    OAuthRefreshToken: configValue('refresh-token'),
    OAuthClientId: configValue('client-id'),
    OAuthClientSecret: configValue('client-secret'),
    OAuthAccessTokenExpiry: configValue(1234567890),
    ProjectID: configValue('gcp-project'),
    ...configOverrides,
  },
});

describe('getBigQueryClient', () => {
  let capturedAuthClients;

  beforeEach(() => {
    capturedAuthClients = [];
    // Stand-in for @google-cloud/bigquery: real BigQuery would open network
    // connections, so we only need to capture the authClient it was built with.
    globalThis.BigQuery = class {
      constructor({ authClient }) {
        capturedAuthClients.push(authClient);
      }
    };
  });

  it('passes the access token expiry through to the OAuth2Client credentials', () => {
    proto.getBigQueryClient.call(fakeStorage());

    expect(capturedAuthClients).toHaveLength(1);
    expect(capturedAuthClients[0].credentials.expiry_date).toBe(1234567890);
  });

  it('omits expiry_date when the config has none, instead of sending an invalid value', () => {
    proto.getBigQueryClient.call(fakeStorage({ OAuthAccessTokenExpiry: configValue(null) }));

    expect(capturedAuthClients[0].credentials.expiry_date).toBeUndefined();
  });

  it('reuses the same client across calls instead of rebuilding it from the static token', () => {
    const storage = fakeStorage();

    const first = proto.getBigQueryClient.call(storage);
    const second = proto.getBigQueryClient.call(storage);

    expect(second).toBe(first);
    expect(capturedAuthClients).toHaveLength(1);
  });

  it('refreshes an expired token on the next query and keeps it for the rest of the run', async () => {
    // The production regression this whole fix targets: a token that expires
    // mid-run must be refreshed via the refresh token, and the refreshed token
    // must survive to later queries instead of being rebuilt from the stale one.
    const storage = fakeStorage({
      OAuthAccessTokenExpiry: configValue(Date.now() - 60_000),
    });
    proto.getBigQueryClient.call(storage);
    const authClient = capturedAuthClients[0];
    // Stub only the token-endpoint HTTP call: the real OAuth2Client refresh
    // logic (expiry detection, grant exchange, credential update) runs as-is.
    authClient.transporter.request = vi.fn(async () => ({
      data: { access_token: 'refreshed-token', expires_in: 3600, token_type: 'Bearer' },
    }));

    // First query after expiry: the library must detect the past expiry_date
    // and exchange the refresh token.
    await authClient.getRequestHeaders();
    expect(authClient.transporter.request).toHaveBeenCalledTimes(1);
    expect(authClient.credentials.access_token).toBe('refreshed-token');

    // A later executeQuery reuses the cached client — and with it the
    // refreshed token: no client rebuild, no second refresh round-trip.
    proto.getBigQueryClient.call(storage);
    expect(capturedAuthClients).toHaveLength(1);
    await authClient.getRequestHeaders();
    expect(authClient.transporter.request).toHaveBeenCalledTimes(1);
  });

  it('passes expiry_date 0 through, which google-auth-library itself treats as no known expiry', () => {
    proto.getBigQueryClient.call(fakeStorage({ OAuthAccessTokenExpiry: configValue(0) }));
    const authClient = capturedAuthClients[0];

    // `??` keeps the 0 intact on our side (|| would have dropped it)...
    expect(authClient.credentials.expiry_date).toBe(0);
    // ...but the library's own isTokenExpiring() uses a falsy check, so an
    // exact epoch-0 expiry never triggers a refresh either way. Pinned here so
    // nobody "fixes" our passthrough expecting a refresh the library won't do;
    // acceptable in practice, since a real expiry timestamp is never 0.
    expect(authClient.isTokenExpiring()).toBe(false);
  });
});
