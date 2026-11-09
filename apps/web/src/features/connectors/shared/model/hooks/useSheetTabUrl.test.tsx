import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import { ConnectorApiService } from '../../api';
import type { ConnectorFieldOptionResponseApiDto } from '../../api';
import { useSheetTabUrl } from './useSheetTabUrl';

const role = vi.hoisted(() => ({ canEdit: true }));

vi.mock('../../../../idp', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../idp')>()),
  useCanEdit: () => role.canEdit,
}));

const definition = (
  name: string,
  configuration: Record<string, unknown>
): ConnectorDefinitionConfig => ({
  connector: {
    source: { name, node: 'sheet', configuration: [configuration], fields: ['a'] },
    storage: { fullyQualifiedName: 'a.b' },
  },
});

const tabUrl = (spreadsheet: string, gid: number) =>
  `https://docs.google.com/spreadsheets/d/${spreadsheet}/edit#gid=${String(gid)}`;

const tabs = (spreadsheet: string): ConnectorFieldOptionResponseApiDto[] => [
  { value: 'Summary', label: 'Summary', url: tabUrl(spreadsheet, 0) },
  { value: 'Leads', label: 'Leads', url: tabUrl(spreadsheet, 42) },
];

// The whole return value, so a test also catches a `waitForUrl` that leaks where none belongs.
const NO_LINK = { url: undefined, waitForUrl: undefined };
const linkTo = (url: string) => ({ url, waitForUrl: undefined });

function renderSheetTabUrl(initial: ConnectorDefinitionConfig) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    ({ connectorDef }: { connectorDef: ConnectorDefinitionConfig }) =>
      useSheetTabUrl(connectorDef, 0),
    { wrapper, initialProps: { connectorDef: initial } }
  );
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useSheetTabUrl', () => {
  beforeEach(() => {
    role.canEdit = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    focusManager.setFocused(undefined);
  });

  it('returns the link of the selected tab from the spreadsheet tab list', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockResolvedValue(tabs('abc'));
    const configuration = { SpreadsheetId: 'abc', SheetName: 'Leads' };

    const { result } = renderSheetTabUrl(definition('GoogleSheets', configuration));

    await waitFor(() => {
      expect(result.current).toEqual(linkTo(tabUrl('abc', 42)));
    });
    expect(previewSpy).toHaveBeenCalledWith(
      'GoogleSheets',
      'SheetName',
      configuration,
      expect.objectContaining({ skipErrorToast: true, skipLoadingIndicator: true }),
      undefined
    );
  });

  it('prefers the exact tab name and falls back to one that differs only in case or spaces', async () => {
    vi.spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions').mockResolvedValue(
      tabs('abc')
    );

    const { result } = renderSheetTabUrl(
      definition('GoogleSheets', { SpreadsheetId: 'abc', SheetName: ' leads ' })
    );

    await waitFor(() => {
      expect(result.current).toEqual(linkTo(tabUrl('abc', 42)));
    });
  });

  it('never returns a tab of the previous spreadsheet after the spreadsheet changes', async () => {
    const second = deferred<ConnectorFieldOptionResponseApiDto[]>();
    vi.spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockResolvedValueOnce(tabs('first'))
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderSheetTabUrl(
      definition('GoogleSheets', { SpreadsheetId: 'first', SheetName: 'Leads' })
    );
    await waitFor(() => {
      expect(result.current).toEqual(linkTo(tabUrl('first', 42)));
    });

    rerender({
      connectorDef: definition('GoogleSheets', { SpreadsheetId: 'second', SheetName: 'Leads' }),
    });
    expect(result.current.url).toBeUndefined();
    expect(result.current.waitForUrl).toEqual(expect.any(Function));

    second.resolve(tabs('second'));
    await waitFor(() => {
      expect(result.current).toEqual(linkTo(tabUrl('second', 42)));
    });
  });

  it('lets a click wait for the tab link while the list loads, joining the request in flight', async () => {
    const list = deferred<ConnectorFieldOptionResponseApiDto[]>();
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockReturnValue(list.promise);

    const { result } = renderSheetTabUrl(
      definition('GoogleSheets', { SpreadsheetId: 'abc', SheetName: 'Leads' })
    );

    expect(result.current.url).toBeUndefined();
    const pending = result.current.waitForUrl?.();
    expect(pending).toBeDefined();

    list.resolve(tabs('abc'));
    await expect(pending).resolves.toBe(tabUrl('abc', 42));
    expect(previewSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(result.current).toEqual(linkTo(tabUrl('abc', 42)));
    });
  });

  it('retries a transient failure once even while the page is hidden behind the opened tab', async () => {
    // React Query pauses its own retries on a hidden page; the click hides it by opening a tab.
    focusManager.setFocused(false);
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockRejectedValueOnce({ response: { status: 502 } })
      .mockResolvedValueOnce(tabs('abc'));

    const { result } = renderSheetTabUrl(
      definition('GoogleSheets', { SpreadsheetId: 'abc', SheetName: 'Leads' })
    );

    await expect(result.current.waitForUrl?.()).resolves.toBe(tabUrl('abc', 42));
    expect(previewSpy).toHaveBeenCalledTimes(2);
  });

  it('gives no link and no wait once the tab list cannot be loaded, without retrying', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockRejectedValue({ response: { status: 403 } });

    const { result } = renderSheetTabUrl(
      definition('GoogleSheets', { SpreadsheetId: 'abc', SheetName: 'Leads' })
    );

    await waitFor(() => {
      expect(result.current).toEqual(NO_LINK);
    });
    expect(previewSpy).toHaveBeenCalledTimes(1);
  });

  it('requests nothing for a Viewer, for other sources or without a sheet name', () => {
    const previewSpy = vi.spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions');

    const { result: other } = renderSheetTabUrl(
      definition('FacebookMarketing', { SpreadsheetId: 'abc', SheetName: 'Leads' })
    );
    const { result: noSheet } = renderSheetTabUrl(
      definition('GoogleSheets', { SpreadsheetId: 'abc', SheetName: '' })
    );
    role.canEdit = false;
    const { result: viewer } = renderSheetTabUrl(
      definition('GoogleSheets', { SpreadsheetId: 'abc', SheetName: 'Leads' })
    );

    expect(previewSpy).not.toHaveBeenCalled();
    expect(other.current).toEqual(NO_LINK);
    expect(noSheet.current).toEqual(NO_LINK);
    expect(viewer.current).toEqual(NO_LINK);
  });
});
