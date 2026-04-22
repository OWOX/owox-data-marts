export class ListRelationshipsCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}
