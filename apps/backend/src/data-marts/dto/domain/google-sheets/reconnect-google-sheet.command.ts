export class ReconnectGoogleSheetCommand {
  constructor(
    public readonly reportId: string,
    public readonly projectId: string,
    public readonly userId: string = '',
    public readonly roles: string[] = [],
    /** Sheet title to reconnect to. Falls back to the report title when omitted. */
    public readonly title?: string
  ) {}
}
