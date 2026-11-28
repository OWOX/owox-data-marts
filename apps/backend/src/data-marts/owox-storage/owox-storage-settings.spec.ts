import { isOwoxStorageEnabled, readOwoxStorageSettings } from './owox-storage-settings';

const ENABLED = {
  OWOX_STORAGE_ENGINE: 'bigquery',
  BALANCE_ENDPOINT_BASE_URL: 'https://ib.example/internal-api/bi-project/',
  BALANCE_ENDPOINT_AUTH_SERVICE_ACCOUNT: 'c2c@secure.iam.gserviceaccount.com',
  BALANCE_ENDPOINT_TARGET_AUDIENCE: 'integrated-backend/api',
};

describe('readOwoxStorageSettings', () => {
  it('returns null when OWOX_STORAGE_ENGINE is unset', () => {
    expect(readOwoxStorageSettings({})).toBeNull();
  });

  it('reads a full configuration with defaults', () => {
    expect(readOwoxStorageSettings(ENABLED)).toEqual({
      engine: 'bigquery',
      storageLimitBytes: 100 * 2 ** 30,
    });
  });

  describe('limits', () => {
    const base = ENABLED;

    it('reads OWOX_STORAGE_STORAGE_LIMIT_GIB', () => {
      expect(
        readOwoxStorageSettings({ ...base, OWOX_STORAGE_STORAGE_LIMIT_GIB: '250' })
          ?.storageLimitBytes
      ).toBe(250 * 2 ** 30);
    });

    it('throws on a non-positive limit', () => {
      for (const name of ['OWOX_STORAGE_STORAGE_LIMIT_GIB']) {
        for (const value of ['0', '-1']) {
          expect(() => readOwoxStorageSettings({ ...base, [name]: value })).toThrow(
            `${name} must be a positive number.`
          );
        }
      }
    });
  });

  it('throws on a partial configuration and names what is missing', () => {
    expect(() => readOwoxStorageSettings({ OWOX_STORAGE_ENGINE: 'bigquery' })).toThrow(
      'BALANCE_ENDPOINT_BASE_URL, BALANCE_ENDPOINT_AUTH_SERVICE_ACCOUNT, BALANCE_ENDPOINT_TARGET_AUDIENCE required'
    );
    expect(() =>
      readOwoxStorageSettings({ ...ENABLED, BALANCE_ENDPOINT_TARGET_AUDIENCE: ' ' })
    ).toThrow(/^OWOX Storage is partially configured\. BALANCE_ENDPOINT_TARGET_AUDIENCE required/);
  });

  it('throws on an unknown engine', () => {
    expect(() => readOwoxStorageSettings({ OWOX_STORAGE_ENGINE: 'motherduck' })).toThrow(
      /bigquery/
    );
  });
});

describe('isOwoxStorageEnabled', () => {
  it('is false without OWOX_STORAGE_ENGINE', () => {
    expect(isOwoxStorageEnabled({})).toBe(false);
  });

  it('is true with the engine and the Integrated Backend endpoint', () => {
    expect(isOwoxStorageEnabled(ENABLED)).toBe(true);
  });

  it('throws on the engine without the Integrated Backend endpoint', () => {
    expect(() => isOwoxStorageEnabled({ OWOX_STORAGE_ENGINE: 'bigquery' })).toThrow(
      'partially configured'
    );
  });
});
