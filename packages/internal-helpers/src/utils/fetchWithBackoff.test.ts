import { jest } from '@jest/globals';
import { fetchWithBackoff } from './fetchWithBackoff.js';

describe('fetchWithBackoff', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('retries request timeouts within the configured bound', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    globalThis.fetch = jest
      .fn<typeof fetch>()
      .mockRejectedValueOnce(timeout)
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    jest.spyOn(Math, 'random').mockReturnValue(0);

    await expect(fetchWithBackoff('https://example.test', {}, 1, 3, 0)).resolves.toMatchObject({
      status: 200,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});
