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
