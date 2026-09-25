import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Connectors, Core } from '@owox/connectors';

/**
 * Shared building blocks for configuration-time connector previews (dynamic
 * fields, dynamic field options): an inert connector config, in-process source
 * creation, a bounded timeout, and provider error → HTTP error mapping.
 */

const CONNECTOR_PREVIEW_TIMEOUT_MS = 15_000;

class ConnectorPreviewTimeoutError extends Error {}

export interface ConnectorPreviewErrorMessages {
  /** Public message of the 504 returned when the lookup exceeds the preview timeout. */
  timeout: string;
  /** Public message of the 500 returned for an unclassified failure. */
  unexpected: string;
  /** Log line written next to the unclassified failure. */
  unexpectedLog: string;
}

/**
 * The slice of a connector source a configuration-time preview relies on. The package's
 * shipped declarations type `Core` as an index signature, so naming the shape here is what
 * keeps an `any` from leaking out of this module.
 */
export interface ConnectorPreviewSource {
  context: { validate(): void };
  fetchFieldsSchema(signal: AbortSignal): Promise<unknown>;
  fetchFieldOptions(fieldName: string, signal: AbortSignal): Promise<unknown>;
}

/**
 * Builds a connector context that never touches persistence or run state: previews run
 * in-process and must leave no trace in the data mart.
 *
 * `emit` is replaced because the base context speaks the connector event protocol by writing
 * JSON to process.stdout — which is how a SPAWNED connector talks to its runner. A preview
 * runs inside the backend itself, where that stdout belongs to the server and nothing is
 * listening for connector events, so they go to the logger instead.
 *
 * Replaced on the INSTANCE rather than by subclassing: several specs stub @owox/connectors
 * with a minimal Core, and a module-scope `class X extends Core.AbstractContext` is evaluated
 * at import time, so those suites fail to load outright with "Class extends value undefined".
 */
function createConnectorPreviewContext(
  init: Record<string, unknown>,
  logger: Logger
): { emit: (event: { toJSON(): unknown }) => void } {
  const context = new Core.AbstractContext(init);
  context.emit = (event: { toJSON(): unknown }): void => {
    logger?.debug(JSON.stringify(event.toJSON()));
  };
  return context;
}

function getConnectorSourceClass(connectorName: string): unknown {
  return Connectors[connectorName]?.[`${connectorName}Source`];
}

export function connectorSourceImplements(connectorName: string, method: string): boolean {
  const SourceClass = getConnectorSourceClass(connectorName) as
    | { prototype?: Record<string, unknown> }
    | undefined;
  return typeof SourceClass?.prototype?.[method] === 'function';
}

export function createConnectorPreviewSource(
  connectorName: string,
  configuration: Record<string, unknown>,
  logger: Logger
): ConnectorPreviewSource {
  const SourceClass = Connectors[connectorName][`${connectorName}Source`];

  // The web sends the configuration as the form holds it, so it is converted to the
  // { value, items } shape a run gets from ConnectorSourceConfigService; without that,
  // AuthType of a Google Sheets preview read as missing.
  const { config } = new Core.SourceConfigDto({ name: connectorName, config: configuration });
  // Storage and run config are required by the context but inert here: a preview only ever
  // reads the source's own schema, so there is no destination to write and no run to record.
  const context = createConnectorPreviewContext(
    {
      source: { name: connectorName, config },
      storage: { name: 'unused', config: {} },
      runConfig: {},
      env: { datamartId: null, runId: null },
    },
    logger
  );

  return new SourceClass(context) as ConnectorPreviewSource;
}

export async function withConnectorPreviewTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMessage: string
): Promise<T> {
  const abortController = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      abortController.abort();
      reject(new ConnectorPreviewTimeoutError(timeoutMessage));
    }, CONNECTOR_PREVIEW_TIMEOUT_MS);
  });

  try {
    return await Promise.race([work(abortController.signal), deadline]);
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new ConnectorPreviewTimeoutError(timeoutMessage);
    }
    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export function mapConnectorPreviewError(
  error: unknown,
  logger: Logger,
  messages: ConnectorPreviewErrorMessages
): HttpException {
  if (error instanceof HttpException) {
    return error;
  }
  if (error instanceof ConnectorPreviewTimeoutError) {
    return new GatewayTimeoutException(messages.timeout);
  }

  const status = extractProviderStatus(error);
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (status === 401 || looksLikeAuthenticationFailure(normalizedMessage)) {
    // The application client reserves HTTP 401 for the OWOX login session.
    return new BadRequestException('Connector credentials are invalid or expired');
  }
  if (status === 403) {
    return new ForbiddenException(message);
  }
  if (
    status === 400 ||
    status === 404 ||
    isConnectorConfigurationError(error) ||
    looksLikeConfigurationFailure(normalizedMessage)
  ) {
    return new BadRequestException({ message });
  }
  if (status === 429 || (status !== undefined && status >= 500) || isProviderRequestError(error)) {
    return new BadGatewayException('Connector provider is temporarily unavailable');
  }

  logger.error(messages.unexpectedLog, error);
  return new InternalServerErrorException(messages.unexpected);
}

function extractProviderStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const record = error as Record<string, unknown>;
  for (const value of [record.statusCode, record.status]) {
    if (typeof value === 'number') {
      return value;
    }
  }

  if (record.response && typeof record.response === 'object') {
    const responseStatus = (record.response as Record<string, unknown>).status;
    if (typeof responseStatus === 'number') {
      return responseStatus;
    }
  }

  return extractProviderStatus(record.cause);
}

function isProviderRequestError(error: unknown): boolean {
  return error instanceof Error && error.name === 'HttpRequestException';
}

function isConnectorConfigurationError(error: unknown): boolean {
  if (error instanceof Core.ConnectorConfigurationException) {
    return true;
  }
  if (!error || typeof error !== 'object') {
    return false;
  }
  return isConnectorConfigurationError((error as Record<string, unknown>).cause);
}

function looksLikeAuthenticationFailure(message: string): boolean {
  return [
    'access token',
    'authentication failed',
    'failed to get access token',
    'invalid credential',
    'invalid_grant',
    'token error',
  ].some(fragment => message.includes(fragment));
}

function looksLikeConfigurationFailure(message: string): boolean {
  return [
    'no headers found',
    'no columns selected',
    'header row',
    'spreadsheet not found',
    'sheet not found',
    'unsupported google sheets authentication type',
  ].some(fragment => message.includes(fragment));
}
