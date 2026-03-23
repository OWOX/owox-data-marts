import { BusinessViolationException } from './business-violation.exception';

export class ConcurrencyLimitExceededException extends BusinessViolationException {
  constructor(message: string, errorDetails?: Record<string, unknown>) {
    super(message, errorDetails);
  }
}
