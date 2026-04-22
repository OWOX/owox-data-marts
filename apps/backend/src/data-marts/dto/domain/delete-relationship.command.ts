export class DeleteRelationshipCommand {
  constructor(
    public readonly relationshipId: string,
    public readonly sourceDataMartId: string,
    public readonly userId: string,
    public readonly projectId: string,
    public readonly roles: string[]
  ) {}
}
