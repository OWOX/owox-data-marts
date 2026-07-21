import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { describe, expect, it, beforeEach } from 'vitest';
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
});
