/** Identifiers of a sheet (tab) freshly added to an existing spreadsheet. */
export class AddedGoogleSheetDto {
  constructor(
    public readonly spreadsheetId: string,
    /** Numeric ID (gid) of the added sheet. */
    public readonly sheetId: number,
    /** The sheet title as Google stored it. */
    public readonly sheetTitle: string
  ) {}
}
