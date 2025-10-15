/**
 * Error class for connector execution errors.
 * @extends Error
 * @param message - The error message
 * @param stack - The error stack
 * @param meta - The error metadata object (like dataMartId, projectId, runId, configId, etc.)
 */
export class ConnectorExecutionError extends Error {
  constructor(
    message: string,
    stack?: string,
    public readonly meta?: unknown
  ) {
    super(message);
    this.name = 'ConnectorExecutionError';
    this.stack = stack || this.stack;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConnectorExecutionError);
    }
  }
}
