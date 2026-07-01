export class GetRelationshipGraphCommand {
  constructor(
    public readonly rootDataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}
