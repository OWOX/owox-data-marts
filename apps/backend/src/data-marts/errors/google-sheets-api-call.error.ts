/**
 * A Google Sheets API call failed while a report was being written. Replaces the
 * bare Google text ("Internal error encountered.", "The service is currently
 * unavailable.") with the step that failed, the HTTP status, how many attempts
 * were made and what the user can do — the user sees this message verbatim in
 * Run History and in the report's last-run error.
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
 * @param attempts - how many times the call was sent (1 when it was not retried)
 */
export function googleSheetsApiCallMessage(
  step: string,
  status: number,
  googleMessage: string,
  attempts: number
): string {
  const whileStep = `while ${step.charAt(0).toLowerCase()}${step.slice(1)}`;
  const googleSays = `Google responded with HTTP ${status}: ${googleMessage.trim()}`;
  const retried = attempts > 1 ? ` OWOX tried ${attempts} times.` : '';

  if (status === 429) {
    return (
      `Google Sheets quota was exceeded ${whileStep}. ${googleSays}${retried} ` +
      `Too many reports may be writing with the same Google account at the same time — ` +
      `spread their schedules apart or run the report again later.`
    );
  }

  if (status >= 500) {
    return (
      `Google Sheets did not complete the request ${whileStep}. ${googleSays}${retried} ` +
      `This is a temporary error on Google's side. It happens more often in spreadsheets ` +
      `that are slow to update — for example when formulas on other sheets read whole ` +
      `columns of the report's sheet. Run the report again, or deliver it to a separate ` +
      `spreadsheet and reference it from there.`
    );
  }

  return `Google Sheets rejected the request ${whileStep}. ${googleSays}${retried}`;
}
