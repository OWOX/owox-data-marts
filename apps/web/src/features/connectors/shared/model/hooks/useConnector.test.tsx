import type { PropsWithChildren } from 'react';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
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

const fields = (node: string, field: string) => [{ name: node, fields: [{ name: field }] }];

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
      .spyOn(ConnectorApiService.prototype, 'previewGoogleSheetsFields')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useConnector(), { wrapper });

    let firstRequest!: Promise<ConnectorFieldsResponseApiDto[] | null>;
    let secondRequest!: Promise<ConnectorFieldsResponseApiDto[] | null>;
    act(() => {
      firstRequest = result.current.previewGoogleSheetsFields({ SheetName: 'Old' });
      secondRequest = result.current.previewGoogleSheetsFields({ SheetName: 'New' });
    });

    const firstSignal = previewSpy.mock.calls[0]?.[1]?.signal;
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => {
      second.resolve(fields('sheet', 'New Column'));
      await secondRequest;
    });

    await act(async () => {
      first.resolve(fields('sheet', 'Old Column'));
      expect(await firstRequest).toBeNull();
    });

    await waitFor(() => {
      expect(result.current.connectorFields?.[0]?.fields?.[0]?.name).toBe('New Column');
      expect(result.current.loadingFields).toBe(false);
    });
  });

  it('ignores a static-fields response superseded by a sheet preview', async () => {
    const staticFields = deferred<ConnectorFieldsResponseApiDto[]>();
    vi.spyOn(ConnectorApiService.prototype, 'getConnectorFields').mockReturnValue(
      staticFields.promise
    );
    vi.spyOn(ConnectorApiService.prototype, 'previewGoogleSheetsFields').mockResolvedValue(
      fields('sheet', 'Sheet Column')
    );
    const { result } = renderHook(() => useConnector(), { wrapper });

    let staticRequest!: Promise<void>;
    await act(async () => {
      staticRequest = result.current.fetchConnectorFields('GoogleAds');
      await result.current.previewGoogleSheetsFields({ SheetName: 'Current' });
    });
    await act(async () => {
      staticFields.resolve(fields('ads', 'Ad Field'));
      await staticRequest;
    });

    expect(result.current.connectorFields?.[0]?.fields?.[0]?.name).toBe('Sheet Column');
  });

  it('clears preview loading when the editor unmounts', async () => {
    vi.spyOn(ConnectorApiService.prototype, 'previewGoogleSheetsFields').mockReturnValue(
      new Promise(() => undefined)
    );
    const PreviewControl = () => {
      const { loadingFields, previewGoogleSheetsFields } = useConnector();
      return (
        <button type='button' onClick={() => void previewGoogleSheetsFields({ SheetName: 'Data' })}>
          {String(loadingFields)}
        </button>
      );
    };
    const view = render(
      <ConnectorContextProvider>
        <PreviewControl />
      </ConnectorContextProvider>
    );
    fireEvent.click(view.getByRole('button'));
    expect(view.getByRole('button')).toHaveTextContent('true');
    view.rerender(<ConnectorContextProvider>{null}</ConnectorContextProvider>);
    view.rerender(
      <ConnectorContextProvider>
        <PreviewControl />
      </ConnectorContextProvider>
    );
    expect(view.getByRole('button')).toHaveTextContent('false');
  });
});
