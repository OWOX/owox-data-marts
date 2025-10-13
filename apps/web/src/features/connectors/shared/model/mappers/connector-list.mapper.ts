import type { ConnectorDefinitionDto } from '../../api';
import type { ConnectorListItem } from '../types/connector';

export function mapConnectorListFromDto(
  connectorsDto: ConnectorDefinitionDto[]
): ConnectorListItem[] {
  return connectorsDto
    .map(connector => ({
      name: connector.name,
      displayName: connector.title ?? connector.name,
      description: connector.description ?? '',
      logoBase64: connector.logo,
      docUrl: connector.docUrl,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
