import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshAccessToken, switchProject } from './auth-api.service';

const post = vi.hoisted(() => vi.fn());
vi.mock('axios', async importOriginal => {
  const { default: axios } = await importOriginal<typeof import('axios')>();
  return { default: { create: () => ({ post }), isAxiosError: axios.isAxiosError } };
});

beforeEach(() => {
  post.mockReset();
});

describe('App session refresh', () => {
  it.each(['atm4', 'atm9'])('reads the shared cookie again after %s', async reason => {
    post
      .mockResolvedValueOnce({ data: { reason } })
      .mockResolvedValueOnce({ data: { accessToken: 'current-token' } });

    await expect(refreshAccessToken()).resolves.toEqual({ accessToken: 'current-token' });
    expect(post.mock.calls).toEqual([
      ['/auth/access-token', {}],
      ['/auth/access-token', {}],
    ]);
  });

  it('stops after one retry when there is still no valid session', async () => {
    post.mockResolvedValue({ data: { reason: 'atm4' } });

    await expect(refreshAccessToken()).rejects.toThrow('Token refresh failed: atm4');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('retries a rejected project switch using the same account and target', async () => {
    post
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } })
      .mockResolvedValueOnce({ status: 204 });

    await switchProject('project-b', 'user-a');
    expect(post.mock.calls).toEqual([
      ['/auth/project/switch', { projectId: 'project-b', expectedUserId: 'user-a' }],
      ['/auth/project/switch', { projectId: 'project-b', expectedUserId: 'user-a' }],
    ]);
  });

  it('does not retry a forbidden target project', async () => {
    const rejection = { isAxiosError: true, response: { status: 403 } };
    post.mockRejectedValue(rejection);

    await expect(switchProject('project-b', 'user-a')).rejects.toBe(rejection);
    expect(post).toHaveBeenCalledOnce();
  });
});
