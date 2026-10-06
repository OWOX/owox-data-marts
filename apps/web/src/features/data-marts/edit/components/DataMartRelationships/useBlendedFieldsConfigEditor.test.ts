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
      { initialProps: { savedConfig: { sources: [products] } } }
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
});
