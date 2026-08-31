export enum DataDestinationType {
  GOOGLE_SHEETS = 'GOOGLE_SHEETS',
  LOOKER_STUDIO = 'LOOKER_STUDIO',
  EXCEL = 'EXCEL',

  // Enterprise edition only
  EMAIL = 'EMAIL',
  SLACK = 'SLACK',
  MS_TEAMS = 'MS_TEAMS',
  GOOGLE_CHAT = 'GOOGLE_CHAT',
}

export function toHumanReadable(type: DataDestinationType): string {
  switch (type) {
    case DataDestinationType.GOOGLE_SHEETS:
      return 'Google Sheets';
    case DataDestinationType.LOOKER_STUDIO:
      return 'Data Studio';
    case DataDestinationType.EXCEL:
      return 'Microsoft Excel';
    case DataDestinationType.EMAIL:
      return 'Email';
    case DataDestinationType.SLACK:
      return 'Slack';
    case DataDestinationType.MS_TEAMS:
      return 'Microsoft Teams';
    case DataDestinationType.GOOGLE_CHAT:
      return 'Google Chat';
    default:
      return type;
  }
}

export function isEmailBasedDataDestinationType(type: DataDestinationType): boolean {
  return (
    type === DataDestinationType.EMAIL ||
    type === DataDestinationType.SLACK ||
    type === DataDestinationType.MS_TEAMS ||
    type === DataDestinationType.GOOGLE_CHAT
  );
}

/**
 * Destinations the server cannot write into: the consumer asks for the data instead.
 *
 * Looker Studio calls the connector; Excel reads the report over the HTTP data endpoint,
 * because the workbook lives on the user's machine and no server can reach it. Reports on
 * these destinations therefore have no server-side run — see ReportRunService.createPending.
 */
export function isPullBasedDataDestinationType(type: DataDestinationType): boolean {
  return type === DataDestinationType.LOOKER_STUDIO || type === DataDestinationType.EXCEL;
}

/**
 * Destinations that hold a secret of their own.
 *
 * Every other type stores something the server needs in order to reach the destination — a
 * service account, a webhook URL, a connector key. Excel stores nothing: the add-in
 * authenticates as the user and pulls its own data, so there is no credential to keep, and
 * inventing an empty one would put a meaningless row in the credential table.
 */
export function requiresCredentials(type: DataDestinationType): boolean {
  return type !== DataDestinationType.EXCEL;
}

/**
 * Destinations that render a field from a joined Data Mart as `Field name (Data Mart name)`.
 * Everywhere else the Data Mart name stays a prefix: `Data Mart name Field name`.
 *
 * Both spreadsheet destinations write the label into a header cell, which is narrow and not
 * resizable per column by the reader — a leading Data Mart name pushes the field name out of view
 * on every column at once. The other destinations render the label with enough room that the
 * prefix reads fine, so they keep it.
 *
 * Excel qualifies on that same ground, but reaches the label by a different road than Google
 * Sheets: nothing pushes rows into a workbook, so its add-in pulls the worksheet header from
 * `GET /reports/:id/output-schema`, which resolves the style from the Report. This opt-in is what
 * that header follows, and it is the only surface it reaches.
 *
 * It deliberately does NOT reach the same report's stream metadata or run record. Those are built
 * from a `ReportLikeReadPlan`, which drops `dataDestination` on purpose (see `streamReport` in
 * `stream-http-data.service.ts`) so that NDJSON — where a prefix has room to read fine — does not
 * change shape just because a report happens to write to a spreadsheet. So the two differ by
 * design: suffix in the worksheet header, prefix in the recorded run. Nothing keys on either.
 *
 * What this pins is the POSITION of the Data Mart name, not a byte-exact label: every surface
 * still normalizes whitespace (see `formatBlendedFieldDisplayName`), and no consumer keys on the
 * label anyway — Looker Studio matches its schema fields by `SchemaField.name`, MCP selects by
 * exact field name, and the HTTP data endpoint pairs each `title` with a `name`.
 *
 * New destination types default to the prefix; opt in here deliberately.
 */
export function usesSuffixedJoinedFieldNames(type: DataDestinationType): boolean {
  return type === DataDestinationType.GOOGLE_SHEETS || type === DataDestinationType.EXCEL;
}
