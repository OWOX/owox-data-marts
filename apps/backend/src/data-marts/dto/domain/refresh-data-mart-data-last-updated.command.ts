export class RefreshDataMartDataLastUpdatedCommand {
  constructor(
    public readonly ids: string[],
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}
