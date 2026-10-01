import { trackCustomConnectorEvent } from '../../../connector-builder/shared/model/analytics';
import type { ConnectorListItem } from './types/connector';

/**
 * What the Data Mart wizard's `connector_setup` events say about the connector. A custom
 * connector's name is only unique within its project, so its id is what ties these events to
 * the connector builder's. `savedVersion` is the version the Data Mart is saved with: the
 * connector's own `version` is its active one. A bundled connector sends nulls, as GTM keeps
 * the last value pushed for a key a push leaves out.
 */
export function connectorSetupProperties(
  connector: ConnectorListItem | null | undefined,
  savedVersion: number | undefined
) {
  return connector?.isCustom
    ? {
        isCustom: true,
        connectorId: connector.id ?? null,
        connectorVersion: savedVersion ?? connector.version ?? null,
        versionPinned: savedVersion !== undefined,
      }
    : { isCustom: false, connectorId: null, connectorVersion: null, versionPinned: null };
}

/** The part of a Data Mart's connector source a pin lives in. */
interface PinnedSource {
  name: string;
  version?: number;
}

/**
 * Reports a Data Mart saved with a different pin of its custom connector than it had. A pick in
 * the version popover is only a pick until the Data Mart is saved with it.
 */
export function trackSavedVersionPin(
  dataMartId: string,
  previous: PinnedSource | undefined,
  saved: PinnedSource,
  connector: ConnectorListItem | null
): void {
  if (!connector?.isCustom || connector.name !== saved.name) return;
  const before = previous?.name === saved.name ? previous.version : undefined;
  if (before === saved.version) return;
  trackCustomConnectorEvent(
    'custom_connector_version_pinned',
    { id: connector.id ?? null, name: connector.name, title: connector.displayName },
    {
      action: saved.version === undefined ? 'FollowActive' : 'Pin',
      version: saved.version ?? null,
      previousVersion: before ?? null,
      activeVersion: connector.version ?? null,
      dataMartId,
    }
  );
}
