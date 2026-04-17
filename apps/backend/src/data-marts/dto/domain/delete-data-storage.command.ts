export class DeleteDataStorageCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly userId: string = '',
    public readonly roles: string[] = []
  ) {}
}
