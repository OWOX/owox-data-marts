export class ReconnectGoogleSheetCommand {
  constructor(
    public readonly reportId: string,
    public readonly projectId: string,
    public readonly userId: string = '',
    public readonly roles: string[] = []
  ) {}
}
