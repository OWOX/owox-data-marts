import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
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
});
