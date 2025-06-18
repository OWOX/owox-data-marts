export class DeleteDataStorageCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string
  ) {}
}
