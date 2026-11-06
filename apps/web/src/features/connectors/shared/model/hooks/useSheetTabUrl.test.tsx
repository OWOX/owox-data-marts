import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import { ConnectorApiService } from '../../../shared/api';
import { useSheetTabUrl } from './useSheetTabUrl';

const definition = (
  name: string,
  configuration: Record<string, unknown>
): ConnectorDefinitionConfig => ({
  connector: {
    source: { name, node: 'sheet', configuration: [configuration], fields: ['a'] },
    storage: { fullyQualifiedName: 'a.b' },
  },
});

const tabUrl = (gid: number) => `https://docs.google.com/spreadsheets/d/abc/edit#gid=${gid}`;

describe('useSheetTabUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the link of the selected tab from the spreadsheet tab list', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockResolvedValue([
        { value: 'Summary', label: 'Summary', url: tabUrl(0) },
        { value: 'Leads', label: 'Leads', url: tabUrl(42) },
      ]);
    const configuration = { SpreadsheetId: 'abc', SheetName: ' Leads ' };

    const { result } = renderHook(() =>
      useSheetTabUrl(definition('GoogleSheets', configuration), 0)
    );

    await waitFor(() => {
      expect(result.current).toBe(tabUrl(42));
    });
    expect(previewSpy).toHaveBeenCalledWith(
      'GoogleSheets',
      'SheetName',
      configuration,
      expect.objectContaining({ skipErrorToast: true, skipLoadingIndicator: true }),
      undefined
    );
  });

  it('stays undefined when the tab list cannot be loaded', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockRejectedValue(new Error('Forbidden'));

    const { result } = renderHook(() =>
      useSheetTabUrl(definition('GoogleSheets', { SpreadsheetId: 'abc', SheetName: 'Leads' }), 0)
    );

    await waitFor(() => {
      expect(previewSpy).toHaveBeenCalledTimes(1);
    });
    expect(result.current).toBeUndefined();
  });

  it('requests nothing for other sources or without a sheet name', () => {
    vi.useFakeTimers();
    try {
      const previewSpy = vi.spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions');

      const { result: other } = renderHook(() =>
        useSheetTabUrl(definition('FacebookMarketing', { SpreadsheetId: 'abc' }), 0)
      );
      const { result: noSheet } = renderHook(() =>
        useSheetTabUrl(definition('GoogleSheets', { SpreadsheetId: 'abc', SheetName: '' }), 0)
      );
      vi.runAllTimers();

      expect(previewSpy).not.toHaveBeenCalled();
      expect(other.current).toBeUndefined();
      expect(noSheet.current).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
