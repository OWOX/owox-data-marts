import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { trackEvent } from '../../../../utils/data-layer';
import { useConnectorsList } from './useConnectorsList';

const list = vi.fn();
const softDelete = vi.fn();
vi.mock('../../../connector-builder/shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    list = list;
    softDelete = softDelete;
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../../utils/data-layer', () => ({ trackEvent: vi.fn() }));

const item = {
  id: 'c1',
  name: 'acme',
  title: 'Acme',
  description: null,
  logo: null,
  docUrl: null,
  activeVersionId: 'v3',
  activeVersion: 3,
};

describe('useConnectorsList', () => {
  beforeEach(() => {
    list.mockReset();
    softDelete.mockReset();
  });

  it('loads connectors on mount', async () => {
    list.mockResolvedValue([item]);
    const { result } = renderHook(() => useConnectorsList());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.connectors).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('sets error on list failure', async () => {
    list.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useConnectorsList());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('boom');
  });

  it('deleteConnector calls softDelete then refetches', async () => {
    list.mockResolvedValue([]);
    softDelete.mockResolvedValue(undefined);
    const { result } = renderHook(() => useConnectorsList());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    list.mockClear();
    await act(async () => {
      await result.current.deleteConnector('c1');
    });
    expect(softDelete).toHaveBeenCalledWith('c1');
    expect(list).toHaveBeenCalledTimes(1);
  });

  // The list is where most deletes happen: it needs no builder.
  describe('reports a delete from the list', () => {
    const sent = (event: string) =>
      vi
        .mocked(trackEvent)
        .mock.calls.map(([payload]) => payload)
        .filter(payload => payload.event === event);

    const loaded = async () => {
      list.mockResolvedValue([item]);
      const hook = renderHook(() => useConnectorsList());
      await waitFor(() => {
        expect(hook.result.current.loading).toBe(false);
      });
      vi.mocked(trackEvent).mockClear();
      return hook.result;
    };

    it('as deleted, naming the connector', async () => {
      softDelete.mockResolvedValue(undefined);
      const result = await loaded();
      await act(async () => {
        await result.current.deleteConnector('c1');
      });

      expect(sent('custom_connector_deleted')).toEqual([
        expect.objectContaining({
          connectorId: 'c1',
          connectorName: 'acme',
          connectorTitle: 'Acme',
          where: 'connectors_list',
        }),
      ]);
    });

    it('as a DeleteError with the refusal it got', async () => {
      softDelete.mockRejectedValue(
        new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
          status: 409,
          statusText: '',
          headers: {},
          config: { headers: new AxiosHeaders() },
          data: {
            message: 'Cannot delete the connector because it is referenced by existing data marts.',
          },
        })
      );
      const result = await loaded();
      await act(async () => {
        await result.current.deleteConnector('c1');
      });

      expect(sent('custom_connector_deleted')).toEqual([]);
      expect(sent('custom_connector_error')).toEqual([
        expect.objectContaining({
          action: 'DeleteError',
          connectorId: 'c1',
          errorKind: 'conflict',
          httpStatus: 409,
          where: 'connectors_list',
        }),
      ]);
    });
  });
});
