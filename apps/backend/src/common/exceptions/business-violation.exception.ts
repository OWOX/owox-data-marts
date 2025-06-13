import { BaseException } from './base.exception';

export class BusinessViolationException extends Error implements BaseException {
  constructor(
    readonly message: string,
    readonly errorDetails?: Record<string, unknown>
  ) {
    super(message);
  }
}
