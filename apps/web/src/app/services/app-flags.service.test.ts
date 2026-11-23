import { afterEach, expect, it, vi } from 'vitest';
import { appFlagsService } from './app-flags.service';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('loads public flags without auth-client refresh, cookies or the signed-link referrer', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ IDP_PROVIDER: 'owox-better-auth' }));
  vi.stubGlobal('fetch', fetch);
  const signal = new AbortController().signal;
  expect(await appFlagsService.getPublicFlags(signal)).toEqual({
    IDP_PROVIDER: 'owox-better-auth',
  });
  expect(fetch).toHaveBeenCalledWith('/api/flags', {
    signal,
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  });
});

it('keeps a failed public flags request as an error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  await expect(appFlagsService.getPublicFlags(new AbortController().signal)).rejects.toThrow(
    'Could not load profile settings.'
  );
});
