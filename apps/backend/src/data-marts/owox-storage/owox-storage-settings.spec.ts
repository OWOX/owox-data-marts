import { isOwoxStorageEnabled, readOwoxStorageSettings } from './owox-storage-settings';

describe('readOwoxStorageSettings', () => {
  it('returns null when OWOX_STORAGE_ENGINE is unset', () => {
    expect(readOwoxStorageSettings({})).toBeNull();
  });

  it('reads a full configuration with defaults', () => {
    expect(
      readOwoxStorageSettings({
        OWOX_STORAGE_ENGINE: 'bigquery',
        OWOX_STORAGE_GCP_PROJECT_ID: 'owox-storage',
      })
    ).toEqual({
      engine: 'bigquery',
      gcpProjectId: 'owox-storage',
      serviceAccountProjectId: 'owox-storage',
      freeQueryLimitBytesPerDay: 10 * 2 ** 30,
      paidQueryLimitBytesPerDay: 100 * 2 ** 30,
      freeStorageLimitBytes: 2 ** 30,
      paidIncludedStorageBytes: 10 * 2 ** 30,
      notPaidDeletionDays: 30,
      inactivityDeletionDays: 30,
    });
  });

  describe('size limits', () => {
    const base = { OWOX_STORAGE_ENGINE: 'bigquery', OWOX_STORAGE_GCP_PROJECT_ID: 'owox-storage' };

    it('reads OWOX_STORAGE_FREE_STORAGE_LIMIT_GIB', () => {
      expect(
        readOwoxStorageSettings({ ...base, OWOX_STORAGE_FREE_STORAGE_LIMIT_GIB: '0.5' })
          ?.freeStorageLimitBytes
      ).toBe(2 ** 29);
    });

    it('reads OWOX_STORAGE_PAID_INCLUDED_STORAGE_GIB', () => {
      expect(
        readOwoxStorageSettings({ ...base, OWOX_STORAGE_PAID_INCLUDED_STORAGE_GIB: 20 })
          ?.paidIncludedStorageBytes
      ).toBe(20 * 2 ** 30);
    });

    it('throws on a non-positive size limit', () => {
      expect(() =>
        readOwoxStorageSettings({ ...base, OWOX_STORAGE_FREE_STORAGE_LIMIT_GIB: '0' })
      ).toThrow(/OWOX_STORAGE_FREE_STORAGE_LIMIT_GIB/);
      expect(() =>
        readOwoxStorageSettings({ ...base, OWOX_STORAGE_PAID_INCLUDED_STORAGE_GIB: '-1' })
      ).toThrow(/OWOX_STORAGE_PAID_INCLUDED_STORAGE_GIB/);
    });
  });

  describe('deletion periods', () => {
    const base = { OWOX_STORAGE_ENGINE: 'bigquery', OWOX_STORAGE_GCP_PROJECT_ID: 'owox-storage' };

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

  it('throws on a partial configuration', () => {
    expect(() => readOwoxStorageSettings({ OWOX_STORAGE_ENGINE: 'bigquery' })).toThrow(
      /OWOX_STORAGE_GCP_PROJECT_ID/
    );
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

  it('is true with the engine and the project id', () => {
    expect(
      isOwoxStorageEnabled({
        OWOX_STORAGE_ENGINE: 'bigquery',
        OWOX_STORAGE_GCP_PROJECT_ID: 'owox-storage',
      })
    ).toBe(true);
  });

  it('throws on the engine without the project id', () => {
    expect(() => isOwoxStorageEnabled({ OWOX_STORAGE_ENGINE: 'bigquery' })).toThrow(
      'partially configured'
    );
  });
});
