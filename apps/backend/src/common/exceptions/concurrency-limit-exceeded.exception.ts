import { BusinessViolationException } from './business-violation.exception';

export class ConcurrencyLimitExceededException extends BusinessViolationException {
  /**
   * `code` is optional so the run-trigger handlers, which catch this internally and never
   * let it reach a client, keep their existing call shape. Limits that DO answer a caller
   * (the live connector test) pass one, because a stable machine-readable code is the only
   * way a client can tell "retry in a moment" apart from any other 400 on the same route.
   */
  constructor(message: string, errorDetails?: Record<string, unknown>, code?: string) {
    super(message, errorDetails, code);
  }
}
