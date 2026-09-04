/** Identifiers of a sheet (tab) freshly added to an existing spreadsheet. */
export class AddedGoogleSheetDto {
  constructor(
    public readonly spreadsheetId: string,
    /** Numeric ID (gid) of the added sheet. */
    public readonly sheetId: number,
    /** The sheet title as Google stored it. */
    public readonly sheetTitle: string,
    /**
     * True when the spreadsheet is confirmed to be shared with the requesting
     * user (directly, through their domain, or with anyone). False when that
     * could not be confirmed — no Drive scope, unknown email, group-only
     * sharing, or a failed lookup — so the caller can warn that opening the
     * link may require requesting access. Nothing is ever granted here.
     */
    public readonly sharedWithRequester: boolean
  ) {}
}
