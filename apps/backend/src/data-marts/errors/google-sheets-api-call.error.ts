/**
 * A Google Sheets API call failed while a report was being written. Replaces the
 * bare Google text ("Internal error encountered.", "The service is currently
 * unavailable.") with the step that failed, the HTTP status and, for server
 * errors, the most likely cause on the spreadsheet's side — the user sees this
 * message verbatim in Run History and in the report's last-run error.
 *
 * Not a BusinessViolationException: Google-side failures stay at ERROR level so
 * they remain visible in production logs.
 */
export class GoogleSheetsApiCallError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly cause: unknown
  ) {
    super(message);
    this.name = 'GoogleSheetsApiCallError';
  }
}

/**
 * @param step - what the writer was doing, e.g. "Writing and formatting column headers"
 * @param status - HTTP status Google returned
 * @param googleMessage - Google's own error text
 */
export function googleSheetsApiCallMessage(
  step: string,
  status: number,
  googleMessage: string
): string {
  const whileStep = `while ${step.charAt(0).toLowerCase()}${step.slice(1)}`;
  const googleSays = `Google responded with HTTP ${status}: ${googleMessage.trim()}`;

  if (status >= 500) {
    // Google answers 500/503 when it cannot apply a write in time. A one-off is a
    // Google-side hiccup; a failure on every run points at a spreadsheet that
    // recalculates too slowly after each of the run's writes.
    return (
      `Google Sheets could not complete the request ${whileStep}. ${googleSays} ` +
      `If this happens on every run, the spreadsheet most likely takes too long to ` +
      `recalculate after each change: check formulas that read whole columns of the ` +
      `report's sheet, and if the spreadsheet has circular references, turn on ` +
      `Iterative calculation in File → Settings → Calculation.`
    );
  }

  return `Google Sheets rejected the request ${whileStep}. ${googleSays}`;
}
