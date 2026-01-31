export class SyncLegacyDataMartsByProjectCommand {
  constructor(
    public readonly projectId: string,
    public readonly gcpProjectId: string
  ) {}
}
