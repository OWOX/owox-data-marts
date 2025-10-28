import type { DataMart, ConnectorDefinitionConfig } from '../types';
import { DataMartDefinitionType } from '../../../shared';
import { ConnectorApiService } from '../../../../connectors/shared/api';
import { mapConnectorListFromDto } from '../../../../connectors/shared/model/mappers/connector-list.mapper';
import type { ConnectorListItem } from '../../../../connectors/shared/model/types/connector';

/**
 * Fetches connector info for a DataMart if definition type is CONNECTOR
 * @param dataMart - The data mart to get connector info for
 * @returns ConnectorListItem if found, existing value if already loaded, or null otherwise
 */
export async function getConnectorInfo(dataMart: DataMart): Promise<ConnectorListItem | null> {
  // Only process if definition type is CONNECTOR and definition exists
  if (dataMart.definitionType !== DataMartDefinitionType.CONNECTOR || !dataMart.definition) {
    return null;
  }

  try {
    const connectorApiService = new ConnectorApiService();
    const connectorsDto = await connectorApiService.getAvailableConnectors();
    const connectors = mapConnectorListFromDto(connectorsDto);

    const connectorDef = dataMart.definition as ConnectorDefinitionConfig;
    const connectorInfo = connectors.find(c => c.name === connectorDef.connector.source.name);

    return connectorInfo ?? null;
  } catch (error) {
    console.error('Failed to fetch connector info:', error);
    return null;
  }
}
