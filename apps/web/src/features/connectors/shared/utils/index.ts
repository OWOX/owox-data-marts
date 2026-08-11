import type { ConnectorConfig } from '../../../data-marts/edit';
import { ConnectorBuilderApiService } from '../../../connector-builder/shared/api/connector-builder-api.service';
import type { CustomConnectorListItemDto } from '../../../connector-builder/shared/api/types';
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

async function loadCustomConnectors(): Promise<ConnectorListItem[]> {
  const customs: CustomConnectorListItemDto[] = await new ConnectorBuilderApiService().list();
  return customs.map(c => ({
    name: c.name,
    displayName: c.title || c.name,
    description: c.description ?? '',
    logoBase64: c.logo,
    docUrl: c.docUrl,
    isCustom: true,
    id: c.id,
    version: c.activeVersion ?? undefined,
  }));
}

/**
 * Finds connector info for a DataMart, loading connectors list if needed.
 * Bundled connectors are checked first; if not found, falls through to the
 * custom (DB) connector list. Custom connectors are project-scoped and can be
 * created/published mid-session, so they are not permanently cached. A fetch
 * failure degrades to "not found" (no throw).
 * @param name - The connector name to look up
 * @returns ConnectorListItem if found, or null otherwise
 */
export async function getConnectorInfoByName(name: string): Promise<ConnectorListItem | null> {
  const bundled = (await getConnectors()).find(c => c.name === name);
  if (bundled) {
    return bundled;
  }

  // Fetch fresh — custom (DB) connectors can be created/published mid-session.
  try {
    const customs = await loadCustomConnectors();
    return customs.find(c => c.name === name) ?? null;
  } catch {
    return null;
  }
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
