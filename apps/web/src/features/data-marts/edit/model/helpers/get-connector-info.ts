import type { DataMart, ConnectorDefinitionConfig } from '../types';
import { DataMartDefinitionType } from '../../../shared';
import type { ConnectorListItem } from '../../../../connectors/shared/model/types/connector';
import { ConnectorApiService } from '../../../../connectors/shared/api';
import { mapConnectorListFromDto } from '../../../../connectors/shared/model/mappers/connector-list.mapper';

// Module-level cache for connectors list
let connectorsCache: ConnectorListItem[] | null = null;

/**
 * Loads and caches the list of available connectors
 * Uses module-level cache to ensure only one API call during the app lifetime
 */
async function loadConnectors(): Promise<ConnectorListItem[]> {
  if (connectorsCache !== null) {
    return connectorsCache;
  }

  const connectorApiService = new ConnectorApiService();
  const connectorsDto = await connectorApiService.getAvailableConnectors();
  connectorsCache = mapConnectorListFromDto(connectorsDto);
  return connectorsCache;
}

/**
 * Finds connector info for a DataMart, loading connectors list if needed
 * @param dataMart - The data mart to get connector info for
 * @returns ConnectorListItem if found, or null otherwise
 */
export async function getConnectorInfo(dataMart: DataMart): Promise<ConnectorListItem | null> {
  // Only process if definition type is CONNECTOR and definition exists
  if (dataMart.definitionType !== DataMartDefinitionType.CONNECTOR || !dataMart.definition) {
    return null;
  }

  const connectors = await loadConnectors();

  // If no connectors loaded
  if (connectors.length === 0) {
    return null;
  }

  const connectorDef = dataMart.definition as ConnectorDefinitionConfig;
  const connectorInfo = connectors.find(c => c.name === connectorDef.connector.source.name);

  return connectorInfo ?? null;
}
