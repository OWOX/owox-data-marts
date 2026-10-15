import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRuntimeToken } from './fetchRuntimeToken';
import { RuntimeTokenRefused } from './pluginHostBridge';

const getRuntimeToken = vi.hoisted(() => vi.fn());
vi.mock('../services/plugins.service', () => ({ pluginsService: { getRuntimeToken } }));

const axiosError = (status: number, data: unknown) => ({ response: { status, data } });

describe('fetchRuntimeToken', () => {
  beforeEach(() => {
    getRuntimeToken.mockReset();
  });

  it('returns the minted token', async () => {
    getRuntimeToken.mockResolvedValue({ runtimeToken: 't', expiresIn: 900 });

    await expect(fetchRuntimeToken('i1')()).resolves.toEqual({ runtimeToken: 't', expiresIn: 900 });
  });

  it('turns a 400 PLUGIN_SUSPENDED into the typed refusal', async () => {
    const body = { code: 'PLUGIN_SUSPENDED', message: 'Plugin is suspended' };
    getRuntimeToken.mockRejectedValue(axiosError(400, body));

    const caught = await fetchRuntimeToken('i1')().catch((e: unknown) => e);

    expect(caught).toBeInstanceOf(RuntimeTokenRefused);
    expect(caught).toMatchObject({ status: 400, body });
  });

  it('passes any other error through unchanged', async () => {
    const other = axiosError(400, { code: 'SOMETHING_ELSE' });
    getRuntimeToken.mockRejectedValue(other);

    await expect(fetchRuntimeToken('i1')()).rejects.toBe(other);
  });
});
