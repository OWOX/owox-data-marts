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
      queryLimitBytesPerDay: 100 * 2 ** 30,
      storageLimitBytes: 100 * 2 ** 30,
      notPaidDeletionDays: 30,
      inactivityDeletionDays: 30,
    });
  });

  describe('limits', () => {
    const base = ENABLED;

    it('reads OWOX_STORAGE_QUERY_LIMIT_GIB_PER_DAY', () => {
      expect(
        readOwoxStorageSettings({ ...base, OWOX_STORAGE_QUERY_LIMIT_GIB_PER_DAY: '0.5' })
          ?.queryLimitBytesPerDay
      ).toBe(0.5 * 2 ** 30);
    });

    it('reads OWOX_STORAGE_STORAGE_LIMIT_GIB', () => {
      expect(
        readOwoxStorageSettings({ ...base, OWOX_STORAGE_STORAGE_LIMIT_GIB: '250' })
          ?.storageLimitBytes
      ).toBe(250 * 2 ** 30);
    });

    it('throws on a non-positive limit', () => {
      for (const name of [
        'OWOX_STORAGE_QUERY_LIMIT_GIB_PER_DAY',
        'OWOX_STORAGE_STORAGE_LIMIT_GIB',
      ]) {
        for (const value of ['0', '-1']) {
          expect(() => readOwoxStorageSettings({ ...base, [name]: value })).toThrow(
            `${name} must be a positive number.`
          );
        }
      }
    });
  });

  describe('deletion periods', () => {
    const base = ENABLED;

    it('defaults both to 30 days', () => {
      const settings = readOwoxStorageSettings(base);
      expect(settings?.notPaidDeletionDays).toBe(30);
      expect(settings?.inactivityDeletionDays).toBe(30);
    });

    it('reads both variables', () => {
      const settings = readOwoxStorageSettings({
        ...base,
        OWOX_STORAGE_NOT_PAID_DELETION_DAYS: 14,
        OWOX_STORAGE_INACTIVITY_DELETION_DAYS: '7',
      });
      expect(settings?.notPaidDeletionDays).toBe(14);
      expect(settings?.inactivityDeletionDays).toBe(7);
    });

    it.each(['0', '-1', '1.5', 'x'])('throws on %s', value => {
      expect(() =>
        readOwoxStorageSettings({ ...base, OWOX_STORAGE_INACTIVITY_DELETION_DAYS: value })
      ).toThrow('OWOX_STORAGE_INACTIVITY_DELETION_DAYS must be a positive integer.');
      expect(() =>
        readOwoxStorageSettings({ ...base, OWOX_STORAGE_NOT_PAID_DELETION_DAYS: value })
      ).toThrow('OWOX_STORAGE_NOT_PAID_DELETION_DAYS must be a positive integer.');
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
