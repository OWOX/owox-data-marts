import type { ConnectorListItem } from '../model/types/connector';

/**
 * True when the item is a custom (builder-authored) connector that has never been
 * published.
 *
 * A custom connector's `version` is a snapshot of its ACTIVE version, which the API
 * reports as null while no version has been published — mapped to `undefined` here.
 * The backend serves published manifests only (see `ConnectorDefinitionService`), so
 * such a connector has no specification and no fields to fetch, and it cannot run.
 * Bundled connectors carry no version at all and are never unpublished.
 */
export function isUnpublishedCustomConnector(connector: ConnectorListItem): boolean {
  return connector.isCustom === true && connector.version === undefined;
}
