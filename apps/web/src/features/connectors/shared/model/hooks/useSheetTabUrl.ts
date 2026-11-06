import type { ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import { useConnectorFieldOptions } from '../../../shared/model/hooks/useConnectorFieldOptions';
import { GOOGLE_SHEETS_CONNECTOR_NAME } from '../../../shared/utils/google-sheets-fields.utils';

/**
 * The link that opens the Google Sheets tab a configuration imports.
 *
 * The configuration stores only the tab name, while a link to a tab needs its `gid`, so the
 * link is taken from the spreadsheet's tab list, the one the setup wizard picks the tab from.
 * Undefined for other sources, while the list loads, and when it cannot be loaded (for
 * example for a member who may not edit the Data Mart): the caller then links the spreadsheet.
 */
export function useSheetTabUrl(
  connectorDef: ConnectorDefinitionConfig,
  configIndex: number
): string | undefined {
  const { source } = connectorDef.connector;
  const configuration = source.configuration[configIndex] ?? {};
  const sheetName =
    typeof configuration.SheetName === 'string' ? configuration.SheetName.trim() : '';

  const { options } = useConnectorFieldOptions({
    connectorName: source.name,
    field: 'SheetName',
    configuration,
    dependsOn: ['SpreadsheetId'],
    enabled: source.name === GOOGLE_SHEETS_CONNECTOR_NAME && sheetName !== '',
  });

  return options.find(option => option.value.trim() === sheetName)?.url;
}
