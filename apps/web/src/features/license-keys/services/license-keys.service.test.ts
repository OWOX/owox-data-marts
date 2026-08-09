import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../../app/api/apiClient';
import { licenseKeysService } from './license-keys.service';

vi.mock('../../../app/api/apiClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('licenseKeysService', () => {
  beforeEach(() => vi.resetAllMocks());

  it('uses the license management API contract', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { licenseKey: 'signed.jwt' } });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { licenseKeyId: 'key-1' } });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });

    await licenseKeysService.getKeys();
    await licenseKeysService.createKey({ name: 'Production', origin: 'https://customer.test' });
    await licenseKeysService.updateKey('key-1', { name: 'Renamed' });
    await licenseKeysService.revokeKey('key-1');

    expect(apiClient.get).toHaveBeenCalledWith('/license-keys', { params: undefined });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/license-keys',
      { name: 'Production', origin: 'https://customer.test' },
      undefined
    );
    expect(apiClient.patch).toHaveBeenCalledWith(
      '/license-keys/key-1',
      { name: 'Renamed' },
      undefined
    );
    expect(apiClient.delete).toHaveBeenCalledWith('/license-keys/key-1', undefined);
  });
});
