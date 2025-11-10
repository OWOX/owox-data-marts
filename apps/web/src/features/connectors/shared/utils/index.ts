import type { ConnectorConfig } from '../../../data-marts/edit';
import { ConnectorApiService } from '../api/connector-api.service.ts';
import type { ConnectorDefinitionDto } from '../api/index.ts';
import { mapConnectorListFromDto } from '../model/mappers/connector-list.mapper.ts';
import type { ConnectorListItem } from '../model/types/connector.ts';

// Module-level cache for connectors list
let connectorsCache: ConnectorListItem[] | null = null;

async function getConnectors(): Promise<ConnectorListItem[]> {
  if (connectorsCache) {
    return connectorsCache;
  }

  const connectorsDto = await loadConnectors();
  connectorsCache = mapConnectorListFromDto(connectorsDto);
  return connectorsCache;
}

/**
 * Loads and caches the list of available connectors
 * Uses module-level cache to ensure only one API call during the app lifetime
 */
async function loadConnectors(): Promise<ConnectorDefinitionDto[]> {
  const connectorApiService = new ConnectorApiService();
  return await connectorApiService.getAvailableConnectors();
}

/**
 * Finds connector info for a DataMart, loading connectors list if needed
 * @param dataMart - The data mart to get connector info for
 * @returns ConnectorListItem if found, or null otherwise
 */
export async function getConnectorInfoByName(name: string): Promise<ConnectorListItem | null> {
  const connectors = await getConnectors();

  // If no connectors loaded
  if (connectors.length === 0) {
    return null;
  }

  const connectorInfo = connectors.find(c => c.name === name);

  return connectorInfo ?? null;
}

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
