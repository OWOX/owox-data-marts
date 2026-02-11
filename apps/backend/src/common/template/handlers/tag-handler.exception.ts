import { BusinessViolationException } from 'src/common/exceptions/business-violation.exception';

/**
 * Exception thrown by tag handlers.
 */
export class TagHandlerException extends BusinessViolationException {
  constructor(readonly message: string) {
    super(message);
  }
}
