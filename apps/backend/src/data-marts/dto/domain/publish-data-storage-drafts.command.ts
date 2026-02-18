export class PublishDataStorageDraftsCommand {
  constructor(
    public readonly dataStorageId: string,
    public readonly projectId: string,
    public readonly userId: string
  ) {}
}
