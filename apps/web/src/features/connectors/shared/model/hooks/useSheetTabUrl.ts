import { useQuery } from '@tanstack/react-query';
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

/** A rate limit or a provider or server failure is retried once; any other error is final. */
function isTransientFailure(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 429 || (status !== undefined && status >= 500);
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

/**
 * The link that opens the Google Sheets tab a configuration imports.
 *
 * The configuration stores only the tab name, while a link to a tab needs its `gid`, so the
 * link is taken from the spreadsheet's tab list, the one the setup wizard picks the tab from.
 * Undefined for other sources, for a Viewer (the lookup needs the Editor role), while the
 * list loads, and when it cannot be loaded: the caller then links the spreadsheet.
 */
export function useSheetTabUrl(
  connectorDef: ConnectorDefinitionConfig,
  configIndex: number
): string | undefined {
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

  const { data: tabs } = useQuery({
    // The whole configuration is the key: another spreadsheet or Credential loads its own
    // list, and a link is never taken from the list of a configuration it no longer has.
    queryKey: [SHEET_TABS_QUERY_KEY, source.name, dataMartId, configuration],
    queryFn: ({ signal }) =>
      new ConnectorApiService().previewConnectorFieldOptions(
        source.name,
        'SheetName',
        configuration,
        // The card falls back to the spreadsheet link: a failed lookup must not toast or
        // flash the global loading indicator.
        { signal, skipErrorToast: true, skipLoadingIndicator: true },
        dataMartId
      ),
    enabled,
    staleTime: SHEET_TABS_STALE_TIME_MS,
    retry: (failureCount, error) => failureCount < 1 && isTransientFailure(error),
    refetchOnWindowFocus: false,
  });

  return enabled && tabs ? findSheetTab(tabs, sheetName)?.url : undefined;
}
