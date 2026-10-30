import { readOwoxStorageSettings } from './owox-storage-settings';

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
