import { trackEvent } from '../../../../utils/data-layer';
import type { BuilderManifest } from './manifest.types';

const ACTIONS = {
  custom_connector_builder_opened: 'Opened',
  custom_connector_guide_opened: 'GuideOpened',
  custom_connector_imported: 'Imported',
  custom_connector_exported: 'Exported',
  custom_connector_mode_switched: 'ModeSwitched',
  custom_connector_test_run: 'TestRun',
  custom_connector_fields_discovered: 'FieldsDiscovered',
  custom_connector_created: 'Created',
  custom_connector_published: 'Published',
  custom_connector_version_activated: 'VersionActivated',
  custom_connector_deleted: 'Deleted',
  custom_connector_error: 'Error',
  custom_connector_version_pinned: 'VersionPinned',
} as const;

export type CustomConnectorEvent = keyof typeof ACTIONS;

/** What an event knows about the connector: the manifest in the builder, the list entry elsewhere. */
export interface CustomConnectorRef {
  id?: string | null;
  manifest?: BuilderManifest | null;
  name?: string;
  title?: string;
}

export type FailureKind =
  | 'auth'
  | 'http_4xx'
  | 'http_5xx'
  | 'timeout'
  | 'invalid_manifest'
  | 'other';

/**
 * The host of the connector's API, e.g. `api.impact.com`. Only the host: the path and the
 * query string of a base URL can hold account ids and keys.
 */
export function apiHostOf(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  try {
    const { hostname } = new URL(baseUrl);
    return /^[a-z0-9.-]+$/i.test(hostname) ? hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * The kind of a failed test or write, from its message. The message itself is not sent: it can
 * quote the request URL and the API's response.
 */
export function describeFailure(message: string): {
  errorKind: FailureKind;
  httpStatus: number | null;
} {
  const status = /\bHTTP (\d{3})\b/.exec(message);
  if (status) {
    const httpStatus = Number(status[1]);
    const errorKind =
      httpStatus === 401 || httpStatus === 403
        ? 'auth'
        : httpStatus < 500
          ? 'http_4xx'
          : 'http_5xx';
    return { errorKind, httpStatus };
  }
  if (/timed out|timeout/i.test(message)) return { errorKind: 'timeout', httpStatus: null };
  if (/configuration|manifest/i.test(message)) {
    return { errorKind: 'invalid_manifest', httpStatus: null };
  }
  return { errorKind: 'other', httpStatus: null };
}

/** An empty name or title is as good as none. */
const textOrNull = (value: string | undefined): string | null =>
  value !== undefined && value.length > 0 ? value : null;

function connectorProperties({ id, manifest, name, title }: CustomConnectorRef) {
  const nodes = manifest ? Object.values(manifest.nodes) : null;
  const strategies = nodes
    ? [...new Set(nodes.map(node => node.incremental?.strategy ?? 'none'))]
        .filter(strategy => strategy !== 'none')
        .sort()
    : null;
  return {
    connectorId: id ?? null,
    connectorName: textOrNull(manifest ? manifest.name : name),
    connectorTitle: textOrNull(manifest ? manifest.title : title),
    apiHost: apiHostOf(manifest?.baseUrl),
    nodesCount: nodes ? nodes.length : null,
    authType: manifest ? (manifest.authentication?.type ?? 'none') : null,
    dateStrategies: strategies ? (textOrNull(strategies.join(',')) ?? 'none') : null,
  };
}

export function trackCustomConnectorEvent(
  event: CustomConnectorEvent,
  connector: CustomConnectorRef,
  properties: Record<string, unknown> & { action?: string } = {}
): void {
  const { action, ...rest } = properties;
  const described = connectorProperties(connector);
  trackEvent({
    event,
    category: 'CustomConnector',
    action: action ?? ACTIONS[event],
    label: described.connectorName ?? undefined,
    ...described,
    ...rest,
  });
}
