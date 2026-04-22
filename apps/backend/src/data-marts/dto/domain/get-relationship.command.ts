export class GetRelationshipCommand {
  constructor(
    public readonly relationshipId: string,
    public readonly sourceDataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}
