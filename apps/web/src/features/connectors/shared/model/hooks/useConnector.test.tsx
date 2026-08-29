import type { PropsWithChildren } from 'react';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ConnectorFieldsResponseApiDto,
  ConnectorSpecificationResponseApiDto,
} from '../../api';
import { ConnectorApiService } from '../../api';
import type { ConnectorListItem } from '../types/connector';
import { ConnectorContextProvider } from '../context';
import { useConnector } from './useConnector';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const fields = (node: string, field: string) => [{ name: node, fields: [{ name: field }] }];

const specification = (parameter: string): ConnectorSpecificationResponseApiDto[] => [
  { name: parameter },
];

const pinnedConnector = (version: number): ConnectorListItem => ({
  name: 'MyCustom',
  displayName: 'My Custom',
  description: '',
  logoBase64: null,
  docUrl: null,
  isCustom: true,
  id: 'custom-1',
  version,
});

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
    vi.spyOn(ConnectorApiService.prototype, 'previewConnectorFields').mockResolvedValue(
      fields('sheet', 'Sheet Column')
    );
    const { result } = renderHook(() => useConnector(), { wrapper });

    let staticRequest!: Promise<void>;
    await act(async () => {
      staticRequest = result.current.fetchConnectorFields({
        name: 'GoogleAds',
        displayName: 'Google Ads',
        description: '',
        logoBase64: null,
        docUrl: null,
      });
      await result.current.previewConnectorFields('GoogleSheets', { SheetName: 'Current' });
    });
    await act(async () => {
      staticFields.resolve(fields('ads', 'Ad Field'));
      await staticRequest;
    });

    expect(result.current.connectorFields?.[0]?.fields?.[0]?.name).toBe('Sheet Column');
  });

  it('aborts the preview request when the editor unmounts', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFields')
      .mockReturnValue(new Promise(() => undefined));
    const PreviewControl = () => {
      const { loadingFields, previewConnectorFields } = useConnector();
      return (
        <button
          type='button'
          onClick={() => void previewConnectorFields('GoogleSheets', { SheetName: 'Data' })}
        >
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
    const signal = previewSpy.mock.calls[0]?.[2]?.signal;
    expect(signal?.aborted).toBe(false);

    view.rerender(<ConnectorContextProvider>{null}</ConnectorContextProvider>);
    expect(signal?.aborted).toBe(true);

    view.rerender(
      <ConnectorContextProvider>
        <PreviewControl />
      </ConnectorContextProvider>
    );
    expect(view.getByRole('button')).toHaveTextContent('false');
  });
});

describe('useConnector specification requests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores a superseded specification response that resolves last', async () => {
    const active = deferred<ConnectorSpecificationResponseApiDto[]>();
    const pinned = deferred<ConnectorSpecificationResponseApiDto[]>();
    vi.spyOn(ConnectorApiService.prototype, 'getCustomConnectorSpecification').mockImplementation(
      (_id, version) => (version === 3 ? active.promise : pinned.promise)
    );
    const { result } = renderHook(() => useConnector(), { wrapper });

    let activeRequest!: Promise<void>;
    let pinnedRequest!: Promise<void>;
    act(() => {
      activeRequest = result.current.fetchConnectorSpecification(pinnedConnector(3));
      pinnedRequest = result.current.fetchConnectorSpecification(pinnedConnector(1));
    });

    await act(async () => {
      pinned.resolve(specification('v1 parameter'));
      await pinnedRequest;
    });

    // The superseded v3 request answers after the pin the user actually asked for.
    await act(async () => {
      active.resolve(specification('v3 parameter'));
      await activeRequest;
    });

    expect(result.current.connectorSpecification?.[0]?.name).toBe('v1 parameter');
    expect(result.current.loadingSpecification).toBe(false);
  });

  it('ignores a superseded specification failure that rejects last', async () => {
    const active = deferred<ConnectorSpecificationResponseApiDto[]>();
    const pinned = deferred<ConnectorSpecificationResponseApiDto[]>();
    vi.spyOn(ConnectorApiService.prototype, 'getCustomConnectorSpecification').mockImplementation(
      (_id, version) => (version === 3 ? active.promise : pinned.promise)
    );
    const { result } = renderHook(() => useConnector(), { wrapper });

    let activeRequest!: Promise<void>;
    let pinnedRequest!: Promise<void>;
    act(() => {
      activeRequest = result.current.fetchConnectorSpecification(pinnedConnector(3));
      pinnedRequest = result.current.fetchConnectorSpecification(pinnedConnector(1));
    });

    await act(async () => {
      pinned.resolve(specification('v1 parameter'));
      await pinnedRequest;
    });

    await act(async () => {
      active.reject(new Error('version 3 is gone'));
      await activeRequest;
    });

    expect(result.current.connectorSpecification?.[0]?.name).toBe('v1 parameter');
    expect(result.current.error).toBeNull();
  });
});
