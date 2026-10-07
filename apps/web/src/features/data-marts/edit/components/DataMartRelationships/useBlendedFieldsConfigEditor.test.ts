import { createElement, type ReactNode } from 'react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type { BlendedFieldsConfig } from '../../../shared/types/relationship.types';
import { useBlendedFieldsConfigEditor } from './useBlendedFieldsConfigEditor';

vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }));

vi.mock('../../../shared/services/data-mart-relationship.service', () => ({
  dataMartRelationshipService: { updateBlendedFieldsConfig: vi.fn() },
}));

type SaveResponse = Awaited<
  ReturnType<typeof dataMartRelationshipService.updateBlendedFieldsConfig>
>;

const responseWith = (blendedFieldsConfig: BlendedFieldsConfig) =>
  ({ id: 'orders', blendedFieldsConfig }) as unknown as SaveResponse;

function withQueryClient(queryClient = new QueryClient()) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function deferredSave() {
  let resolve: (response: SaveResponse) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<SaveResponse>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve: (response: SaveResponse) => {
      resolve(response);
    },
    reject: (error: Error) => {
      reject(error);
    },
  };
}

const sentConfigs = (): BlendedFieldsConfig[] =>
  vi
    .mocked(dataMartRelationshipService.updateBlendedFieldsConfig)
    .mock.calls.map(call => call[1] ?? { sources: [] });

describe('useBlendedFieldsConfigEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps an edit when a config fetched before its save arrives while the save is on the wire', async () => {
    let resolveSave: (response: SaveResponse) => void = () => undefined;
    vi.mocked(dataMartRelationshipService.updateBlendedFieldsConfig).mockImplementationOnce(
      () =>
        new Promise<SaveResponse>(resolve => {
          resolveSave = resolve;
        })
    );
    const products = { path: 'products', alias: 'prod' };
    const onSaved = vi.fn();
    const { result, rerender } = renderHook(
      ({ savedConfig }: { savedConfig: BlendedFieldsConfig }) =>
        useBlendedFieldsConfigEditor({ dataMartId: 'orders', savedConfig, onSaved }),
      { initialProps: { savedConfig: { sources: [products] } }, wrapper: withQueryClient() }
    );

    act(() => {
      result.current.onHideForReportingChange('customers', 'customers', true);
    });
    const edited = {
      sources: [products, { path: 'customers', alias: 'customers', isExcluded: true }],
    };
    expect(result.current.localConfig).toEqual(edited);

    // A refetch served before the save lands now, with the config as it was.
    rerender({ savedConfig: { sources: [products] } });
    expect(result.current.localConfig).toEqual(edited);

    await waitFor(() => {
      expect(dataMartRelationshipService.updateBlendedFieldsConfig).toHaveBeenCalledOnce();
    });
    act(() => {
      resolveSave(responseWith(edited));
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });

    // Once the save has settled, the server's config is taken again.
    const fromServer = { sources: [products] };
    rerender({ savedConfig: fromServer });
    expect(result.current.localConfig).toBe(fromServer);
  });

  it('lets an editor mounted while a save is pending start from it and queue behind it', async () => {
    const first = deferredSave();
    vi.mocked(dataMartRelationshipService.updateBlendedFieldsConfig)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(responseWith({ sources: [] }));
    const wrapper = withQueryClient();
    const staleConfig = { sources: [{ path: 'products', alias: 'prod' }] };
    const render = () =>
      renderHook(
        () =>
          useBlendedFieldsConfigEditor({
            dataMartId: 'orders',
            savedConfig: staleConfig,
            onSaved: vi.fn(),
          }),
        { wrapper }
      );

    const firstEditor = render();
    act(() => {
      firstEditor.result.current.onHideForReportingChange('customers', 'customers', true);
    });
    await waitFor(() => {
      expect(sentConfigs()).toHaveLength(1);
    });
    // The sheet moves to another source and back while the save is on the wire.
    firstEditor.unmount();
    const secondEditor = render();
    expect(secondEditor.result.current.localConfig).toEqual(sentConfigs()[0]);

    act(() => {
      secondEditor.result.current.onHideForReportingChange('products', 'prod', true);
    });
    expect(sentConfigs()).toHaveLength(1);

    act(() => {
      first.resolve(responseWith(sentConfigs()[0]));
    });
    await waitFor(() => {
      expect(sentConfigs()).toHaveLength(2);
    });
    expect(sentConfigs()[1]).toEqual({
      sources: [
        { path: 'customers', alias: 'customers', isExcluded: true },
        { path: 'products', alias: 'prod', isExcluded: true },
      ],
    });
  });

  it('falls back to the last answered save when a later one fails', async () => {
    const first = deferredSave();
    const second = deferredSave();
    vi.mocked(dataMartRelationshipService.updateBlendedFieldsConfig)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const initial: BlendedFieldsConfig = { sources: [] };
    const { result, rerender } = renderHook(
      ({ savedConfig }: { savedConfig: BlendedFieldsConfig }) =>
        useBlendedFieldsConfigEditor({
          dataMartId: 'orders',
          savedConfig,
          onSaved: response => {
            rerender({ savedConfig: response.blendedFieldsConfig ?? initial });
          },
        }),
      { initialProps: { savedConfig: initial }, wrapper: withQueryClient() }
    );

    act(() => {
      result.current.onHideForReportingChange('customers', 'customers', true);
    });
    await waitFor(() => {
      expect(sentConfigs()).toHaveLength(1);
    });
    act(() => {
      result.current.onHideForReportingChange('products', 'products', true);
    });
    const firstSaved = sentConfigs()[0];
    act(() => {
      first.resolve(responseWith(firstSaved));
    });
    await waitFor(() => {
      expect(sentConfigs()).toHaveLength(2);
    });

    act(() => {
      second.reject(new Error('network down'));
    });

    // The first save went through: the failure of the second one keeps it.
    await waitFor(() => {
      expect(result.current.localConfig).toEqual(firstSaved);
    });
  });

  it('sends a queued save while the tab is in the background', async () => {
    const first = deferredSave();
    vi.mocked(dataMartRelationshipService.updateBlendedFieldsConfig)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(responseWith({ sources: [] }));
    const { result } = renderHook(
      () =>
        useBlendedFieldsConfigEditor({
          dataMartId: 'orders',
          savedConfig: { sources: [] },
          onSaved: vi.fn(),
        }),
      { wrapper: withQueryClient() }
    );
    focusManager.setFocused(false);
    try {
      act(() => {
        result.current.onHideForReportingChange('customers', 'customers', true);
      });
      await waitFor(() => {
        expect(sentConfigs()).toHaveLength(1);
      });
      act(() => {
        result.current.onHideForReportingChange('products', 'products', true);
      });

      // The user switched to another tab; the queued save must not wait for them to come back.
      act(() => {
        first.resolve(responseWith(sentConfigs()[0]));
      });
      await waitFor(() => {
        expect(sentConfigs()).toHaveLength(2);
      });
    } finally {
      focusManager.setFocused(undefined);
    }
  });
});
