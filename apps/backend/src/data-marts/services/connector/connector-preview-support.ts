import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
// @ts-expect-error - Package lacks TypeScript declarations
import { Connectors, Core } from '@owox/connectors';

/**
 * Shared building blocks for configuration-time connector previews (dynamic
 * fields, dynamic field options): an inert connector config, in-process source
 * creation, a bounded timeout, and provider error → HTTP error mapping.
 */

export const CONNECTOR_PREVIEW_TIMEOUT_MS = 15_000;

export class ConnectorPreviewTimeoutError extends Error {}

export interface ConnectorPreviewErrorMessages {
  timeout: string;
  unexpected: string;
}

/**
 * Connector config that never touches persistence or run state: previews run
 * in-process and must leave no trace in the data mart.
 */
export class ConnectorPreviewConfig extends Core.AbstractConfig {
  private readonly logger: Logger;

  constructor(configData: Record<string, unknown>, logger: Logger) {
    super(configData);
    this.logger = logger;
  }

  handleStatusUpdate(): void {}

  updateLastImportDate(): void {}

  updateLastRequstedDate(): void {}

  isInProgress(): boolean {
    return false;
  }

  addWarningToCurrentStatus(): void {}

  logMessage(message: string): void {
    this.logger.debug(message);
  }
}

export function getConnectorSourceClass(connectorName: string): unknown {
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
) {
  const SourceClass = Connectors[connectorName][`${connectorName}Source`];
  const sourceConfig = new Core.SourceConfigDto({
    name: connectorName,
    config: configuration,
  });

  return new SourceClass(new ConnectorPreviewConfig(sourceConfig.config, logger));
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

  logger.error(messages.unexpected, error);
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
