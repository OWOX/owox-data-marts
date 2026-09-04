export class AddGoogleSheetToSpreadsheetCommand {
  constructor(
    public readonly destinationId: string,
    public readonly projectId: string,
    /** The existing spreadsheet the new sheet (tab) is added to. */
    public readonly spreadsheetId: string,
    /** Wanted sheet title; sanitized to what Google accepts. */
    public readonly title: string,
    /** Requesting user id — used to resolve an email when the token carries none. */
    public readonly requestedByUserId?: string,
    /** Requesting user email — the spreadsheet must be shared with them (checked, never granted). */
    public readonly userEmail?: string
  ) {}
}
