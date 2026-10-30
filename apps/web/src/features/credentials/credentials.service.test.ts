import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../services';
import { credentialsService } from './credentials.service';
import type { Credential, UnavailableCredential } from './types';

describe('credentialsService.list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps unavailable rows out of the Credentials array', async () => {
    const available = { id: 'c1', title: 'GitHub key' } as unknown as Credential;
    const orphan = { id: 'c2', title: 'Old key', state: 'unavailable' } as UnavailableCredential;
    vi.spyOn(ApiService.prototype, 'get').mockResolvedValue([available, orphan]);

    await expect(credentialsService.list()).resolves.toEqual({
      credentials: [available],
      unavailable: [orphan],
    });
  });
});
