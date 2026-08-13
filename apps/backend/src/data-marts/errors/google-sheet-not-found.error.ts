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
 *   throw new GoogleSheetNotFound(sheetNotFoundMessage(spreadsheetId, sheetId));
 *
 * Detection:
 *   if (error instanceof GoogleSheetNotFound) { logger.warn(...) }
 */

export class GoogleSheetNotFound extends BusinessViolationException {
  constructor(message: string, errorDetails?: Record<string, unknown>) {
    super(message, errorDetails);
    this.name = 'GoogleSheetNotFound';
  }
}

/**
 * Message shown when the destination tab is gone from a spreadsheet OWOX can still read.
 *
 * `sheetId` is the numeric Google tab ID captured when the report was created. It stays
 * valid until someone deletes that tab, or an import re-creates the spreadsheet's tabs —
 * both hand out new IDs, so a tab with the same name is still a different tab. That ID
 * means nothing to the reader, so the remediation comes first and the IDs stay at the
 * end for support.
 *
 * Written once here because both the run-time writer and the setup-time access validator
 * report the same condition, and the user sees this text verbatim in Run History and in
 * the report's last-run error.
 */
export function sheetNotFoundMessage(spreadsheetId: string, sheetId: number): string {
  return (
    `Can't find the tab this report writes to. ` +
    `Someone deleted it, or an import replaced the tabs of this spreadsheet. ` +
    `Open the report's destination settings and select an existing tab. ` +
    `(spreadsheet: ${spreadsheetId}, tab ID: ${sheetId})`
  );
}

/**
 * Message shown when the spreadsheet itself cannot be opened: deleted, trashed, or no
 * longer shared with the connected Google account. Distinct from
 * {@link sheetNotFoundMessage} — here OWOX never got far enough to look at tabs.
 */
export function spreadsheetNotAccessibleMessage(spreadsheetId: string, reason: string): string {
  return (
    `Can't open the Google spreadsheet this report writes to. ` +
    `Check that it still exists, and that the connected Google account has Editor access. ` +
    `(spreadsheet: ${spreadsheetId}). Details: ${reason}`
  );
}
