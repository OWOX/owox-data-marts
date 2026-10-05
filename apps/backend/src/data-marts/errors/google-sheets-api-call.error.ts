/**
 * A Google Sheets API call failed while a report was being written. Replaces
 * Google's bare text ("Internal error encountered.", "The service is currently
 * unavailable.") with the cause in plain words and what the user can do — the
 * user sees this message verbatim in Run History and in the report's last-run
 * error. The HTTP status and the original error stay on the object for logs.
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
 * Whether a failed call means Google did not manage to apply a write, as opposed
 * to rejecting it. Every writer step runs after the spreadsheet opened at the
 * start of the run, so a 404 here is not a missing spreadsheet: on a spreadsheet
 * that recalculates slowly, the same report fails with 404, 500 and 503 at the
 * same step on different days. A spreadsheet or sheet that is really gone fails
 * the next run at its start, with its own message (see GoogleSheetNotFound).
 */
function isUnfinishedUpdate(status: number): boolean {
  return status === 404 || status >= 500;
}

/**
 * @param step - what the writer was doing, e.g. "Writing and formatting column headers"
 * @param status - HTTP status Google returned
 * @param googleMessage - Google's own error text, kept as the trailing details
 */
export function googleSheetsApiCallMessage(
  step: string,
  status: number,
  googleMessage: string
): string {
  const details = `Details: ${googleMessage.trim()}`;

  if (isUnfinishedUpdate(status)) {
    return (
      `Google Sheets couldn't finish updating the spreadsheet this report writes to. ` +
      `This usually happens when the spreadsheet recalculates heavy formulas after every ` +
      `change — for example, formulas on other sheets that read whole columns of the ` +
      `report's sheet. To fix it, open the spreadsheet, go to File → Settings → ` +
      `Calculation, turn on Iterative calculation, and run the report again. If it still ` +
      `fails, limit those formulas to the rows they need or send the report to a separate ` +
      `spreadsheet. A single failure can also be a temporary problem on Google's side; ` +
      `then just run the report again. ${details}`
    );
  }

  const whileStep = `while ${step.charAt(0).toLowerCase()}${step.slice(1)}`;
  return `Google Sheets rejected an update ${whileStep}. ${details}`;
}
