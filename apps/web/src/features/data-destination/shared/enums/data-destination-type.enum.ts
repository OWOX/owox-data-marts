/**
 * Enum for data destination types
 */
export enum DataDestinationType {
  GOOGLE_SHEETS = 'GOOGLE_SHEETS',
  LOOKER_STUDIO = 'LOOKER_STUDIO',
  EXCEL = 'EXCEL',
  ODATA = 'OData',
  EMAIL = 'EMAIL',
  SLACK = 'SLACK',
  MS_TEAMS = 'MS_TEAMS',
  GOOGLE_CHAT = 'GOOGLE_CHAT',
}

/**
 * Destinations the server cannot write into: the consumer reads the report itself.
 *
 * Reports on these have no server-side run at all — it is not a permission the caller is
 * missing, so the UI explains the absence instead of only disabling the control.
 */
export function isPullBasedDestinationType(type: DataDestinationType): boolean {
  return type === DataDestinationType.LOOKER_STUDIO || type === DataDestinationType.EXCEL;
}

/**
 * What to say instead of leaving a run control greyed out, or null when the control means what
 * it usually means. Lives beside the predicate so the two controls that disable a run — the
 * play button in the row and the dropdown item — cannot drift into different explanations.
 */
export function pullBasedRunHint(type: DataDestinationType): string | null {
  if (!isPullBasedDestinationType(type)) {
    return null;
  }
  return type === DataDestinationType.EXCEL
    ? 'Refresh it from the OWOX add-in in Excel'
    : 'The destination reads this report itself';
}

/**
 * Whether a report on this destination names the document it writes into.
 *
 * One answer to what used to be asked three ways — whether the form shows a document field,
 * whether that field is validated, and which config the report is saved with. They describe the
 * same fact and drifted apart while they were separate predicates.
 *
 * Not the inverse of being pull-based: Data Studio is pulled and names no document, but so does
 * Email, which is pushed. It is a property of the config a destination stores, and it is what a
 * workbook addressable from the server would flip.
 */
export function reportNamesTargetDocument(type: DataDestinationType): boolean {
  return type === DataDestinationType.GOOGLE_SHEETS;
}

/**
 * Whether a report on this destination can be created from the web app.
 *
 * False for Excel alone: such a report is bound to the worksheet the add-in was opened from,
 * and that binding lives inside the workbook, where nothing here can write it. A report created
 * here would be one no workbook refers to — listed, unrunnable, and impossible to refresh. Not
 * the same question as being pull-based: a Data Studio report is pulled too, and is created
 * here like any other.
 *
 * An affordance, not a rule the server can enforce — the add-in creates its reports through the
 * same API a user would.
 */
export function canCreateReportInApp(type: DataDestinationType): boolean {
  return type !== DataDestinationType.EXCEL;
}

/**
 * Whether a destination of this type is something a person sets up here.
 *
 * False for Excel: the add-in resolves one on first use and it holds nothing to fill in, so
 * offering it in the type list would invite a second destination indistinguishable from the
 * automatic one — and possibly not even the one the add-in goes on to use. Existing Excel
 * destinations stay visible and editable; only the offer to create another is withheld.
 *
 * Deliberately separate from {@link canCreateReportInApp} despite agreeing today: one is about
 * a report's binding to a worksheet, the other about how the destination comes into existence,
 * and a future type could answer them differently.
 */
export function canCreateDestinationInApp(type: DataDestinationType): boolean {
  return type !== DataDestinationType.EXCEL;
}

/**
 * Destination types whose reports are listed on the Data Mart's destination cards.
 *
 * Data Studio is absent because its reports have a card of their own, OData because it has no
 * reports at all. Kept in one place so a second list — like the one the schedule form filters
 * by — is derived from this rather than written out again and left to drift.
 */
export const REPORT_DESTINATION_TYPES: readonly DataDestinationType[] = [
  DataDestinationType.GOOGLE_SHEETS,
  DataDestinationType.EXCEL,
  DataDestinationType.EMAIL,
  DataDestinationType.SLACK,
  DataDestinationType.MS_TEAMS,
  DataDestinationType.GOOGLE_CHAT,
];

/**
 * Reports a schedule can be attached to: one the server runs. A pull-based report has no
 * server-side run to put on a timer, and the backend refuses such a trigger outright — see
 * ScheduledReportRunValidator.
 */
export const SCHEDULABLE_REPORT_DESTINATION_TYPES: readonly DataDestinationType[] =
  REPORT_DESTINATION_TYPES.filter(type => !isPullBasedDestinationType(type));
