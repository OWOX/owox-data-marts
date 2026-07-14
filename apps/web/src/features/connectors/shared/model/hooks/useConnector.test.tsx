import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorFieldsResponseApiDto } from '../../api';
import { ConnectorApiService } from '../../api';
import { ConnectorContextProvider } from '../context';
import { useConnector } from './useConnector';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

const wrapper = ({ children }: PropsWithChildren) => (
  <ConnectorContextProvider>{children}</ConnectorContextProvider>
);

describe('useConnector preview requests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aborts the previous preview and ignores its stale response', async () => {
    const first = deferred<ConnectorFieldsResponseApiDto[]>();
    const second = deferred<ConnectorFieldsResponseApiDto[]>();
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFields')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useConnector(), { wrapper });

    let firstRequest!: Promise<ConnectorFieldsResponseApiDto[] | null>;
    let secondRequest!: Promise<ConnectorFieldsResponseApiDto[] | null>;
    act(() => {
      firstRequest = result.current.previewConnectorFields('GoogleSheets', { SheetName: 'Old' });
      secondRequest = result.current.previewConnectorFields('GoogleSheets', { SheetName: 'New' });
    });

    const firstSignal = previewSpy.mock.calls[0]?.[2]?.signal;
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => {
      second.resolve([{ name: 'sheet', fields: [{ name: 'New Column' }] }]);
      await secondRequest;
    });

    await act(async () => {
      first.resolve([{ name: 'sheet', fields: [{ name: 'Old Column' }] }]);
      expect(await firstRequest).toBeNull();
    });

    await waitFor(() => {
      expect(result.current.connectorFields?.[0]?.fields?.[0]?.name).toBe('New Column');
      expect(result.current.loadingFields).toBe(false);
    });
  });
});
