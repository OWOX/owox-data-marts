export class ListRelationshipsByStorageCommand {
  constructor(
    public readonly storageId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}
