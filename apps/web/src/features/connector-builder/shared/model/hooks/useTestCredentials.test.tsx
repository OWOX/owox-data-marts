import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ConnectorBuilderApiService } from '../../api/connector-builder-api.service';
import { createEmptyManifest } from '../manifest.types';
import { useTestCredentials } from './useTestCredentials';

const requirement = { hosts: ['api.example.com'], fieldList: [], keyParameters: ['Token'] };

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
      expect(result.current.state).toEqual({ status: 'error' });
    });
    act(() => {
      result.current.retry();
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
