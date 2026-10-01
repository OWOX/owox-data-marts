import axios from 'axios';
import { extractApiError } from '../../../../app/api/extract-api-error.util';
import { trackEvent } from '../../../../utils/data-layer';
import type { BuilderManifest, ManifestNode } from './manifest.types';

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
  /** The version the builder has open, when there is one. */
  version?: number | null;
}

export type FailureKind =
  | 'auth'
  | 'permission'
  | 'conflict'
  | 'http_4xx'
  | 'http_5xx'
  | 'timeout'
  | 'network'
  | 'invalid_manifest'
  | 'invalid_configuration'
  | 'other';

/** Second-level labels that are part of a country's suffix, as in `example.co.uk`. */
const SECOND_LEVEL_SUFFIXES = new Set(['ac', 'co', 'com', 'edu', 'gov', 'ne', 'net', 'or', 'org']);

/**
 * The API's domain, e.g. `*.impact.com` for `api.impact.com`. Only the domain: the path and the
 * query string of a base URL can hold account ids and keys, and the leftmost label of a longer
 * host is often the customer's own account (`acme.zendesk.com`). An IP address names nothing
 * worth counting.
 */
export function apiHostOf(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!/^[a-z0-9.-]+$/.test(hostname) || /^[\d.]+$/.test(hostname)) return null;
  const labels = hostname.split('.');
  const tld = labels[labels.length - 1] ?? '';
  const sld = labels[labels.length - 2] ?? '';
  const domainLabels = tld.length === 2 && SECOND_LEVEL_SUFFIXES.has(sld) ? 3 : 2;
  if (labels.length <= domainLabels) return hostname;
  return `*.${labels.slice(-domainLabels).join('.')}`;
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
  if (/\binvalid manifest\b|manifest is invalid|ManifestParser/i.test(message)) {
    return { errorKind: 'invalid_manifest', httpStatus: null };
  }
  // A blank test value, not a manifest problem.
  if (/unable to load the configuration/i.test(message)) {
    return { errorKind: 'invalid_configuration', httpStatus: null };
  }
  return { errorKind: 'other', httpStatus: null };
}

/**
 * The kind of a request to OWOX itself that failed: its status and code are on the response,
 * and its text never has the engine's "HTTP nnn". A 403 here is a permission refusal, not the
 * tested API's credentials.
 */
export function describeApiFailure(error: unknown): {
  errorKind: FailureKind;
  httpStatus: number | null;
  errorCode: string | null;
} {
  if (!axios.isAxiosError(error)) return { errorKind: 'other', httpStatus: null, errorCode: null };
  const httpStatus = error.response?.status ?? null;
  const { code, message } = extractApiError(error);
  const errorCode = code ?? null;
  if (httpStatus === null) return { errorKind: 'network', httpStatus, errorCode };
  let errorKind: FailureKind;
  if (httpStatus === 403) errorKind = 'permission';
  else if (httpStatus === 409) errorKind = 'conflict';
  else if (httpStatus >= 500) errorKind = 'http_5xx';
  else if (describeFailure(message ?? '').errorKind === 'invalid_manifest') {
    errorKind = 'invalid_manifest';
  } else errorKind = 'http_4xx';
  return { errorKind, httpStatus, errorCode };
}

/** An empty name or title is as good as none, and Import JSON lets anything through. */
const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

function connectorProperties({ id, manifest, name, title, version }: CustomConnectorRef) {
  // Typed, but Import JSON and Code mode let any JSON through.
  const rawNodes = manifest?.nodes as Record<string, ManifestNode | null> | null | undefined;
  const nodes = manifest ? Object.values(rawNodes ?? {}) : null;
  const strategies = nodes
    ? [...new Set(nodes.map(node => node?.incremental?.strategy ?? 'none'))]
        .filter(strategy => strategy !== 'none')
        .sort()
    : null;
  return {
    connectorId: id ?? null,
    connectorName: textOrNull(manifest ? manifest.name : name),
    connectorTitle: textOrNull(manifest ? manifest.title : title),
    apiHost: apiHostOf(textOrNull(manifest?.baseUrl) ?? undefined),
    nodesCount: nodes ? nodes.length : null,
    authType: manifest ? (manifest.authentication?.type ?? 'none') : null,
    dateStrategies: strategies ? (textOrNull(strategies.join(',')) ?? 'none') : null,
    version: version ?? null,
  };
}

/**
 * Never throws: telemetry must not break the flow that reports it. The keys other events set
 * are sent as null, as GTM keeps the last value pushed for a key the push leaves out.
 */
export function trackCustomConnectorEvent(
  event: CustomConnectorEvent,
  connector: CustomConnectorRef,
  properties: Record<string, unknown> & { action?: string } = {}
): void {
  try {
    const { action, ...rest } = properties;
    const described = connectorProperties(connector);
    trackEvent({
      event,
      category: 'CustomConnector',
      action: action ?? ACTIONS[event],
      label: described.connectorName ?? undefined,
      context: null,
      value: null,
      error: null,
      ...described,
      ...rest,
    });
  } catch {
    // Nothing to do: an event lost is better than a user flow broken.
  }
}
