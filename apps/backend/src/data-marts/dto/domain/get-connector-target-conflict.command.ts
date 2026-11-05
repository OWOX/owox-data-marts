export class GetConnectorTargetConflictCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly fullyQualifiedName: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}
