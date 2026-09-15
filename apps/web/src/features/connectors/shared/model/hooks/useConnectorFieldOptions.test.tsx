import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorFieldOptionResponseApiDto } from '../../api';
import { ConnectorApiService } from '../../api';
import { useConnectorFieldOptions } from './useConnectorFieldOptions';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const sheets: ConnectorFieldOptionResponseApiDto[] = [
  { value: 'Summary', label: 'Summary' },
  { value: 'Data', label: 'Data' },
];

describe('useConnectorFieldOptions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits until every dependency is filled and then loads the options once', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockResolvedValue(sheets);

    const { result, rerender } = renderHook(
      ({ configuration }: { configuration: Record<string, unknown> }) =>
        useConnectorFieldOptions({
          connectorName: 'GoogleSheets',
          field: 'SheetName',
          configuration,
          dependsOn: ['SpreadsheetId'],
        }),
      { initialProps: { configuration: { SpreadsheetId: '' } as Record<string, unknown> } }
    );

    expect(result.current.status).toBe('waiting');
    expect(previewSpy).not.toHaveBeenCalled();

    rerender({ configuration: { SpreadsheetId: 'sheet-1', HeaderRow: 1 } });
    expect(result.current.status).toBe('loading');

    await waitFor(() => {
      expect(result.current.status).toBe('loaded');
    });
    expect(result.current.options).toEqual(sheets);
    expect(previewSpy).toHaveBeenCalledTimes(1);
    expect(previewSpy).toHaveBeenCalledWith(
      'GoogleSheets',
      'SheetName',
      { SpreadsheetId: 'sheet-1', HeaderRow: 1 },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    rerender({ configuration: { SpreadsheetId: 'sheet-1', HeaderRow: 2 } });
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(previewSpy).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('loaded');
  });

  it('drops the stale response when a dependency changes while loading', async () => {
    const first = deferred<ConnectorFieldOptionResponseApiDto[]>();
    const second = deferred<ConnectorFieldOptionResponseApiDto[]>();
    vi.spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ configuration }: { configuration: Record<string, unknown> }) =>
        useConnectorFieldOptions({
          connectorName: 'GoogleSheets',
          field: 'SheetName',
          configuration,
          dependsOn: ['SpreadsheetId'],
        }),
      { initialProps: { configuration: { SpreadsheetId: 'sheet-1' } as Record<string, unknown> } }
    );

    await new Promise(resolve => setTimeout(resolve, 500));
    rerender({ configuration: { SpreadsheetId: 'sheet-2' } });
    await new Promise(resolve => setTimeout(resolve, 500));

    await act(async () => {
      first.resolve([{ value: 'Old', label: 'Old' }]);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('loading');

    await act(async () => {
      second.resolve(sheets);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.status).toBe('loaded');
    });
    expect(result.current.options).toEqual(sheets);
  });

  it('prefers the backend message and opts out of the global error toast', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockRejectedValue({
        response: {
          status: 400,
          data: { message: 'Connector credentials are invalid or expired' },
        },
      });

    const { result } = renderHook(() =>
      useConnectorFieldOptions({
        connectorName: 'GoogleSheets',
        field: 'SheetName',
        configuration: { SpreadsheetId: 'sheet-1' },
        dependsOn: ['SpreadsheetId'],
      })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toBe('Connector credentials are invalid or expired');
    expect(previewSpy).toHaveBeenCalledWith(
      'GoogleSheets',
      'SheetName',
      { SpreadsheetId: 'sheet-1' },
      expect.objectContaining({ skipErrorToast: true, skipLoadingIndicator: true })
    );
  });

  it('exposes the failure and reloads on demand', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockRejectedValueOnce(new Error('Google Sheets access denied'))
      .mockResolvedValueOnce(sheets);

    const { result } = renderHook(() =>
      useConnectorFieldOptions({
        connectorName: 'GoogleSheets',
        field: 'SheetName',
        configuration: { SpreadsheetId: 'sheet-1' },
        dependsOn: ['SpreadsheetId'],
      })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toBe('Google Sheets access denied');
    expect(result.current.options).toEqual([]);

    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.status).toBe('loaded');
    });
    expect(result.current.options).toEqual(sheets);
    expect(previewSpy).toHaveBeenCalledTimes(2);
  });
});
