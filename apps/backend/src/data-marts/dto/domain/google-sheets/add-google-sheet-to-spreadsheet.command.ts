export class AddGoogleSheetToSpreadsheetCommand {
  constructor(
    public readonly destinationId: string,
    public readonly projectId: string,
    /** The existing spreadsheet the new sheet (tab) is added to. */
    public readonly spreadsheetId: string,
    /** Wanted sheet title; sanitized to what Google accepts. */
    public readonly title: string
  ) {}
}
