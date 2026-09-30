import type { ConnectorListItem } from './types/connector';

/**
 * What the Data Mart wizard's `connector_setup` events say about the connector. A custom
 * connector's name is only unique within its project, so its id is what ties these events to
 * the connector builder's.
 */
export function connectorSetupProperties(connector: ConnectorListItem | null | undefined) {
  return connector?.isCustom
    ? {
        isCustom: true,
        connectorId: connector.id ?? null,
        connectorVersion: connector.version ?? null,
      }
    : { isCustom: false };
}
