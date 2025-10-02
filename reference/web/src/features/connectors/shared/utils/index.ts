import type { ConnectorConfig } from '../../../data-marts/edit';
import type { ConnectorListItem } from '../model/types/connector.ts';

/**
 * Gets the display name for a connector
 * @param connector The connector configuration
 * @param connectorsList List of available connectors with display names
 * @returns The display name of the connector, or the source name if not found
 */
export function getConnectorDisplayName(
  connector: ConnectorConfig,
  connectorsList: ConnectorListItem[]
): string {
  const connectorInfo = connectorsList.find(c => c.name === connector.source.name);
  return connectorInfo?.displayName ?? connector.source.name;
}
