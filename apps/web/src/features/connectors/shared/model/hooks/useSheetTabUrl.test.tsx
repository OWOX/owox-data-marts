import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

describe('useSheetTabUrl', () => {
  beforeEach(() => {
    role.canEdit = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the link of the selected tab from the spreadsheet tab list', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockResolvedValue(tabs('abc'));
    const configuration = { SpreadsheetId: 'abc', SheetName: 'Leads' };

    const { result } = renderSheetTabUrl(definition('GoogleSheets', configuration));

    await waitFor(() => {
      expect(result.current).toBe(tabUrl('abc', 42));
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
      expect(result.current).toBe(tabUrl('abc', 42));
    });
  });

  it('never returns a tab of the previous spreadsheet after the spreadsheet changes', async () => {
    let resolveSecond: (value: ConnectorFieldOptionResponseApiDto[]) => void = () => undefined;
    vi.spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockResolvedValueOnce(tabs('first'))
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSecond = resolve;
          })
      );

    const { result, rerender } = renderSheetTabUrl(
      definition('GoogleSheets', { SpreadsheetId: 'first', SheetName: 'Leads' })
    );
    await waitFor(() => {
      expect(result.current).toBe(tabUrl('first', 42));
    });

    rerender({
      connectorDef: definition('GoogleSheets', { SpreadsheetId: 'second', SheetName: 'Leads' }),
    });
    expect(result.current).toBeUndefined();

    resolveSecond(tabs('second'));
    await waitFor(() => {
      expect(result.current).toBe(tabUrl('second', 42));
    });
  });

  it('stays undefined when the tab list cannot be loaded', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockRejectedValue({ response: { status: 403 } });

    const { result } = renderSheetTabUrl(
      definition('GoogleSheets', { SpreadsheetId: 'abc', SheetName: 'Leads' })
    );

    await waitFor(() => {
      expect(previewSpy).toHaveBeenCalledTimes(1);
    });
    expect(result.current).toBeUndefined();
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
    expect(other.current).toBeUndefined();
    expect(noSheet.current).toBeUndefined();
    expect(viewer.current).toBeUndefined();
  });
});
