import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Credential } from '../../../credentials/types';

const mocks = vi.hoisted(() => ({
  saved: null as null | ((saved: Credential) => void),
  validateAccess: vi.fn(),
}));

vi.mock('../../../credentials/useCredentials', () => ({
  onCredentialSaved: (listener: (saved: Credential) => void) => {
    mocks.saved = listener;
    return () => undefined;
  },
}));
vi.mock('../api/data-storage-api.service', () => ({
  dataStorageApiService: { validateAccess: mocks.validateAccess },
}));

const consumer = (consumerType: string, consumerId: string) => ({ consumerType, consumerId });

describe('data storage health status cache', () => {
  beforeEach(() => {
    mocks.validateAccess.mockResolvedValue({ valid: true });
  });

  it('drops the cached health of the Storages using a saved Credential, and only those', async () => {
    const { fetchAndCacheDataStorageHealthStatus, getCachedDataStorageHealthStatus } =
      await import('./data-storage-health-status.service');
    fetchAndCacheDataStorageHealthStatus('storage-1');
    fetchAndCacheDataStorageHealthStatus('storage-2');
    await vi.waitFor(() => {
      expect(getCachedDataStorageHealthStatus('storage-2')).toBeDefined();
    });
    expect(getCachedDataStorageHealthStatus('storage-1')).toBeDefined();

    mocks.saved?.({
      usedBy: [consumer('storage', 'storage-1'), consumer('plugin', 'storage-2')],
    } as unknown as Credential);

    expect(getCachedDataStorageHealthStatus('storage-1')).toBeUndefined();
    expect(getCachedDataStorageHealthStatus('storage-2')).toBeDefined();
  });
});
