import { describe, expect, it, vi } from 'vitest';
import { credentialSetupService } from './credential-setup.service';

const transport = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: {} }),
  post: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock('../../app/api/apiClient', () => ({ default: transport }));

describe('Credential setup API', () => {
  it('keeps a decoded setup ID inside one path segment for each operation', async () => {
    const id = 'setup/part?query#fragment%';
    await credentialSetupService.getById(id);
    await credentialSetupService.complete(id, 'credential-1');
    await credentialSetupService.cancel(id);

    expect(transport.get).toHaveBeenCalledWith(
      '/credential-setup/setup%2Fpart%3Fquery%23fragment%25',
      expect.objectContaining({ skipErrorToast: true })
    );
    expect(transport.post.mock.calls).toEqual([
      [
        '/credential-setup/setup%2Fpart%3Fquery%23fragment%25/complete',
        { credentialId: 'credential-1' },
        { skipErrorToast: true },
      ],
      ['/credential-setup/setup%2Fpart%3Fquery%23fragment%25/cancel', {}, { skipErrorToast: true }],
    ]);
  });
});
