import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { BuilderProvider } from '../context/BuilderProvider';
import { createEmptyManifest } from '../manifest.types';
import { ConnectorBuilderApiService } from '../../api/connector-builder-api.service';
import { useBuilder } from './useBuilder';

describe('builder revision writes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('keeps its own save revision when another author changes the subsequent detail read', async () => {
    const manifest = { ...createEmptyManifest(), name: 'Source' };
    const detail = {
      id: 'id',
      name: 'Source',
      title: 'Source',
      description: null,
      logo: null,
      docUrl: null,
      activeVersionId: null,
      activeVersion: null,
      versions: [{ version: 1, status: 'draft' as const, publishedAt: null }],
    };
    vi.spyOn(ConnectorBuilderApiService.prototype, 'getById')
      .mockResolvedValueOnce({ ...detail, revision: 7 })
      .mockResolvedValue({ ...detail, revision: 99 });
    vi.spyOn(ConnectorBuilderApiService.prototype, 'getVersion').mockResolvedValue({
      version: 1,
      status: 'draft',
      manifest,
    });
    const save = vi
      .spyOn(ConnectorBuilderApiService.prototype, 'saveDraft')
      .mockResolvedValue({ version: 1, status: 'draft', publishedAt: null, revision: 8 });
    const publish = vi
      .spyOn(ConnectorBuilderApiService.prototype, 'publish')
      .mockRejectedValue(new Error('stale revision'));
    const { result } = renderHook(() => useBuilder(), { wrapper: BuilderProvider });
    await act(async () => {
      await result.current.loadConnector('id');
    });
    act(() => {
      result.current.setPath(['title'], 'edited');
    });
    await act(async () => {
      await result.current.publish();
    });
    expect(save).toHaveBeenCalledWith('id', expect.objectContaining({ title: 'edited' }), 7);
    expect(publish).toHaveBeenCalledWith('id', 8, 1);
    expect(result.current.state.revision).toBe(8);
  });
});
