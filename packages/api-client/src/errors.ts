export type OWOXApiErrorOptions = {
  status?: number;
  code?: string;
  details?: unknown;
  cause?: unknown;
};

export class OWOXApiError extends Error {
  status?: number;
  code?: string;
  details?: unknown;

  constructor(message: string, options: OWOXApiErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export class OWOXAuthError extends OWOXApiError {}

export class OWOXConfigError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'OWOXConfigError';
  }
}

export function createNetworkError(apiOrigin: string, cause: unknown): OWOXApiError {
  return new OWOXApiError(
    `Unable to reach OWOX Data Marts API at ${apiOrigin}. Check OWOX_API_ORIGIN and network connectivity.`,
    {
      code: 'NETWORK_ERROR',
      cause,
    }
  );
}

type ErrorResponseBody = {
  code?: unknown;
  error?: unknown;
  message?: unknown;
  details?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readErrorCode(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  const { code, error } = body as ErrorResponseBody;
  if (typeof code === 'string' && code) {
    return code;
  }

  if (typeof error === 'string' && error) {
    return error;
  }

  return undefined;
}

function readErrorMessage(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  const { message } = body as ErrorResponseBody;
  return typeof message === 'string' && message ? message : undefined;
}

function readErrorDetails(body: unknown): unknown {
  if (!isRecord(body)) {
    return body;
  }

  const { details } = body as ErrorResponseBody;
  return details === undefined ? body : details;
}

export function createHttpError(
  response: Response,
  body: unknown,
  options: { auth?: boolean } = {}
): OWOXApiError {
  const code = readErrorCode(body);
  const responseMessage = readErrorMessage(body);
  const statusText = response.statusText || 'HTTP error';
  const message = responseMessage
    ? `OWOX API request failed with ${response.status} ${statusText}: ${responseMessage}`
    : `OWOX API request failed with ${response.status} ${statusText}`;
  const ErrorClass = options.auth || response.status === 401 ? OWOXAuthError : OWOXApiError;

  return new ErrorClass(message, {
    status: response.status,
    code,
    details: readErrorDetails(body),
  });
}
