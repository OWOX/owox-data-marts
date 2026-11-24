import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { ConnectorBuilderApiService } from '../../api/connector-builder-api.service';
import { createEmptyManifest } from '../manifest.types';
import { credentialsLoadReason, useTestCredentials } from './useTestCredentials';

const requirement = { hosts: ['api.example.com'], fieldList: [], keyParameters: ['Token'] };
const REFUSAL =
  'Invalid manifest: ManifestParser: node "items" uniqueKeys names "iid", which is not one of its fields';
const failed = (status: number, message?: string) =>
  new AxiosError(`Request failed with status code ${status}`, undefined, undefined, undefined, {
    status,
    data: message === undefined ? {} : { message },
  } as AxiosResponse);

async function errorState(rejection: Error) {
  vi.spyOn(ConnectorBuilderApiService.prototype, 'fittingCredentials').mockRejectedValue(rejection);
  vi.spyOn(ConnectorBuilderApiService.prototype, 'credentialRequirement').mockResolvedValue(
    requirement
  );
  const hook = renderHook(() =>
    useTestCredentials({ manifest: createEmptyManifest(), node: 'items' })
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  return hook.result;
}

describe('useTestCredentials', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lists the fitting Credentials of the manifest in the editor, once typing pauses', async () => {
    const fitting = vi
      .spyOn(ConnectorBuilderApiService.prototype, 'fittingCredentials')
      .mockResolvedValue([{ id: 'c1', title: 'Key', hosts: [], fieldKeys: [], refusal: null }]);
    vi.spyOn(ConnectorBuilderApiService.prototype, 'credentialRequirement').mockResolvedValue(
      requirement
    );
    const manifest = createEmptyManifest();
    const { result, rerender } = renderHook(
      ({ name }) => useTestCredentials({ manifest: { ...manifest, name }, node: 'items' }),
      { initialProps: { name: 'a' } }
    );
    rerender({ name: 'ab' });
    rerender({ name: 'abc' });
    expect(result.current.state).toEqual({ status: 'loading' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        ids: ['c1'],
        refusals: {},
        requirement,
      });
    });
    expect(fitting).toHaveBeenCalledTimes(1);
    expect(fitting).toHaveBeenCalledWith({
      manifest: { ...manifest, name: 'abc' },
      node: 'items',
    });
  });

  it('reports a failed lookup and retries it', async () => {
    const fitting = vi
      .spyOn(ConnectorBuilderApiService.prototype, 'fittingCredentials')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue([]);
    vi.spyOn(ConnectorBuilderApiService.prototype, 'credentialRequirement').mockResolvedValue(
      requirement
    );
    const { result } = renderHook(() =>
      useTestCredentials({ manifest: createEmptyManifest(), node: 'items' })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await waitFor(() => {
      expect(result.current.state).toStrictEqual({ status: 'error' });
    });
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', ids: [], refusals: {}, requirement });
    });
    expect(fitting).toHaveBeenCalledTimes(2);
  });

  it('keeps the reason of a refused lookup', async () => {
    const result = await errorState(failed(400, REFUSAL));
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'error', reason: REFUSAL });
    });
  });

  it.each([503, 429, 408])('gives no reason for a %i that a retry can fix', async status => {
    const result = await errorState(failed(status, 'Busy'));
    await waitFor(() => {
      expect(result.current.state).toStrictEqual({ status: 'error' });
    });
  });

  it('gives no reason for a refusal without a message', async () => {
    const result = await errorState(failed(400, '  '));
    await waitFor(() => {
      expect(result.current.state).toStrictEqual({ status: 'error' });
    });
  });

  it('gives no reason for a message that is not text', async () => {
    const rejection = new AxiosError('bad', undefined, undefined, undefined, {
      status: 400,
      data: { message: ['a', 'b'] },
    } as AxiosResponse);
    const result = await errorState(rejection);
    await waitFor(() => {
      expect(result.current.state).toStrictEqual({ status: 'error' });
    });
  });

  it('asks again once the manifest changes after a refusal', async () => {
    const fitting = vi
      .spyOn(ConnectorBuilderApiService.prototype, 'fittingCredentials')
      .mockRejectedValueOnce(failed(400, REFUSAL))
      .mockResolvedValue([]);
    vi.spyOn(ConnectorBuilderApiService.prototype, 'credentialRequirement').mockResolvedValue(
      requirement
    );
    const manifest = createEmptyManifest();
    const { result, rerender } = renderHook(
      ({ name }) => useTestCredentials({ manifest: { ...manifest, name }, node: 'items' }),
      { initialProps: { name: 'a' } }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'error', reason: REFUSAL });
    });
    rerender({ name: 'ab' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', ids: [], refusals: {}, requirement });
    });
    expect(fitting).toHaveBeenCalledTimes(2);
  });

  it('offers only the fitting Credentials and keeps why the others are refused', async () => {
    const secret = {
      reason: 'secret' as const,
      message: 'This Credential keeps Token as a public field; this connector needs it secret.',
    };
    vi.spyOn(ConnectorBuilderApiService.prototype, 'fittingCredentials').mockResolvedValue([
      { id: 'refused', title: 'Public', hosts: [], fieldKeys: [], refusal: secret },
      { id: 'fits', title: 'Key', hosts: [], fieldKeys: [], refusal: null },
    ]);
    vi.spyOn(ConnectorBuilderApiService.prototype, 'credentialRequirement').mockResolvedValue(
      requirement
    );
    const { result } = renderHook(() =>
      useTestCredentials({ manifest: createEmptyManifest(), node: 'items' })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        ids: ['fits'],
        refusals: { refused: secret },
        requirement,
      });
    });
  });

  it('asks nothing without a query', () => {
    const fitting = vi.spyOn(ConnectorBuilderApiService.prototype, 'fittingCredentials');
    const { result } = renderHook(() => useTestCredentials(null));
    expect(result.current.state).toEqual({ status: 'loading' });
    expect(fitting).not.toHaveBeenCalled();
  });
});

describe('credentialsLoadReason', () => {
  it.each([
    ['a network error', new Error('offline'), undefined],
    ['no error', undefined, undefined],
    ['a 400 with padded text', failed(400, '  Invalid manifest  '), 'Invalid manifest'],
    ['a 499', failed(499, 'Refused'), 'Refused'],
    ['a 500', failed(500, 'Refused'), undefined],
    ['a 404 without a message', failed(404), undefined],
    [
      'a message that is not text',
      new AxiosError('bad', undefined, undefined, undefined, {
        status: 400,
        data: { message: 42 },
      } as AxiosResponse),
      undefined,
    ],
    [
      'a failed request validation',
      new AxiosError('bad', undefined, undefined, undefined, {
        status: 400,
        data: {
          message: 'Request validation failed',
          details: {
            errors: [{ message: 'manifest must be shorter than or equal to 122880 characters' }],
          },
        },
      } as AxiosResponse),
      'Request validation failed. manifest must be shorter than or equal to 122880 characters',
    ],
  ])('reads %s', (_name, error, expected) => {
    expect(credentialsLoadReason(error)).toBe(expected);
  });
});
