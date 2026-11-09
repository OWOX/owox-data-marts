import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext } from 'react';
import type { ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import { DataMartContext } from '../../../../data-marts/edit/model/context/context';
import { useCanEdit } from '../../../../idp';
import { ConnectorApiService } from '../../api/connector-api.service';
import type { ConnectorFieldOptionResponseApiDto } from '../../api/types/response';
import { GOOGLE_SHEETS_CONNECTOR_NAME } from '../../utils/google-sheets-fields.utils';

const SHEET_TABS_QUERY_KEY = 'google-sheets-tabs';

// A tab keeps its gid for life, so a list loaded once serves the whole visit.
const SHEET_TABS_STALE_TIME_MS = 5 * 60 * 1000;

// Pause before the one retry of a rate limit or a provider or server failure.
const TRANSIENT_RETRY_DELAY_MS = 1000;

/** A rate limit or a provider or server failure is retried once; any other error is final. */
function isTransientFailure(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 429 || (status !== undefined && status >= 500);
}

/** Waits before the retry; a cancelled request ends the wait at once, and its retry then fails. */
function waitBeforeRetry(signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/**
 * The tab the import reads: the one named exactly as configured, else the one whose name
 * differs only in letter case or surrounding spaces.
 */
function findSheetTab(
  tabs: ConnectorFieldOptionResponseApiDto[],
  sheetName: string
): ConnectorFieldOptionResponseApiDto | undefined {
  const exact = tabs.find(tab => tab.value === sheetName);
  if (exact) return exact;
  const loose = sheetName.trim().toLowerCase();
  return tabs.find(tab => tab.value.trim().toLowerCase() === loose);
}

/** The link to the tab a configuration imports, as far as it is known yet. */
export interface SheetTabLink {
  /** The tab's link, once the tab list has loaded and has the tab. */
  url: string | undefined;
  /**
   * Set only while the tab list is still loading: resolves to the tab's link, or to
   * undefined when the list has no such tab, and rejects when the list cannot be loaded.
   */
  waitForUrl: (() => Promise<string | undefined>) | undefined;
}

/**
 * The link that opens the Google Sheets tab a configuration imports.
 *
 * The configuration stores only the tab name, while a link to a tab needs its `gid`, so the
 * link is taken from the spreadsheet's tab list, the one the setup wizard picks the tab from.
 * There is no link for other sources, for a Viewer (the lookup needs the Editor role), or
 * when the list cannot be loaded: the caller then links the spreadsheet. While the list
 * loads, `waitForUrl` lets a click wait for the tab's link instead of opening the spreadsheet.
 */
export function useSheetTabUrl(
  connectorDef: ConnectorDefinitionConfig,
  configIndex: number
): SheetTabLink {
  const queryClient = useQueryClient();
  const dataMartId = useContext(DataMartContext)?.dataMart?.id;
  const canEdit = useCanEdit();
  const { source } = connectorDef.connector;
  const configuration = source.configuration[configIndex] ?? {};
  const sheetName = typeof configuration.SheetName === 'string' ? configuration.SheetName : '';
  const spreadsheet =
    typeof configuration.SpreadsheetId === 'string' ? configuration.SpreadsheetId.trim() : '';
  const enabled =
    canEdit &&
    source.name === GOOGLE_SHEETS_CONNECTOR_NAME &&
    spreadsheet !== '' &&
    sheetName.trim() !== '';

  const tabsQuery = queryOptions({
    // The whole configuration is the key: another spreadsheet or Credential loads its own
    // list, and a link is never taken from the list of a configuration it no longer has.
    queryKey: [SHEET_TABS_QUERY_KEY, source.name, dataMartId, configuration],
    queryFn: async ({ signal }) => {
      const loadTabs = () =>
        new ConnectorApiService().previewConnectorFieldOptions(
          source.name,
          'SheetName',
          configuration,
          // The card falls back to the spreadsheet link: a failed lookup must not toast or
          // flash the global loading indicator.
          { signal, skipErrorToast: true, skipLoadingIndicator: true },
          dataMartId
        );
      try {
        return await loadTabs();
      } catch (error) {
        // Retried here, not by React Query: it pauses its retries while the page is hidden,
        // and a click on the link hides the page by opening the tab that waits for the list.
        if (!isTransientFailure(error) || signal.aborted) throw error;
        await waitBeforeRetry(signal);
        return loadTabs();
      }
    },
    staleTime: SHEET_TABS_STALE_TIME_MS,
    retry: false,
  });
  const { data: tabs, isPending } = useQuery({
    ...tabsQuery,
    enabled,
    refetchOnWindowFocus: false,
  });

  if (!enabled) return { url: undefined, waitForUrl: undefined };
  if (tabs) return { url: findSheetTab(tabs, sheetName)?.url, waitForUrl: undefined };
  return {
    url: undefined,
    // The request is already in flight, so this joins it rather than sending another one.
    waitForUrl: isPending
      ? () => queryClient.query(tabsQuery).then(loaded => findSheetTab(loaded, sheetName)?.url)
      : undefined,
  };
}
