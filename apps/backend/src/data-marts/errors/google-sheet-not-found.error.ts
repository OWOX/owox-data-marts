import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

/**
 * Error thrown when a Google Sheets spreadsheet or sheet (tab) cannot be found or accessed.
 *
 * Extends BusinessViolationException so that it is logged at WARNING level
 * throughout the error handling chain (both in executeWithErrorHandling
 * and in RunReportService). The report still fails, but the log level
 * reflects that this is an expected user-configuration issue,
 * not an unexpected system failure.
 *
 * Usage:
 *   throw new GoogleSheetNotFound('Failed to find sheet 123 in spreadsheet abc');
 *
 * Detection:
 *   if (error instanceof GoogleSheetNotFound) { logger.warn(...) }
 */

export class GoogleSheetNotFound extends BusinessViolationException {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSheetNotFound';
  }
}
