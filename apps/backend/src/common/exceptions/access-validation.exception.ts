import { BusinessViolationException } from './business-violation.exception';

export class AccessValidationException extends BusinessViolationException {
  constructor(
    readonly message: string,
    readonly errorDetails?: Record<string, unknown>
  ) {
    super(message, errorDetails);
  }
}
